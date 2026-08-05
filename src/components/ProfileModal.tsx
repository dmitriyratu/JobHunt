"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { removeAssertedFact } from "@/lib/assertedFacts";
import {
  clearBaseResume,
  hasOpenFindings,
  loadBaseResume,
  saveBaseResume,
  type BaseResume,
} from "@/lib/baseResume";
import { seedProfile, type SeededField } from "@/lib/contactExtract";
import { type AppSettings, type ResumeProfile } from "@/lib/settings";
import { appendUsageEntry } from "@/lib/usage";
import DetailsTab from "./DetailsTab";
import ResumeTab from "./ResumeTab";
import type { DocumentShape, NameVariant, SpellingSuggestion } from "@/types";
import { useScrollLock } from "@/lib/useScrollLock";

/**
 * Everything the app knows about you, in one dialog.
 *
 * Two tabs, because there are two things and one produces the other: the resume
 * is the document, and the details are the contact block read out of it. They
 * used to live a page apart — the resume as step 1 of every application, the
 * details behind a header button — which put the source and the thing derived
 * from it in different places and asked for the source again on every
 * submission.
 *
 * "Your Profile" rather than "Your Details", which is what the button said when
 * the contact block was all there was. Naming the dialog after one of its two
 * tabs made the tab strip read as a loop — Your Details ▸ Your Details — and
 * left the resume looking like a guest in someone else's dialog.
 *
 * Lifted out of the account dialog before that, and for the same kind of
 * reason: that one holds an API key and a spend readout, set once and
 * forgotten, while this is reviewed against almost every application.
 *
 * The upload pipeline lives here rather than in the resume tab because both
 * tabs are downstream of it — one gets the text and the findings, the other
 * gets the contact block — and a handler that fills two tabs belongs to the
 * thing that owns both.
 */

type Tab = "resume" | "details";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  /** Takes only the fields it changes — see @/lib/useSettings. */
  onSave: (patch: Partial<AppSettings>) => void;
  /**
   * The current application's document shape, which decides only which link
   * slots are offered. Null before one has been picked — the form falls back to
   * the resume set, which is the right guess when nothing is known.
   */
  shape: DocumentShape | null;
  /** Which tab to land on. The resume one, when there isn't a resume yet. */
  initialTab?: Tab;
  /**
   * Hands a changed resume to the application on screen.
   *
   * Uploading a new resume, or accepting a fix to the old one, changes what the
   * open application is built from — so it has to reach the session, and it has
   * to invalidate whatever was already built from the outgoing text. Every
   * other application keeps its own copy untouched.
   */
  onResumeChange: (text: string, filename: string) => void;
  /** Called when the saved resume is deleted outright. */
  onResumeRemoved: () => void;
  /** For attributing the proofread's token spend to the open application. */
  sessionId: string;
};

