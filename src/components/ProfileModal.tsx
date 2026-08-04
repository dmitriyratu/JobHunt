"use client";

import { useEffect, useState } from "react";
import { removeAssertedFact } from "@/lib/assertedFacts";
import { isProfileUsable, type AppSettings, type ResumeProfile } from "@/lib/settings";
import ProfileFields from "./ProfileFields";
import type { AssertedFact, DocumentShape } from "@/types";

/**
 * The contact block that heads every generated document, on its own.
 *
 * Lifted out of Settings, where it was the first tab. It never belonged there:
 * Settings otherwise holds an API key and a spend readout — set once, secret,
 * and then forgotten — while these seven values are reviewed against almost
 * every application, which is why the generate flow already asks for them again
 * as its first step. Two things with opposite lifecycles were sharing a dialog
 * because they were both "configuration".
 *
 * `ProfileFields` is still the one editor. This dialog and generate-step-0 wrap
 * the same component, so a field added to ResumeProfile shows up in both without
 * either knowing about the other.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  /**
   * The current application's document shape, which decides only which link
   * slots are offered. Null before one has been picked — the form falls back to
   * the resume set, which is the right guess when nothing is known.
   */
  shape: DocumentShape | null;
};

/**
 * The facts you told the chat, listed so they can be taken back.
 *
 * There is no way to add one here on purpose. These are captured in
 * conversation, where the app can see the claim in context and you can see what
 * it will do with it; a free-text box would be a second, blinder way in — and
 * whatever is typed into it goes onto a resume you send to an employer.
 *
 * Removing is different. A claim that was true of the job you were chasing in
 * March may not be one you want on every application forever, and the only
 * thing worse than not being able to state a fact is not being able to withdraw
 * one. Applies immediately rather than on Save: this is a list with a delete
 * button, not a form, and a removal that silently depended on a button further
 * down the dialog would be the kind of thing you find out about later.
 */
function AssertedFactList({
  facts,
  onRemove,
}: {
  facts: AssertedFact[];
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">What you&rsquo;ve told the app about yourself</h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        Things your uploaded resume doesn&rsquo;t say, recorded when you agreed to them in
        the match report chat. They&rsquo;re treated as part of your resume from then on, so
        every application can draw on them. Remove anything you don&rsquo;t want written
        into future documents.
      </p>

      {facts.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Nothing yet. When the match report says you&rsquo;re missing something you
          actually have, tell the chat and it&rsquo;ll offer to remember it.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2"
            >
              {/* break-words: a stated fact can be a URL or a long token, and
                  `min-w-0` alone only lets the box shrink — it doesn't give the
                  text anywhere to break. */}
              <span className="min-w-0 break-words text-xs text-[var(--color-text-secondary)]">
                {fact.text}
              </span>
              <button
                type="button"
                onClick={() => onRemove(fact.id)}
                aria-label={`Remove "${fact.text}"`}
                className="tap inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ProfileModal({ open, onClose, settings, onSave, shape }: Props) {
  const [draft, setDraft] = useState<ResumeProfile>(settings.profile);
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-seed on open so a cancelled edit doesn't linger into the next visit.
  useEffect(() => {
    if (open) setDraft(settings.profile);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Spread over the whole settings object rather than patching a profile field:
  // the key and the admin key live in the same stored blob, and saving a partial
  // would drop them.
  function save() {
    onSave({ ...settings, profile: draft });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  // Straight through rather than into `draft`: the draft is the contact block,
  // and a removal shouldn't wait on the Save button below it.
  function removeFact(id: string) {
    onSave({ ...settings, assertedFacts: removeAssertedFact(settings.assertedFacts, id) });
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-panel glass-panel max-w-2xl p-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your details"
      >
        <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-medium">Your details</h2>
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        {/* The tallest dialog in the app — thirteen fields and a fact list, well
            over a thousand pixels. It used to grow to that and let the backdrop
            scroll, which on a landscape phone meant Close was above the top of
            the screen and Save below the bottom. */}
        <div className="modal-body space-y-4 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-medium">The header on your resumes</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              These sit at the top of every resume JobHunt generates, and they&rsquo;re the
              one part the model never writes. We fill them in from your first upload, but
              PDF text extraction mangles phone numbers and links often enough that
              it&rsquo;s worth a look. Correct anything wrong here and it stays fixed for
              every application.
            </p>
          </div>

          <ProfileFields value={draft} onChange={setDraft} shape={shape ?? "resume"} />

          {!isProfileUsable(draft) && (
            <p className="text-xs text-[var(--color-warning)]">
              A name and at least one way to reach you are required.
            </p>
          )}

          <p className="text-xs text-[var(--color-text-muted)]">
            Saved only in this browser, and kept out of every AI request except the one that
            writes your resume.
          </p>

          <button onClick={save} className="btn-primary w-full">
            {savedFlash ? "Saved!" : "Save details"}
          </button>

          <div className="border-t border-[var(--color-border-subtle)] pt-4">
            <AssertedFactList facts={settings.assertedFacts} onRemove={removeFact} />
          </div>
        </div>
      </div>
    </div>
  );
}
