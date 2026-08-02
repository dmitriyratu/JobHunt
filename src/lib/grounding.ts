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

// --- Citations --------------------------------------------------------------

/** Words too common to prove a citation was used. */
const COMMON = new Set([
  "the", "and", "for", "with", "that", "this", "from", "was", "were", "has",
  "had", "have", "which", "into", "over", "our", "their", "its", "all", "not",
  "but", "are", "been", "than", "then", "them", "also", "about", "team",
  "teams", "work", "worked", "working", "responsible", "helped", "built",
  "build", "made", "using", "used", "across", "through", "within",
]);

const distinctive = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9$%.]+/)
      .filter((w) => w.length >= 4 && !COMMON.has(w))
  );

/**
 * The cited lines a value actually drew on.
 *
 * A citation that shares nothing with the value it supposedly supports is not
 * evidence, and it is not harmless: the number check reads the union of every
 * cited line, so a line cited but unused donates its figures to the "supported"
 * set and can walk an invented number straight past the check. Observed in the
 * volume run — a bullet about code review guidelines citing "Took part in the
 * hiring process as an interviewer", which it plainly did not use.
 *
 * A single citation is always kept: one unused citation is a mis-citation to
 * report, not grounds for leaving a bullet with no source at all, and a heavily
 * reworded bullet can legitimately share little surface with its origin.
 */
export function usedCitations(value: string, sources: string[]): string[] {
  if (sources.length <= 1) return sources;

  const words = distinctive(value);
  const figures = new Set(numbersIn(value));

  const used = sources.filter((source) => {
    if (numbersIn(source).some((n) => figures.has(n))) return true;
    return [...distinctive(source)].some((w) => words.has(w));
  });

  // Every citation looking unused means the heuristic is wrong about this
  // bullet, not that the writer invented all of it. Leave it alone.
  return used.length ? used : sources;
}

/**
 * Numbers the document spells out, as digits.
 *
 * "over twelve years" and "12+ years" are the same claim, and only one of them
 * is a numeral. Without this the fabrication check — the one rule still allowed
 * to rewrite text — read "12" as appearing nowhere in the source and rewrote a
 * faithful summary. Resumes spell out small numbers constantly, so this is the
 * common case, not the edge.
 *
 * Deliberately one-way and generous: it only ever ADDS figures to the supported
 * set. A miss here re-creates the bug; a spurious match costs nothing, because
 * the model checker still reads the claim afterwards.
 */
const WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13",
  fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40",
  fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", thousand: "1000", million: "1000000", billion: "1000000000",
  dozen: "12", half: "0.5", quarter: "0.25",
};

export function spelledNumbers(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    const digits = WORDS[word];
    if (digits) out.push(digits);
  }
  return out;
}

// --- Skills -----------------------------------------------------------------

/**
 * A skill reduced to what it actually says.
 *
 * Lowercased with every separator flattened to a single space, so "Node.js",
 * "node js" and "NODE.JS" are one string, and so is "fine-tuning" against
 * "fine tuning". `+` and `#` survive because they are the whole difference
 * between C, C++ and C#.
 */
export function skillKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

/**
 * Skills the candidate's own document does not literally contain.
 *
 * NOT the same question as "is this skill invented", which is why the result is
 * called a candidate list rather than a verdict. This is the free half of the
 * check: anything found here is certainly the candidate's and needs no further
 * thought, and only what is left costs a model call.
 *
 * WHAT THIS USED TO DO, AND WHY IT WAS WRONG
 * It compared the writer's list against `source` — the writer's own summary of
 * what the document listed — by exact string equality, and deleted anything
 * that didn't match a whole item. The prompt asks the writer to regroup
 * keywords, so a source line reading "LLM systems (RAG, agents, fine-tuning)"
 * arrives as ONE source item and sensibly comes back as four. None of the four
 * equals the one, so all four were deleted as invented — on a resume that
 * states them in those exact words, for a posting that asked for them. The
 * check punished the writer for doing what it was told.
 *
 * Two changes fix that class of error. The document itself is searched, not
 * just the writer's summary of it — a copy of a copy was never the right thing
 * to check against, and `resumeText` was already being passed into this pass
 * for the bullet checker. And matching is on word boundaries within the
 * normalised text rather than on whole items, so a keyword lifted out of a
 * longer line still counts. Boundaries matter: "Java" must not match inside
 * "JavaScript".
 */
export function skillsWithoutLiteralSupport(
  value: ResumeSkillGroup[],
  source: ResumeSkillGroup[],
  resumeText: string
): string[] {
  const haystack = ` ${[
    ...source.flatMap((g) => g.items).map(skillKey),
    skillKey(resumeText),
  ].join(" ")} `;

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value.flatMap((g) => g.items)) {
    const key = skillKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (haystack.includes(` ${key} `)) continue;
    out.push(item);
  }
  return out;
}

/**
 * Removes exactly the skills named, leaving groups that still have something.
 *
 * Takes the list to delete rather than deriving it, because the decision is now
 * made in two stages — a text search and, for what survives it, a model — and a
 * function that re-derived it here could only ever repeat the first.
 */
export function pruneSkills(
  value: ResumeSkillGroup[],
  remove: string[]
): ResumeSkillGroup[] {
  const gone = new Set(remove.map(skillKey));
  return value
    .map((g) => ({ ...g, items: g.items.filter((i) => !gone.has(skillKey(i))) }))
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
