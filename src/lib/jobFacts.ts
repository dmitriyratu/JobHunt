/**
 * Reading and formatting the posting's own terms. The types live in @/types
 * beside Session, which is what stores them.
 */

import type {
  EmploymentKind,
  JobFactKey,
  JobFacts,
  SalaryRange,
  WorkplaceKind,
} from "@/types";

export const EMPTY_JOB_FACTS: JobFacts = {
  salary: null,
  locations: [],
  workplace: null,
  workplaceNote: "",
  employment: null,
  seniority: "",
  team: "",
  postedAt: "",
  deadline: "",
  visaSponsorship: null,
  travel: "",
  extractedAt: "",
  editedKeys: [],
};

/**
 * Repairs a stored JobFacts, or passes null through.
 *
 * Only `editedKeys` needs it so far — it arrived after the facts themselves, so
 * records written in between have every field but that one, and it is read as an
 * array on every render of the panel. Kept here rather than inlined at the
 * hydration site so the next field to arrive late has somewhere obvious to go.
 */
export function normalizeJobFacts(facts: JobFacts | null | undefined): JobFacts | null {
  if (!facts) return null;
  return Array.isArray(facts.editedKeys) ? facts : { ...facts, editedKeys: [] };
}

export const WORKPLACE_LABEL: Record<WorkplaceKind, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

export const ALL_WORKPLACE_KINDS: WorkplaceKind[] = ["remote", "hybrid", "onsite"];

export const ALL_EMPLOYMENT_KINDS: EmploymentKind[] = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
];

export const EMPLOYMENT_LABEL: Record<EmploymentKind, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
  temporary: "Temporary",
};

const PERIOD_SUFFIX: Record<SalaryRange["period"], string> = {
  year: "/yr",
  month: "/mo",
  day: "/day",
  hour: "/hr",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  CAD: "CA$",
  AUD: "A$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
};

/**
 * Rounds an annual figure to "180k" but leaves an hourly one alone.
 *
 * 220000 → "220k" is the form every job board uses and the only one that fits
 * in a chip; 110 → "0k" is what a blanket rule would have produced, so the
 * threshold is on the number rather than on the period.
 */
function compact(amount: number): string {
  if (amount >= 10_000) {
    const thousands = amount / 1000;
    const rounded = Number.isInteger(thousands) ? thousands : Math.round(thousands);
    return `${rounded}k`;
  }
  return amount.toLocaleString();
}

/** "$180k – $220k/yr", or null when the posting stated no pay at all. */
export function formatSalary(salary: SalaryRange | null): string | null {
  if (!salary) return null;
  const { min, max, currency, period } = salary;
  if (min === null && max === null) return salary.raw.trim() || null;

  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()] ?? (currency ? `${currency} ` : "");
  const suffix = PERIOD_SUFFIX[period];
  const lo = min === null ? null : `${symbol}${compact(min)}`;
  const hi = max === null ? null : `${symbol}${compact(max)}`;

  if (lo && hi) return `${lo} – ${hi}${suffix}`;
  if (lo) return `${lo}+${suffix}`;
  return `up to ${hi}${suffix}`;
}

/** "San Francisco, CA" — or "San Francisco, CA +2" when several were named. */
export function formatLocations(locations: string[]): string | null {
  const named = locations.map((l) => l.trim()).filter(Boolean);
  if (named.length === 0) return null;
  if (named.length === 1) return named[0];
  return `${named[0]} +${named.length - 1}`;
}

export type FactRow = {
  key: JobFactKey;
  label: string;
  /** Null when the posting never said. Rendered as "Not stated", not hidden. */
  value: string | null;
  /** A qualifier that belongs with the value but not inside it. */
  hint?: string;
  /**
   * True for the two facts people actually sort by. The compact treatments
   * (a chip row, a line on a rail card) show only these; the full ones lead
   * with them.
   */
  primary?: boolean;
};

