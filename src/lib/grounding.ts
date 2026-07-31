import type { Grounded, ResumeSection, ResumeSkillGroup } from "@/types";

/**
 * Checking that the tailored document only says what the uploaded one said.
 *
 * The prompt asks the model not to invent; this is what makes that checkable
 * rather than merely requested. Every rewritten value already carries the
 * `source` line it came from, so verification is a set of small
 * value-against-source questions rather than a re-read of the whole document.
 *
 * Two kinds of check, deliberately separated:
 *
 * The deterministic ones live here. They are exact, free, and cover the failure
 * that does the most damage — a fabricated number. Asking a language model
 * whether "38%" appears in a string is probabilistic string matching; a regex
 * is not.
 *
 * The semantic one is a model call (see /api/tailor-resume), because "managed a
 * team" from "worked alongside the team" is drift no pattern will catch.
 */

export type GroundedPair = {
  /** Addresses one value in the draft. See applyValues. */
  id: string;
  value: string;
  /** Every line the writer cited. Checked as a whole, never line by line. */
  sources: string[];
};

export type Violation = {
  id: string;
  reason: string;
};

// --- Numbers ----------------------------------------------------------------

/**
 * Numeric tokens, normalised enough to compare across rewording.
 *
 * Commas are separators, not digits, so "1,200" and "1200" are one number.
 * Trailing zeros after a decimal point are noise, so "99.90" and "99.9" are one
 * number and so are "40.0" and "40" — the zeros are only stripped when there is
 * a decimal point, or "100" would become "1". Everything else is left alone:
 * "p99" yields 99, "2021" yields 2021, and both are fine, because the question
 * is only ever whether the same figure appears on both sides.
 */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    let n = match[0].replace(/,/g, "");
    if (n.includes(".")) n = n.replace(/0+$/, "").replace(/\.$/, "");
    if (n) out.push(n);
  }
  return out;
}

/**
 * Figures the rewrite states that none of its cited lines do.
 *
 * The union, because combining is allowed: a bullet that takes a system from
 * one line and a volume from another is correct, and checking each line alone
 * would reject it. What it cannot do is state a figure that appears in none of
 * them.
 *
 * Deliberately strict about derivation: "8 years" computed from a pair of dates
 * is reported, because no cited line says it. The consequence is a repair
 * attempt and then a fallback to the candidate's own wording, which is never
 * worse than what they wrote themselves.
 */
export function unsupportedNumbers(value: string, sources: string[]): string[] {
  const cited = new Set(sources.flatMap(numbersIn));
  return [...new Set(numbersIn(value))].filter((n) => !cited.has(n));
}

// --- Skills -----------------------------------------------------------------

const normaliseSkill = (s: string) => s.trim().toLowerCase();

/**
 * Skills claimed that the original document never listed.
 *
 * Containment rather than permutation: dropping a skill is allowed — the prompt
 * asks for a selective list — but adding one is a claim about the candidate
 * that nothing supports.
 */
export function unsupportedSkills(
  value: ResumeSkillGroup[],
  source: ResumeSkillGroup[]
): string[] {
  const known = new Set(source.flatMap((g) => g.items).map(normaliseSkill));
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value.flatMap((g) => g.items)) {
    const key = normaliseSkill(item);
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Drops unsupported skills, leaving groups that still have something in them. */
export function pruneSkills(
  value: ResumeSkillGroup[],
  source: ResumeSkillGroup[]
): ResumeSkillGroup[] {
  const known = new Set(source.flatMap((g) => g.items).map(normaliseSkill));
  return value
    .map((g) => ({ ...g, items: g.items.filter((i) => known.has(normaliseSkill(i))) }))
    .filter((g) => g.items.length > 0);
}

// --- Addressing the draft ---------------------------------------------------

/**
 * Every value worth checking, as an id/value/source triple.
 *
 * Skips anything the model left alone — an untouched line is its own source and
 * cannot have drifted — and anything it dropped, which never reaches the page.
 * On a typical document that is most of the bullets, which is what keeps the
 * verification call small.
 */
export function collectPairs(sections: ResumeSection[]): GroundedPair[] {
  const pairs: GroundedPair[] = [];

  for (const section of sections) {
    const prose = section.prose;
    if (prose && prose.value.trim() && !isVerbatim(prose)) {
      pairs.push({ id: `prose:${section.key}`, value: prose.value, sources: prose.sources });
    }

    for (const entry of section.entries ?? []) {
      for (const bullet of entry.bullets) {
        if (bullet.dropped) continue;
        if (!bullet.value.trim() || isVerbatim(bullet)) continue;
        pairs.push({ id: bullet.id, value: bullet.value, sources: bullet.sources });
      }
    }
  }

  return pairs;
}

/**
 * Writes corrected values back, by the ids collectPairs handed out.
 *
 * Only `value` moves. `source` is the record of what the uploaded document
 * said and must survive any number of repair rounds — overwriting it would
 * destroy the evidence the next check is made against.
 */
export function applyValues(
  sections: ResumeSection[],
  fixes: Map<string, string>
): ResumeSection[] {
  if (fixes.size === 0) return sections;

  return sections.map((section) => {
    const proseFix = fixes.get(`prose:${section.key}`);

    return {
      ...section,
      prose:
        section.prose && proseFix !== undefined
          ? { ...section.prose, value: proseFix }
          : section.prose,
      entries: section.entries?.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map((bullet) => {
          const fix = fixes.get(bullet.id);
          return fix === undefined ? bullet : { ...bullet, value: fix };
        }),
      })),
    };
  });
}

/** Copied straight through: its own source, so nothing can have drifted. */
function isVerbatim(field: Grounded): boolean {
  return field.sources.length === 1 && field.sources[0] === field.value;
}

/** The deterministic pass: which pairs state a figure their sources don't. */
export function checkNumbers(pairs: GroundedPair[]): Violation[] {
  return pairs.flatMap((pair) => {
    const bad = unsupportedNumbers(pair.value, pair.sources);
    if (!bad.length) return [];
    return [
      {
        id: pair.id,
        reason: `states ${bad.map((n) => `"${n}"`).join(", ")}, which none of the lines it cites do`,
      },
    ];
  });
}
