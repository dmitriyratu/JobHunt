"use client";

import { useEffect, useState } from "react";
import type { SeededField } from "@/lib/contactExtract";
import { isProfileUsable, type ResumeProfile } from "@/lib/settings";
import ProfileFields from "./ProfileFields";
import type { DocumentShape } from "@/types";

/**
 * What the upload read out of your resume, for you to confirm.
 *
 * The extraction itself is old — every upload has always seeded the profile —
 * but it did so silently, which made it invisible in the two ways that matter.
 * Nobody knew the app already had their phone number, so the generate flow's
 * first step looked like a form they had to fill; and nobody saw the values it
 * got wrong, because a PDF's contact block is exactly where text extraction
 * mangles things — ligatures in an email, a phone number run together with the
 * line above, a LinkedIn URL split across two spans. Both problems are the same
 * problem: the guess was never shown.
 *
 * So it is shown, once, at the moment it is made, in the same editor the
 * profile dialog uses. Confirming saves it for every application from here on.
 *
 * Only opens when something was actually filled in. Re-uploading a resume whose
 * details are already on file changes nothing, and a dialog that says so is a
 * dialog in the way.
 */

type Props = {
  open: boolean;
  /** The document these came out of, so the dialog can say where it looked. */
  filename: string;
  /** Only what this upload added — the summary line names those, not the form. */
  found: SeededField[];
  /** The profile as it would be with the extraction merged in. */
  profile: ResumeProfile;
  /** Decides which link slots the form offers; null before one is picked. */
  shape: DocumentShape | null;
  onConfirm: (profile: ResumeProfile) => void;
  onDismiss: () => void;
};

export default function ConfirmDetailsModal({
  open,
  filename,
  found,
  profile,
  shape,
  onConfirm,
  onDismiss,
}: Props) {
  const [draft, setDraft] = useState<ResumeProfile>(profile);

  // Re-seed on open: the next upload extracts different values, and a draft
  // left over from the last one would quietly discard them.
  useEffect(() => {
    if (open) setDraft(profile);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  // Called out separately from additions: filling a blank needs no scrutiny,
  // while changing or dropping a value you set by hand is the one thing this
  // dialog exists to make impossible to miss.
  const displaced = found.filter((f) => f.previous).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-2 sm:p-6"
      onClick={onDismiss}
    >
      <div
        className="glass-panel my-2 w-full max-w-2xl overflow-hidden p-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm your details"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-medium">Confirm your details</h2>
          <button onClick={onDismiss} className="btn-secondary px-3 py-1.5 text-xs">
            Not now
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              These are the details in{" "}
              <span className="font-medium text-[var(--color-text-primary)]">
                {filename || "your resume"}
              </span>
              , and they replace what was on file — a new resume is taken as the current
              answer, including where it drops a field. They head every resume and cover
              letter JobHunt generates and are the one part the model never writes, so
              they&rsquo;re worth a look before anything gets built on them. Saved for every
              application, not just this one.
            </p>

            {/* Names what this upload contributed. The form below shows the
                values but not their provenance, and a field the extraction
                invented reads exactly like one you typed last week. Nothing
                here means the resume's details were already on file — worth
                saying outright, so an unchanged form doesn't look like a
                failed read. */}
            {found.length > 0 ? (
              <>
                {displaced > 0 && (
                  <p className="mt-2 text-xs text-[var(--color-warning)]">
                    {displaced === 1
                      ? "One of these changes a value already on file."
                      : `${displaced} of these change values already on file.`}{" "}
                    Nothing is saved until you confirm.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {found.map((f) => (
                    <span
                      key={f.label}
                      title={
                        f.previous
                          ? `${f.value || "cleared"} — was ${f.previous}`
                          : f.value
                      }
                      className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] ${
                        f.previous
                          ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] text-[var(--color-text-secondary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]"
                      }`}
                    >
                      <span className="text-[var(--color-text-muted)]">{f.label}:</span>{" "}
                      {/* An empty value is a removal — this resume does not carry
                          the field at all, so say that rather than render a gap. */}
                      {f.value || <span className="italic">cleared</span>}
                      {f.previous && (
                        <span className="text-[var(--color-text-muted)]">
                          {" "}
                          (was {f.previous})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Everything it found was already on file — nothing below was changed by this
                upload.
              </p>
            )}
          </div>

          <ProfileFields
            value={draft}
            onChange={setDraft}
            shape={shape ?? "resume"}
            idPrefix="confirm"
          />

          {!isProfileUsable(draft) && (
            <p className="text-xs text-[var(--color-warning)]">
              A name and at least one way to reach you are required.
            </p>
          )}

          <p className="text-xs text-[var(--color-text-muted)]">
            Saved only in this browser, and kept out of every AI request except the one that
            writes your resume. You can change any of it later under &ldquo;Your
            details&rdquo;.
          </p>

          <button onClick={() => onConfirm(draft)} className="btn-primary w-full">
            Save details
          </button>
        </div>
      </div>
    </div>
  );
}
