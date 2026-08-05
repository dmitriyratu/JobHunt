"use client";

import { useState } from "react";
import { factRows, statedCount } from "@/lib/jobFacts";
import FactFieldEditor from "./FactFieldEditor";
import FactIcon from "./FactIcon";
import type { JobFactKey, JobFacts } from "@/types";

/**
 * The posting's terms, beside the posting, correctable.
 *
 * Reading is the common case and editing is the rare one, so the panel reads as
 * a panel and the edit affordance stays out of the way until a row is pointed
 * at. What it must never do is make a correction feel like a workaround: the
 * extractor is wrong often enough — a range in a currency it guessed, a
 * "Remote" that means remote-within-Ontario — that being able to fix it is part
 * of the feature rather than an escape hatch from it.
 *
 * Pay leads at display size because it is the one number people decide on, and
 * because a column has the width to print "$180k – $220k/yr" without
 * abbreviating.
 */

type Props = {
  facts: JobFacts;
  /** Sticks to the top of the scroll container. Off inside a modal or a drawer. */
  sticky?: boolean;
  /**
   * Absent on a read-only rendering — the screenshot bench, and anywhere the
   * facts are shown but not owned. Without it no edit affordance is drawn at
   * all, rather than drawn and inert.
   */
  onChange?: (next: JobFacts) => void;
};

/** The pencil, revealed on hover and on focus, always present on a touch screen. */
function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      // Same visibility rule as the card's delete control: hover is not a thing
      // a finger can do, so on a coarse pointer these are simply always there.
      className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)] focus-visible:opacity-100 group-hover/row:opacity-100 [@media(pointer:coarse)]:opacity-100"
    >
      <svg
        aria-hidden
        className="h-3 w-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

export default function JobFactsAside({ facts, sticky = true, onChange }: Props) {
  const [editing, setEditing] = useState<JobFactKey | null>(null);
  const rows = factRows(facts);
  const [pay, ...rest] = rows;
  const stated = statedCount(facts);
  const edited = facts.editedKeys.length;
  const editable = Boolean(onChange);

  const commit = (next: JobFacts) => {
    onChange?.(next);
    setEditing(null);
  };

  return (
    <aside
      className={`glass-panel w-full p-4 ${sticky ? "lg:sticky lg:top-6" : ""}`}
      aria-label="What the posting states"
    >
      <p className="eyebrow">At a glance</p>

      {/* Pay is the headline, not a row. Given the same 12px treatment as
          "Travel" it stopped being the thing the panel is for. */}
      <div className="mt-2.5 border-b border-[var(--color-border-subtle)] pb-3">
        {editing === "salary" ? (
          <FactFieldEditor
            factKey="salary"
            facts={facts}
            onCommit={commit}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="group/row flex items-start justify-between gap-2">
            <div className="min-w-0">
              {pay.value ? (
                <>
                  <p className="text-lg font-semibold leading-tight tracking-[-0.01em]">
                    {pay.value}
                  </p>
                  {pay.hint && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{pay.hint}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">Pay not stated</p>
              )}
            </div>
            {editable && <EditButton label="pay" onClick={() => setEditing("salary")} />}
          </div>
        )}
      </div>

      <dl className="mt-3 space-y-2.5">
        {rest.map((row) => (
          <div key={row.key} className="group/row flex items-start gap-2.5">
            <span
              className={`mt-0.5 shrink-0 ${
                row.value
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-text-placeholder)]"
              }`}
            >
              <FactIcon name={row.key} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                {row.label}
              </dt>
              {editing === row.key ? (
                <dd className="mt-1">
                  <FactFieldEditor
                    factKey={row.key}
                    facts={facts}
                    onCommit={commit}
                    onCancel={() => setEditing(null)}
                  />
                </dd>
              ) : (
                <dd
                  className={`text-xs leading-snug break-words ${
                    row.value
                      ? "text-[var(--color-text-secondary)]"
                      : "text-[var(--color-text-placeholder)]"
                  }`}
                >
                  {row.value ?? "Not stated"}
                  {row.value && row.hint && (
                    <span className="block text-[var(--color-text-muted)]">{row.hint}</span>
                  )}
                </dd>
              )}
            </div>
            {editable && editing !== row.key && (
              <EditButton label={row.label.toLowerCase()} onClick={() => setEditing(row.key)} />
            )}
          </div>
        ))}
      </dl>

      {/* Provenance, in the same spirit as ContextRecap: nothing on this panel
          is a guess. Corrections are counted separately rather than folded into
          the total, because the sentence's whole value is that it distinguishes
          what an employer committed to from what someone typed. */}
      <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-3 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
        Read from the posting — {stated} of {rows.length} stated. Nothing here is estimated.
        {edited > 0 && (
          <>
            {" "}
            <span className="text-[var(--color-text-secondary)]">
              {edited} corrected by you.
            </span>
          </>
        )}
      </p>
    </aside>
  );
}
