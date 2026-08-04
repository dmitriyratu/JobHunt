"use client";

import { contextFor } from "@/lib/proofread";
import type { SpellingSuggestion } from "@/types";

/**
 * The typos found in the uploaded file, one decision each.
 *
 * A list rather than a correction, because accepting one rewrites the text every
 * later check is made against — the grounding pass, the copied-field check and
 * the document itself all read it as the candidate's own words. Nothing here
 * changes until it is accepted.
 *
 * Each row carries the line it came from, with the word set apart inside it, and
 * selects that word in the preview above when clicked. Both exist for the same
 * reason: a correction cannot be judged from the word alone. The first version
 * showed four words either side — "…Provided community education on
 * vaccinations…" — which is not enough of the sentence to tell a misspelling
 * from a plural someone meant.
 */
type Props = {
  suggestions: SpellingSuggestion[];
  /** The extracted text, for the line each word sits in. */
  resumeText: string;
  /** Which word is currently shown in the preview, if any. */
  selected: string;
  onSelect: (suggestion: SpellingSuggestion) => void;
  onAccept: (suggestion: SpellingSuggestion) => void;
  onReject: (suggestion: SpellingSuggestion) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export default function SpellingReview({
  suggestions,
  resumeText,
  selected,
  onSelect,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: Props) {
  if (!suggestions.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] px-4 py-3">
      {/* Stacks on a phone. Side by side, the shrink-0 action pair left the
          three-sentence explanation about 180px wide and ten lines long. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--color-warning)]">
            {suggestions.length === 1
              ? "One possible typo in your resume"
              : `${suggestions.length} possible typos in your resume`}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            These are in the file you uploaded, not in anything this app wrote. Employers,
            titles and credentials are copied from it word for word, so a typo here reaches
            the finished document — nothing later will catch it. Click one to find it in the
            preview above.
          </p>
        </div>
        {/* Both buttons, not one button and one piece of text: Dismiss was a
            bare 28px control beside a 44px one, so the pair read as unfinished
            and the quieter half was under the touch minimum. Weight carries the
            hierarchy instead. */}
        <div className="flex shrink-0 gap-2">
          <button onClick={onAcceptAll} className="btn-secondary px-3 py-1.5 text-xs">
            Accept all
          </button>
          <button
            onClick={onRejectAll}
            className="tap inline-flex items-center justify-center rounded-[var(--radius-control)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
          >
            Dismiss
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {suggestions.map((suggestion) => {
          const context = contextFor(resumeText, suggestion);
          const isSelected = selected === suggestion.wrong;
          return (
            <li
              key={suggestion.wrong}
              className={`flex items-start justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors ${
                isSelected
                  ? "bg-[var(--color-surface-overlay)] ring-1 ring-[var(--color-warning)]/50"
                  : "bg-[var(--color-surface-overlay)]"
              }`}
            >
              {/* The whole row is the target, not a separate "show me" control:
                  wanting to see where a word is IS reading the row. */}
              <button
                type="button"
                onClick={() => onSelect(suggestion)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Show ${suggestion.wrong} in the preview`}
              >
                <p className="text-xs">
                  <span className="font-medium line-through text-[var(--color-text-muted)]">
                    {suggestion.wrong}
                  </span>
                  <span className="mx-1.5 text-[var(--color-text-muted)]">→</span>
                  <span className="font-medium">{suggestion.right}</span>
                  {suggestion.count > 1 && (
                    <span className="ml-2 text-[var(--color-text-muted)]">
                      {suggestion.count} places
                    </span>
                  )}
                  {suggestion.note && (
                    <span className="ml-2 text-[var(--color-text-muted)]">{suggestion.note}</span>
                  )}
                </p>
                {context && (
                  // break-words: this is raw resume text, so it can carry a URL
                  // or a long path with nothing in it to break at.
                  <p className="mt-1 break-words text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {context.before}
                    <span className="rounded-sm bg-[var(--color-warning)]/20 px-0.5 font-medium text-[var(--color-text-primary)]">
                      {context.word}
                    </span>
                    {context.after}
                  </p>
                )}
              </button>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => onAccept(suggestion)}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  Fix
                </button>
                <button
                  onClick={() => onReject(suggestion)}
                  className="tap inline-flex items-center justify-center rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
                >
                  Keep
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
