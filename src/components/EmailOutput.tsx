"use client";

import LetterEditor from "./LetterEditor";
import SubjectField from "./SubjectField";

type Props = {
  subject: string;
  body: string;
  loading: boolean;
  error: string;
  canGenerate: boolean;
  recipientName: string;
  letterContext: string;
  onRecipientNameChange: (v: string) => void;
  onLetterContextChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onBodyChange: (html: string) => void;
  onGenerate: () => void;
};

export default function EmailOutput({
  subject,
  body,
  loading,
  error,
  canGenerate,
  recipientName,
  letterContext,
  onRecipientNameChange,
  onLetterContextChange,
  onSubjectChange,
  onBodyChange,
  onGenerate,
}: Props) {
  return (
    <div className="glass-panel p-5">
      <div className="mb-4">
        <h3 className="font-medium text-sm">Outreach email</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Skim-optimized for busy hiring managers
        </p>
      </div>

      <div className="mb-4">
        <label className="text-xs text-[var(--color-text-muted)] block mb-1">
          Recipient name (optional)
        </label>
        <input
          value={recipientName}
          onChange={(e) => onRecipientNameChange(e.target.value)}
          placeholder="Jane Smith"
          className="input-base"
        />
      </div>

      <div className="mb-4">
        <label className="text-xs text-[var(--color-text-muted)] block mb-1">
          Anything else to include (optional)
        </label>
        <textarea
          value={letterContext}
          onChange={(e) => onLetterContextChange(e.target.value)}
          placeholder="Tone preferences, a connection at the company, why you're interested…"
          rows={3}
          className="input-base resize-none"
        />
      </div>

      <button
        onClick={onGenerate}
        disabled={!canGenerate || loading}
        className="btn-primary w-full mb-4"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating…
          </span>
        ) : body ? (
          "Regenerate email"
        ) : (
          "Generate email"
        )}
      </button>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-muted)] border border-[var(--color-danger)]/20 px-4 py-3 mb-4">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
        </div>
      )}

      {body ? (
        <>
          <SubjectField value={subject} onChange={onSubjectChange} />
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
            Email body
          </p>
          <LetterEditor html={body} onChange={onBodyChange} />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-overlay)]">
            <svg className="h-6 w-6 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Generate a letter to see the subject and body here
          </p>
        </div>
      )}
    </div>
  );
}
