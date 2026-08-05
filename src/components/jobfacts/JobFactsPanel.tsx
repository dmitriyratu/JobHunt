"use client";

import { EMPTY_JOB_FACTS } from "@/lib/jobFacts";
import JobFactsAside from "./JobFactsAside";
import type { JobFacts } from "@/types";

/**
 * The panel in all three of the states it can be in.
 *
 * Split from `JobFactsAside` so the aside stays a pure rendering of facts that
 * exist — the demo bench and any future placement (a modal, the match step)
 * want that one without the loading and retry machinery around it.
 *
 * There is no fourth state for "the posting stated nothing". An extraction that
 * came back empty still renders the aside, which prints ten "Not stated" rows,
 * and that is the correct output rather than a degenerate one: it says the
 * posting was read and gave nothing up, which is different from the panel not
 * being there.
 */

type Props = {
  facts: JobFacts | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  /** Passed through to the aside; absent makes the panel read-only. */
  onChange?: (next: JobFacts) => void;
};

export default function JobFactsPanel({ facts, loading, error, onRetry, onChange }: Props) {
  if (facts) return <JobFactsAside facts={facts} onChange={onChange} />;

  if (loading) {
    return (
      <aside className="glass-panel w-full p-4 lg:sticky lg:top-6">
        <p className="eyebrow">At a glance</p>
        {/* Greeked at the sizes the real rows use, so nothing jumps when the
            answer lands. */}
        <div className="mt-3 h-6 w-2/3 rounded bg-[var(--color-chip)]" />
        <div className="mt-4 space-y-3 border-t border-[var(--color-border-subtle)] pt-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2 w-12 rounded bg-[var(--color-chip)]" />
              <div className="h-3 w-24 rounded bg-[var(--color-chip)]" />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-[var(--color-text-muted)]">
          Reading the posting&rsquo;s details…
        </p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="glass-panel w-full p-4 lg:sticky lg:top-6">
        <p className="eyebrow">At a glance</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Couldn&rsquo;t read the posting&rsquo;s details.
        </p>
        {/* The message, not just "something went wrong": a missing API key and a
            rate limit want different actions from the reader, and this step is
            optional enough that it is never worth a dialog. */}
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{error}</p>
        <button onClick={onRetry} className="btn-secondary mt-3 w-full text-xs py-1.5">
          Try again
        </button>
        {/* The way out when retrying won't help — no key, no credit, a posting
            the model keeps choking on. The fields are editable anyway, so
            refusing to show them until a model call succeeds would be withholding
            a form on the grounds that nobody filled it in. */}
        {onChange && (
          <button
            onClick={() => onChange({ ...EMPTY_JOB_FACTS, extractedAt: new Date().toISOString() })}
            className="mt-2 w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]"
          >
            Fill them in myself
          </button>
        )}
      </aside>
    );
  }

  return null;
}
