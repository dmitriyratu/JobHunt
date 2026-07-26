"use client";

/**
 * The inputs that feed generation. Split out from the letter itself so the two
 * can sit in separate columns: these are short fields that look absurd stretched
 * to the width of a letter, and the letter is prose that shouldn't be squeezed
 * into a sidebar.
 */
type Props = {
  loading: boolean;
  error: string;
  canGenerate: boolean;
  hasBody: boolean;
  recipientName: string;
  letterContext: string;
  onRecipientNameChange: (v: string) => void;
  onLetterContextChange: (v: string) => void;
  onGenerate: () => void;
};

export default function LetterComposer({
  loading,
  error,
  canGenerate,
  hasBody,
  recipientName,
  letterContext,
  onRecipientNameChange,
  onLetterContextChange,
  onGenerate,
}: Props) {
  return (
    <div className="glass-panel p-5">
      <div className="mb-4">
        <h3 className="font-medium text-sm">Write the email</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Optional details, then generate
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
        className="btn-primary w-full"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating…
          </span>
        ) : hasBody ? (
          "Regenerate email"
        ) : (
          "Generate email"
        )}
      </button>

      {error && (
        <div className="rounded-lg bg-[var(--color-danger-muted)] border border-[var(--color-danger)]/20 px-4 py-3 mt-4">
          <p className="text-[var(--color-danger)] text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
