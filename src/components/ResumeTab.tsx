"use client";

import { useState } from "react";
import { hasOpenFindings } from "@/lib/baseResume";
import { applyVariant, applyVariants } from "@/lib/consistency";
import { PROFILE_RESUME_KEY } from "@/lib/fileStore";
import { applySuggestion, applySuggestions } from "@/lib/proofread";
import { formatRelativeTime } from "@/lib/session";
import type { BaseResume } from "@/lib/baseResume";
import NameVariantReview from "./NameVariantReview";
import ResumeUpload from "./ResumeUpload";
import SpellingReview from "./SpellingReview";
import type { NameVariant, SpellingSuggestion } from "@/types";

/**
 * Your resume, and everything the app noticed while reading it.
 *
 * This was step 1 of every application. It is one tab of Your Profile now,
 * because a resume is something you own rather than something you submit — the
 * contact block in the next tab is read out of this file, and uploading is the
 * one action that answers both.
 *
 * Everything the old step did still happens here, in the same order: read the
 * file, show what came out of it, list the typos and the names spelt two ways,
 * and let each one be taken or left. The findings are worth the room they take
 * — this is the last moment the source can be corrected, because from here on
 * every later check asks whether the generated document matches it rather than
 * whether it is right.
 */

type Props = {
  resume: BaseResume | null;
  /** The upload pipeline — parse, proofread, read the contact block. */
  onParsed: (text: string, filename: string) => Promise<void>;
  /** Any edit to the saved resume: an accepted fix, a dismissed finding. */
  onChange: (next: BaseResume) => void;
  onRemove: () => void;
};

export default function ResumeTab({ resume, onParsed, onChange, onRemove }: Props) {
  // Which finding is being looked at, so the preview can mark it.
  const [highlight, setHighlight] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  /**
   * Rewrites the saved text and drops the findings it settles.
   *
   * Editing this text is editing the source of truth for every application from
   * here on. That is the point — a typo fixed once should not be offered again
   * next month — and it is why the applications already built keep their own
   * copy: correcting the resume must not rewrite a report that was an answer
   * about the uncorrected one.
   */
  function edit(patch: Partial<BaseResume>) {
    if (!resume) return;
    onChange({ ...resume, ...patch });
  }

  function acceptSpelling(s: SpellingSuggestion) {
    if (!resume) return;
    // The word is about to stop existing; a mark pointing at it would have
    // nothing to point at.
    setHighlight((prev) => (prev === s.wrong ? "" : prev));
    edit({
      text: applySuggestion(resume.text, s),
      spellingSuggestions: resume.spellingSuggestions.filter((x) => x.wrong !== s.wrong),
    });
  }

  function acceptVariant(v: NameVariant) {
    if (!resume) return;
    setHighlight("");
    edit({
      text: applyVariant(resume.text, v),
      nameVariants: resume.nameVariants.filter((x) => x.preferred !== v.preferred),
    });
  }

  if (!resume) {
    return (
      <div className="space-y-4">
        {/* The one place a longer line is worth it — there is nothing else on
            screen, and this is the first thing a new user reads. Even so it
            says what happens rather than listing the checks; those announce
            themselves when they find something. */}
        <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Uploaded once and used by every application, so you only do this again when your
          resume actually changes.
        </p>
        <ResumeUpload
          resumeText=""
          resumeFilename=""
          fileKey={PROFILE_RESUME_KEY}
          onParsed={onParsed}
        />
        <p className="text-center text-[11px] text-[var(--color-text-muted)]">
          Saved in this browser only.
        </p>
      </div>
    );
  }

  const age = resume.savedAt ? formatRelativeTime(resume.savedAt) : "";

  return (
    <div className="space-y-4">
      {/* The "each application keeps its own copy" reassurance moved down to
          the Remove row, where it is actually load-bearing. Up here it answered
          a question nobody had yet. */}
      <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
        Used by every application{age && `, uploaded ${age}`}.
      </p>

      {/* Full height, so the dialog does the scrolling and there is one
          scrollbar rather than a short pane nested inside a long one — except
          while a finding is outstanding, when clicking a row has to reach the
          word without pushing the row itself off screen. See DocumentPreview. */}
      <ResumeUpload
        resumeText={resume.text}
        resumeFilename={resume.filename}
        fileKey={PROFILE_RESUME_KEY}
        highlight={highlight}
        previewHeight={hasOpenFindings(resume) ? "compact" : "full"}
        onParsed={onParsed}
      />

      <SpellingReview
        suggestions={resume.spellingSuggestions}
        resumeText={resume.text}
        selected={highlight}
        onSelect={(s) => setHighlight(s.wrong)}
        onAccept={acceptSpelling}
        onReject={(s) =>
          edit({
            spellingSuggestions: resume.spellingSuggestions.filter((x) => x.wrong !== s.wrong),
          })
        }
        onAcceptAll={() => {
          setHighlight("");
          edit({
            text: applySuggestions(resume.text, resume.spellingSuggestions),
            spellingSuggestions: [],
          });
        }}
        onRejectAll={() => {
          setHighlight("");
          edit({ spellingSuggestions: [] });
        }}
      />

      <NameVariantReview
        issues={resume.nameVariants}
        selected={highlight}
        onSelect={setHighlight}
        onAccept={acceptVariant}
        onReject={(v) =>
          edit({ nameVariants: resume.nameVariants.filter((x) => x.preferred !== v.preferred) })
        }
        onAcceptAll={() => {
          setHighlight("");
          edit({ text: applyVariants(resume.text, resume.nameVariants), nameVariants: [] });
        }}
        onRejectAll={() => {
          setHighlight("");
          edit({ nameVariants: [] });
        }}
      />

      {/* Separate from Replace above, which swaps one resume for another and is
          the ordinary way in. This throws the document away and leaves nothing,
          so it is confirmed and it is down here, out of the path. */}
      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] pt-4">
        <p className="min-w-0 text-xs text-[var(--color-text-muted)]">
          Applications you&rsquo;ve already started keep their own copy.
        </p>
        {confirmingRemove ? (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => {
                onRemove();
                setConfirmingRemove(false);
              }}
              className="tap rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-danger)] transition-colors hover:bg-[var(--color-surface-overlay)]"
            >
              Remove It
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="tap rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)]"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="tap shrink-0 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)]"
          >
            Remove Resume
          </button>
        )}
      </div>
    </div>
  );
}
