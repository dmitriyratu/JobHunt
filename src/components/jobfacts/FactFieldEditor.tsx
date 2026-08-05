"use client";

import { useEffect, useRef, useState } from "react";
import {
  ALL_EMPLOYMENT_KINDS,
  ALL_WORKPLACE_KINDS,
  EMPLOYMENT_LABEL,
  WORKPLACE_LABEL,
  editFact,
  locationsFromInput,
  locationsToInput,
  salaryFromInput,
} from "@/lib/jobFacts";
import type { JobFactKey, JobFacts, SalaryRange } from "@/types";

/**
 * The editor for one fact, in the shape that fact actually has.
 *
 * A single text box for all ten would have been a quarter of this code and
 * wrong for six of them. "Setup" has exactly four answers and one of them is
 * "the posting doesn't say" — typed freehand it accumulates "Remote", "remote",
 * "Fully remote" and "REMOTE", none of which the rail card can render as a chip
 * or a future filter can group by. So the closed fields get a select, the open
 * ones get a box, and pay gets the four inputs it is actually made of.
 *
 * Every editor commits through `editFact`, which is what records the field as
 * hand-corrected. None of them writes to JobFacts directly.
 */

type Props = {
  factKey: JobFactKey;
  facts: JobFacts;
  onCommit: (next: JobFacts) => void;
  onCancel: () => void;
};

/** Shared chrome: Escape cancels, Enter commits, first field takes focus. */
function useEditorKeys(onCommit: () => void, onCancel: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    // Not in a textarea — none of these fields is more than one line, and Enter
    // is the fastest way out of a two-second correction.
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
  };
}

const FIELD_CLASS =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]";

function Actions({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <button
        onClick={onCommit}
        className="rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-[var(--color-on-accent)]"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)]"
      >
        Cancel
      </button>
    </div>
  );
}

/** Pay: four inputs, because that is how many a range is made of. */
function SalaryEditor({ facts, onCommit, onCancel }: Omit<Props, "factKey">) {
  const s: SalaryRange | null = facts.salary;
  const [min, setMin] = useState(s?.min?.toString() ?? "");
  const [max, setMax] = useState(s?.max?.toString() ?? "");
  const [period, setPeriod] = useState<SalaryRange["period"]>(s?.period ?? "year");
  const [currency, setCurrency] = useState(s?.currency || "USD");
  const [note, setNote] = useState(s?.note ?? "");
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  const commit = () => {
    const parse = (v: string) => {
      // Tolerates "185k", "185,000" and "$185,000" — people type what they see,
      // and rejecting a "k" would be the editor being pedantic about the one
      // form the panel itself prints.
      const cleaned = v.trim().toLowerCase().replace(/[$£€,\s]/g, "");
      if (!cleaned) return null;
      const k = cleaned.endsWith("k");
      const n = Number(k ? cleaned.slice(0, -1) : cleaned);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.round(k ? n * 1000 : n);
    };
    onCommit(
      editFact(facts, "salary", {
        salary: salaryFromInput({
          min: parse(min),
          max: parse(max),
          currency,
          period,
          note,
        }),
      }),
    );
  };

  const onKeyDown = useEditorKeys(commit, onCancel);

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-1.5">
        <input
          ref={firstRef}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Min"
          inputMode="numeric"
          aria-label="Minimum pay"
          className={FIELD_CLASS}
        />
        <span className="text-xs text-[var(--color-text-muted)]">–</span>
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="Max"
          inputMode="numeric"
          aria-label="Maximum pay"
          className={FIELD_CLASS}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency"
          className={FIELD_CLASS}
        >
          {["USD", "GBP", "EUR", "CAD", "AUD", "INR"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as SalaryRange["period"])}
          aria-label="Per"
          className={FIELD_CLASS}
        >
          <option value="year">per year</option>
          <option value="month">per month</option>
          <option value="day">per day</option>
          <option value="hour">per hour</option>
        </select>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="plus equity, bonus…"
        aria-label="What rides alongside base pay"
        className={`${FIELD_CLASS} mt-1.5`}
      />
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--color-text-muted)]">
        Clear both figures to record that the posting states no pay.
      </p>
      <Actions onCommit={commit} onCancel={onCancel} />
    </div>
  );
}

