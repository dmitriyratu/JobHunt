"use client";

import type { NameVariant } from "@/types";

/**
 * Institutions the document names more than one way.
 *
 * Kept separate from the typo list because it is a different claim. A typo says
 * a word is wrong; this says both spellings are fine and the document should
 * pick one — so the copy has to be about consistency, not correctness, or the
 * candidate reads it as being told their employer's name is misspelled.
 *
 * Accepting rewrites every other variant to the preferred one, which is always
 * a form already in the document (see consistency.verifyVariants). Clicking a
 * variant finds it in the preview.
 */
type Props = {
  issues: NameVariant[];
  selected: string;
  onSelect: (text: string) => void;
  onAccept: (issue: NameVariant) => void;
  onReject: (issue: NameVariant) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
};

export default function NameVariantReview({
  issues,
  selected,
  onSelect,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
}: Props) {
  if (!issues.length) return null;

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-muted)] px-4 py-3">
      {/* Stacks on a phone — see SpellingReview, which has the same header. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {issues.length === 1
              ? "One name is written two ways"
              : `${issues.length} names are written more than one way`}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            Neither spelling is wrong — the document just isn&rsquo;t consistent about it.
            Accepting rewrites the others to the one marked keep. Click a spelling to find it
            in the preview above.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onAcceptAll} className="btn-secondary px-3 py-1.5 text-xs">
            Accept All
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
        {issues.map((issue) => (
          <li
            key={issue.preferred}
            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-overlay)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {issue.note && (
                  <p className="mb-1 text-xs text-[var(--color-text-muted)]">{issue.note}</p>
                )}
                <ul className="space-y-1">
                  {issue.variants.map((variant) => {
                    const isPreferred = variant.text === issue.preferred;
                    return (
                      <li key={variant.text}>
                        <button
                          type="button"
                          onClick={() => onSelect(variant.text)}
                          // The primary interaction in this panel, and it was a
                          // 16px-tall line of text. `tap` gives it a real target
                          // on touch without changing how it reads on a mouse.
                          className={`tap flex w-full items-center rounded-[var(--radius-sm)] px-1 py-1 text-left text-xs transition-colors hover:bg-[var(--color-surface-raised)] ${
                            selected === variant.text ? "underline underline-offset-2" : ""
                          }`}
                          aria-label={`Show "${variant.text}" in the preview`}
                        >
                          <span
                            className={
                              isPreferred
                                ? "font-medium"
                                : "text-[var(--color-text-muted)] line-through"
                            }
                          >
                            {variant.text}
                          </span>
                          <span className="ml-2 text-[var(--color-text-muted)]">
                            {isPreferred ? "keep" : `${variant.count}×`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => onAccept(issue)}
                  className="btn-secondary px-2.5 py-1 text-xs"
                >
                  Unify
                </button>
                <button
                  onClick={() => onReject(issue)}
                  className="tap inline-flex items-center justify-center rounded-[var(--radius-control)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
                >
                  Leave
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