export default function ProfileModal({
  open,
  onClose,
  settings,
  onSave,
  shape,
  initialTab = "details",
  onResumeChange,
  onResumeRemoved,
  sessionId,
}: Props) {
  useScrollLock(open);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [draft, setDraft] = useState<ResumeProfile>(settings.profile);
  const [savedFlash, setSavedFlash] = useState(false);
  const [resume, setResume] = useState<BaseResume | null>(null);
  // Switching tabs keeps the scroll position otherwise, and the two tabs are
  // nothing like the same height: leaving Details half-read drops you into the
  // middle of the resume, which reads as a broken document rather than a new
  // tab. Reset on the tab itself, not on open — reopening on the tab you left
  // is fine, landing mid-page on a tab you just asked for is not.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);
  // What the last upload read out of the resume, until it has been looked at.
  // Null on an ordinary visit, which is almost every visit.
  const [found, setFound] = useState<SeededField[] | null>(null);

  // Re-seed on open so a cancelled edit doesn't linger into the next visit.
  useEffect(() => {
    if (open) {
      setDraft(settings.profile);
      setResume(loadBaseResume());
      setTab(initialTab);
      setFound(null);
    }
  }, [open, settings, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /**
   * A newly read resume: saved, checked, and mined for a contact block.
   *
   * Awaited by the upload card, so the findings and the card arrive together.
   * This is also the only moment the checks CAN run: from here on the text is
   * ground truth, and every later check asks whether a generated document
   * matches it rather than whether it is right.
   */
  const handleParsed = useCallback(
    async (text: string, filename: string) => {
      // Silent on failure — an upload must never fail because a proofread did —
      // and awaited either way, so the card does not claim to be finished while
      // this is still going.
      let findings: { suggestions?: unknown[]; nameVariants?: unknown[] } = {};
      try {
        const res = await fetch("/api/proofread-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, apiKey: settings.apiKey || undefined }),
        });
        const data = await res.json();
        if (res.ok) {
          findings = data;
          if (data.usage) {
            appendUsageEntry({
              endpoint: "proofread-resume",
              model: data.usage.model,
              sessionId,
              usage: data.usage,
            });
          }
        }
      } catch {
        /* an upload that works beats a proofread that does */
      }

      setResume(
        saveBaseResume({
          text,
          filename,
          savedAt: new Date().toISOString(),
          spellingSuggestions: (findings.suggestions ?? []) as SpellingSuggestion[],
          nameVariants: (findings.nameVariants ?? []) as NameVariant[],
        })
      );
      onResumeChange(text, filename);

      // Fills only blanks, so this is safe to run on every upload — a value you
      // corrected by hand always outranks the regex. Nothing is saved yet: the
      // contact block is the one part of a generated resume the model never
      // writes, and it is read from the part of a PDF that extraction mangles
      // most, so it goes past the user first.
      const seeded = seedProfile(settings.profile, text);
      if (seeded.detected) {
        setDraft(seeded.profile);
        setFound(seeded.filled);
      }
    },
    [settings.apiKey, settings.profile, sessionId, onResumeChange]
  );

  const handleResumeEdit = useCallback(
    (next: BaseResume) => {
      setResume(saveBaseResume(next));
      onResumeChange(next.text, next.filename);
    },
    [onResumeChange]
  );

  const handleRemoveResume = useCallback(() => {
    clearBaseResume();
    setResume(null);
    onResumeRemoved();
  }, [onResumeRemoved]);

  if (!open) return null;

  // Writes the profile and nothing else. This used to spread the whole settings
  // object, because the two API keys share the stored blob and a partial save
  // would have dropped them — see useSettings, which merges patches so that a
  // field left unnamed is a field left alone.
  function save() {
    onSave({ profile: draft });
    setFound(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  // Straight through rather than into `draft`: the draft is the contact block,
  // and a removal shouldn't wait on the Save button below it.
  function removeFact(id: string) {
    onSave({ assertedFacts: removeAssertedFact(settings.assertedFacts, id) });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel glass-panel max-w-2xl p-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your Profile"
      >
        <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          {/* Tabs in the head rather than above the body: this dialog scrolls,
              and a tab strip that scrolls away takes with it the only sign that
              the other half exists.
              One word each. "Your resume" and "Your details" repeated the
              dialog's own name back at it twice, which is three "your"s on one
              line saying nothing the dialog title hadn't already said. */}
          <div
            role="tablist"
            aria-label="Your Profile"
            className="flex min-w-0 gap-1 rounded-[var(--radius-control)] bg-[var(--color-chip)] p-0.5"
          >
            <TabButton
              id="resume"
              active={tab === "resume"}
              onClick={() => setTab("resume")}
              label="Resume"
              // A finding nobody looked at is the one thing in here that goes
              // stale badly: it is a typo heading for a document you send out.
              dot={hasOpenFindings(resume)}
            />
            <TabButton
              id="details"
              active={tab === "details"}
              onClick={() => setTab("details")}
              label="Details"
              // Something to look at, not merely something that happened. An
              // upload that read nothing new leaves `found` an empty array —
              // the banner in there says so in as many words — and `!== null`
              // lit the dot anyway, sending you to a tab to be told nothing
              // had changed.
              dot={(found?.length ?? 0) > 0}
            />
          </div>
          <button onClick={onClose} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        {/* The tallest dialog in the app — thirteen fields and a fact list, well
            over a thousand pixels. It used to grow to that and let the backdrop
            scroll, which on a landscape phone meant Close was above the top of
            the screen and Save below the bottom. */}
        <div ref={bodyRef} className="modal-body p-4 sm:p-5">
          {tab === "resume" ? (
            <ResumeTab
              resume={resume}
              onParsed={handleParsed}
              onChange={handleResumeEdit}
              onRemove={handleRemoveResume}
            />
          ) : (
            <DetailsTab
              draft={draft}
              onDraftChange={setDraft}
              shape={shape}
              found={found}
              onSave={save}
              saved={savedFlash}
              facts={settings.assertedFacts}
              onRemoveFact={removeFact}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One glyph per tab, drawn on the same 20×20 grid as the journey's step marks.
 *
 * The document is deliberately the *same* mark StageNav draws for the first
 * step: that step is where the resume used to be uploaded, and this tab is
 * where it is uploaded now. Two different glyphs for the one document would
 * teach the mark twice and mean it once.
 *
 * The person is the pair to it rather than a second document, because that is
 * exactly the split the two tabs make — the file you wrote, and the few facts
 * about you that head every document generated from it.
 */
const TAB_ICON: Record<Tab, ReactNode> = {
  // A page with a turned corner — the thing you upload.
  resume: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 3.5h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"
      />
      <path strokeLinecap="round" d="M10 3.5v3.5h3" />
    </>
  ),
  // Head and shoulders — the contact block, which is the tab's whole subject.
  details: (
    <>
      <circle cx="10" cy="6.75" r="3.25" />
      <path strokeLinecap="round" d="M4 16.75a6 6 0 0 1 12 0" />
    </>
  ),
};

function TabIcon({ id }: { id: Tab }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      // Matches StageNav: a 20-grid glyph drawn at 14px needs a heavier stroke
      // than its geometry suggests, or it renders soft on a non-retina screen.
      strokeWidth={1.9}
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      {TAB_ICON[id]}
    </svg>
  );
}

function TabButton({
  id,
  active,
  onClick,
  label,
  dot,
}: {
  id: Tab;
  active: boolean;
  onClick: () => void;
  label: string;
  dot: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`tap flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
      }`}
    >
      {/* Muted on the tab you are not on, so the selected tab's glyph carries
          the same weight jump its label does — at full strength both marks read
          as equally current and the strip stops saying where you are. */}
      <span className={active ? "" : "text-[var(--color-text-muted)]"}>
        <TabIcon id={id} />
      </span>
      {label}
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />}
    </button>
  );
}
