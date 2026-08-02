"use client";

import { useEffect, useState } from "react";
import { isProfileUsable, type AppSettings, type ResumeProfile } from "@/lib/settings";
import ProfileFields from "./ProfileFields";
import type { DocumentShape } from "@/types";

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel my-2 w-full max-w-2xl overflow-hidden p-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Your details"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-medium">Your details</h2>
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
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
        </div>
      </div>
    </div>
  );
}