/**
 * The facts in the order they are worth reading, unstated ones included.
 *
 * Callers with room show every row and let "Not stated" do its job. Callers
 * without room — chips, the rail card — filter to `value !== null` and often to
 * `primary`. Keeping the ordering and the labelling in one place is what stops
 * the sidebar and the chip strip disagreeing about whether it's "Type" or
 * "Employment".
 */
export function factRows(facts: JobFacts): FactRow[] {
  return [
    {
      key: "salary",
      label: "Pay",
      value: formatSalary(facts.salary),
      hint: facts.salary?.note ?? "",
      primary: true,
    },
    {
      key: "workplace",
      label: "Setup",
      value: facts.workplace ? WORKPLACE_LABEL[facts.workplace] : null,
      hint: facts.workplaceNote,
      primary: true,
    },
    {
      key: "location",
      label: "Location",
      value: formatLocations(facts.locations),
      primary: true,
    },
    {
      key: "employment",
      label: "Type",
      value: facts.employment ? EMPLOYMENT_LABEL[facts.employment] : null,
    },
    { key: "seniority", label: "Level", value: facts.seniority || null },
    { key: "team", label: "Team", value: facts.team || null },
    {
      key: "visa",
      label: "Sponsorship",
      value:
        facts.visaSponsorship === null
          ? null
          : facts.visaSponsorship
            ? "Available"
            : "Not offered",
    },
    { key: "travel", label: "Travel", value: facts.travel || null },
    { key: "posted", label: "Posted", value: facts.postedAt || null },
    { key: "deadline", label: "Apply by", value: facts.deadline || null },
  ];
}

/** How many of the ten are answered, whether by the posting or by hand. */
export function statedCount(facts: JobFacts): number {
  return factRows(facts).filter((row) => row.value !== null).length;
}

export function hasAnyFact(facts: JobFacts | null): facts is JobFacts {
  return facts !== null && statedCount(facts) > 0;
}

// --- Corrections ------------------------------------------------------------

/**
 * Applies a hand correction and records that it was one.
 *
 * Every edit goes through here rather than through a plain spread at each call
 * site, because the bookkeeping is the easy half to forget and the half the
 * panel's honesty rests on: a field typed over must never still be counted as
 * something the posting said.
 *
 * Marks the key even when the new value equals the old one. "I checked this and
 * it is right" is a different state from "nobody has looked", and it is the more
 * useful of the two to keep — re-reading the posting to confirm a blank is work
 * you should only have to do once.
 */
export function editFact(
  facts: JobFacts,
  key: JobFactKey,
  patch: Partial<JobFacts>,
): JobFacts {
  return {
    ...facts,
    ...patch,
    editedKeys: facts.editedKeys.includes(key) ? facts.editedKeys : [...facts.editedKeys, key],
  };
}

/**
 * Turns typed numbers into a SalaryRange, or into nothing.
 *
 * Nothing is the important half: clearing both figures has to be a way of
 * saying "this posting doesn't state pay", or a mistyped salary could never be
 * taken back to blank — only replaced with a different wrong number.
 */
export function salaryFromInput(input: {
  min: number | null;
  max: number | null;
  currency: string;
  period: SalaryRange["period"];
  note: string;
}): SalaryRange | null {
  let { min, max } = input;
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  return {
    min,
    max,
    currency: input.currency.trim().toUpperCase(),
    period: input.period,
    // Written from the figures rather than left holding the posting's sentence:
    // `raw` means "what the posting said", and after an edit that sentence is
    // no longer what this range represents.
    raw: "",
    note: input.note.trim().slice(0, 80),
  };
}

/**
 * The one-line form the location editor reads and writes.
 *
 * Semicolons, not commas. A location is "San Francisco, CA" — the comma is
 * inside the value, not between values — so a comma-separated list turns two
 * places into four the first time anyone edits one, and the panel then reports
 * "Austin +3" for a job in two cities. The separator has to be a character the
 * values themselves don't contain.
 */
export function locationsToInput(locations: string[]): string {
  return locations.join("; ");
}

export function locationsFromInput(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}
