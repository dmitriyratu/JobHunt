"use client";

import { factRows } from "@/lib/jobFacts";
import FactIcon from "./FactIcon";
import type { JobFacts } from "@/types";

/**
 * Option D — the same facts on the application card in the rail.
 *
 * Not an alternative to A/B/C; it is what makes them worth recording. A rail of
 * eight applications currently differs only by role, employer and a score, so
 * "which of these is remote and pays over 200" is a question you answer by
 * opening all eight. One line of terms per card answers it by scanning.
 *
 * Three facts maximum, and pay always first when it exists. The rail is 320px
 * wide with a 64px logo tile in it; a fourth item wrapped to a second line on
 * every card that had a two-word city in it.
 */

type Props = {
  facts: JobFacts;
  /**
   * "text" — a dot-joined run, the lightest thing that could work.
   * "chips" — the same three as pills, matching the chip strip on step 1.
   */
  variant?: "text" | "chips";
};

export default function JobFactsCardLine({ facts, variant = "text" }: Props) {
  const shown = factRows(facts)
    .filter((row) => row.primary && row.value !== null)
    .slice(0, 3);

  if (shown.length === 0) return null;

  if (variant === "chips") {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {shown.map((row) => (
          <span
            key={row.key}
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              row.key === "salary"
                ? "bg-[var(--color-accent-surface)] text-[var(--color-text-primary)]"
                : "bg-[var(--color-chip)] text-[var(--color-text-secondary)]"
            }`}
          >
            {row.key === "salary" && <FactIcon name="salary" className="h-2.5 w-2.5" />}
            {row.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--color-text-secondary)]">
      {shown.map((row, i) => (
        <span key={row.key} className="inline-flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden className="text-[var(--color-text-placeholder)]">
              ·
            </span>
          )}
          {/* Pay carries its glyph so the number is findable down a column of
              cards without reading any of them. */}
          {row.key === "salary" && (
            <FactIcon name="salary" className="h-3 w-3 text-[var(--color-text-muted)]" />
          )}
          <span className={row.key === "salary" ? "font-medium" : ""}>{row.value}</span>
        </span>
      ))}
    </p>
  );
}
