"use client";

import { useEffect } from "react";

/**
 * The letter's two optional inputs, asked when you press Generate.
 *
 * Same reasoning as the resume's generate flow: a recipient name and a line of
 * context are answered once and then never looked at again, so a permanent
 * column holding them was charging the letter a third of the screen for two
 * fields. One step rather than three — there is no format to choose and nothing
 * to recommend, so sequencing them would be ceremony.
 */

type Props = {
  open: boolean;
  recipientName: string;
  letterContext: string;
  /** Whose letter this is, so the dialog can name the company. */
  companyName: string;
  hasBody: boolean;
  onRecipientNameChange: (v: string) => void;
  onLetterContextChange: (v: string) => void;
  onGenerate: () => void;
  onClose: () => void;
};

export default function GenerateEmailModal({
  open,
  recipientName,
  letterContext,
  companyName,
  hasBody,
  onRecipientNameChange,
  onLetterContextChange,
  onGenerate,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Write the email"
        onClick={(e) => e.stopPropagation()}
        className="glass-panel my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col p-5 sm:p-6"
      >
        <div className="mb-4">
          <h2 className="text-base font-semibold">Write the email</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            Both optional. Everything from the earlier steps — your resume, the posting and the
            match report{companyName ? `, addressed to ${companyName}` : ""} — is already going
            in.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <label
              htmlFor="letter-recipient"
              className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Recipient name
            </label>
            <input
              id="letter-recipient"
              value={recipientName}
              onChange={(e) => onRecipientNameChange(e.target.value)}
              placeholder="Jane Smith"
              className="input-base"
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="letter-context"
              className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              Anything else to include
            </label>
            <textarea
              id="letter-context"
              value={letterContext}
              onChange={(e) => onLetterContextChange(e.target.value)}
              placeholder="Tone preferences, a connection at the company, why you're interested…"
              rows={4}
              className="input-base resize-none"
            />
          </div>
        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
            Cancel
          </button>
          <button onClick={onGenerate} className="btn-primary flex-1 py-2 text-sm">
            {hasBody ? "Regenerate email" : "Generate email"}
          </button>
        </div>
      </div>
    </div>
  );
}