/** The closed fields: a fixed set of answers, one of which is "not stated". */
function ChoiceEditor({
  factKey,
  facts,
  onCommit,
  onCancel,
}: Props & { factKey: "workplace" | "employment" | "visa" }) {
  const current =
    factKey === "workplace"
      ? (facts.workplace ?? "")
      : factKey === "employment"
        ? (facts.employment ?? "")
        : facts.visaSponsorship === null
          ? ""
          : facts.visaSponsorship
            ? "available"
            : "not-offered";

  const [value, setValue] = useState<string>(current);
  const [note, setNote] = useState(facts.workplaceNote);
  const firstRef = useRef<HTMLSelectElement>(null);
  useEffect(() => firstRef.current?.focus(), []);

  const options =
    factKey === "workplace"
      ? ALL_WORKPLACE_KINDS.map((k) => ({ id: k as string, label: WORKPLACE_LABEL[k] }))
      : factKey === "employment"
        ? ALL_EMPLOYMENT_KINDS.map((k) => ({ id: k as string, label: EMPLOYMENT_LABEL[k] }))
        : [
            { id: "available", label: "Available" },
            { id: "not-offered", label: "Not offered" },
          ];

  const commit = () => {
    const patch: Partial<JobFacts> =
      factKey === "workplace"
        ? {
            workplace: (value || null) as JobFacts["workplace"],
            workplaceNote: note.trim().slice(0, 80),
          }
        : factKey === "employment"
          ? { employment: (value || null) as JobFacts["employment"] }
          : { visaSponsorship: value === "" ? null : value === "available" };
    onCommit(editFact(facts, factKey, patch));
  };

  const onKeyDown = useEditorKeys(commit, onCancel);

  return (
    <div onKeyDown={onKeyDown}>
      <select
        ref={firstRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Value"
        className={FIELD_CLASS}
      >
        <option value="">Not stated</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {/* Only setup carries a qualifier, and it is the qualifier that does the
          work — "Hybrid" alone doesn't tell you whether that is one day or four. */}
      {factKey === "workplace" && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="3 days on-site, US time zones…"
          aria-label="Condition"
          className={`${FIELD_CLASS} mt-1.5`}
        />
      )}
      <Actions onCommit={commit} onCancel={onCancel} />
    </div>
  );
}

/** Everything the posting writes as free text, plus locations as a short list. */
function TextEditor({
  factKey,
  facts,
  onCommit,
  onCancel,
}: Props & { factKey: "location" | "seniority" | "team" | "travel" | "posted" | "deadline" }) {
  const initial =
    factKey === "location"
      ? locationsToInput(facts.locations)
      : factKey === "seniority"
        ? facts.seniority
        : factKey === "team"
          ? facts.team
          : factKey === "travel"
            ? facts.travel
            : factKey === "posted"
              ? facts.postedAt
              : facts.deadline;

  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    const patch: Partial<JobFacts> =
      factKey === "location"
        ? { locations: locationsFromInput(value) }
        : factKey === "seniority"
          ? { seniority: trimmed.slice(0, 40) }
          : factKey === "team"
            ? { team: trimmed.slice(0, 80) }
            : factKey === "travel"
              ? { travel: trimmed.slice(0, 80) }
              : factKey === "posted"
                ? { postedAt: trimmed.slice(0, 40) }
                : { deadline: trimmed.slice(0, 40) };
    onCommit(editFact(facts, factKey, patch));
  };

  const placeholder =
    factKey === "location"
      ? "San Francisco, CA; New York, NY"
      : factKey === "seniority"
        ? "Senior, Staff, L5…"
        : factKey === "team"
          ? "Payments Infrastructure"
          : factKey === "travel"
            ? "Up to 25%"
            : factKey === "posted"
              ? "3 days ago"
              : "Aug 29, 2026";

  return (
    <div onKeyDown={useEditorKeys(commit, onCancel)}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Value"
        className={FIELD_CLASS}
      />
      {factKey === "location" && (
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--color-text-muted)]">
          One per line, or separated with semicolons.
        </p>
      )}
      <Actions onCommit={commit} onCancel={onCancel} />
    </div>
  );
}

export default function FactFieldEditor(props: Props) {
  const { factKey } = props;
  if (factKey === "salary") return <SalaryEditor {...props} />;
  if (factKey === "workplace" || factKey === "employment" || factKey === "visa") {
    return <ChoiceEditor {...props} factKey={factKey} />;
  }
  return <TextEditor {...props} factKey={factKey} />;
}
