import type { NameVariant } from "@/types";

/**
 * The same thing, written two ways.
 *
 * The proofread pass reads one word at a time, which is what lets it be safe:
 * a single token, present in the document, within two edits of its replacement.
 * That design cannot see the defect a reader notices first. On the CV that
 * prompted this, one institution appears as
 *
 *   "NewYork-Presbyterian Hospital / Weill Cornell Medical Center"   (training)
 *   "NewYork-Presbyterian – Weill Cornell Medical Center"            (leadership)
 *
 * Neither is misspelled. Both name the same hospital. The document is simply
 * inconsistent about its own employer, forty lines apart, which is exactly the
 * kind of thing that reads as carelessness on a page whose entire job is to look
 * careful. It is also what made the tailored resume flag an employer earlier:
 * two spellings in, one merged spelling out.
 *
 * WHY THE MODEL IS ASKED, AND WHAT IT IS NOT TRUSTED WITH
 * Deciding that two strings name one institution needs to know that
 * NewYork-Presbyterian and NewYork-Presbyterian Hospital are the same place, and
 * that Weill Cornell Medicine and Weill Cornell Medical Center are not quite. No
 * amount of string distance knows that.
 *
 * What it is not trusted with is the wording. A fix here can only ever
 * standardise on a form the candidate ALREADY WROTE somewhere in the document —
 * verified below by looking for it. So the worst case is being asked to unify on
 * the less good of two spellings, which is a decision the candidate makes by
 * rejecting. The model cannot introduce a name, correct one, or improve one.
 */

/** Word-level, for deciding whether two spans are plausibly the same name. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * How different two spellings of one name may be.
 *
 * Proportional overlap alone is not enough, and the document that motivated this
 * proved it on the first run. The model grouped
 *
 *   "Memorial Sloan Kettering Cancer Center/Weill Cornell Medicine"
 *   "Memorial Sloan Kettering Cancer Center / NewYork-Presbyterian – Weill Cornell Medical Center"
 *
 * which share seven words out of eleven — comfortably over any sane ratio — and
 * are not the same institution. Weill Cornell MEDICINE is the medical school in
 * the candidate's header; Weill Cornell MEDICAL CENTER is the hospital. Unifying
 * them would have rewritten her academic affiliation into a clinical one.
 *
 * What separates that pair from the real finding is not how much they share but
 * how much they DON'T. Two spellings of one name differ by a word or two —
 * "Hospital", a joiner, a suffix. The pair above differs by four. So the
 * symmetric difference is the test, and the ratio stays as a floor beneath it.
 */
const MAX_TOKEN_DIFF = 2;
const MIN_OVERLAP = 0.6;

function tooDifferent(a: string, b: string): boolean {
  const one = new Set(tokens(a));
  const two = new Set(tokens(b));
  if (!one.size || !two.size) return true;

  const only = [...one].filter((t) => !two.has(t)).length + [...two].filter((t) => !one.has(t)).length;
  if (only > MAX_TOKEN_DIFF) return true;

  const shared = [...one].filter((t) => two.has(t)).length;
  return shared / new Set([...one, ...two]).size < MIN_OVERLAP;
}

/** Occurrences of an exact span. Not word-bounded: a variant may end in punctuation. */
function countOf(text: string, span: string): number {
  if (!span) return 0;
  let count = 0;
  let at = text.indexOf(span);
  while (at !== -1) {
    count++;
    at = text.indexOf(span, at + span.length);
  }
  return count;
}

/** Two words is a phrase; one is a word, and words belong to the proofreader. */
const MIN_WORDS = 2;

/** Beyond this the "variants" are sentences, and sentences differ for reasons. */
const MAX_WORDS = 14;

/**
 * The groups worth showing, from whatever the model returned.
 *
 * Every variant has to be findable in the document verbatim, the group has to
 * hold at least two distinct ones, they have to look like the same name, and the
 * form to standardise on has to be one of them. A group failing any of those is
 * dropped rather than shown.
 */
export function verifyVariants(
  raw: { variants?: string[]; preferred?: string; note?: string }[] | undefined,
  text: string
): NameVariant[] {
  const out: NameVariant[] = [];
  const claimed = new Set<string>();

  for (const group of raw ?? []) {
    const seen = new Map<string, number>();
    for (const variant of group.variants ?? []) {
      const span = (variant ?? "").trim();
      if (!span || seen.has(span)) continue;

      const words = span.split(/\s+/).length;
      if (words < MIN_WORDS || words > MAX_WORDS) continue;

      const count = countOf(text, span);
      if (!count) continue;

      seen.set(span, count);
    }

    if (seen.size < 2) continue;

    const variants = [...seen].map(([span, count]) => ({ text: span, count }));

    // Every pair, not merely one of them: a group of three where two match and
    // the third is a different organisation would otherwise rewrite the third.
    const similar = variants.every((a, i) =>
      variants.every((b, j) => i === j || !tooDifferent(a.text, b.text))
    );
    if (!similar) continue;

    const preferred = (group.preferred ?? "").trim();
    if (!seen.has(preferred)) continue;

    // A span already spoken for by another group would make the fixes fight.
    if (variants.some((v) => claimed.has(v.text))) continue;
    variants.forEach((v) => claimed.add(v.text));

    out.push({
      variants: variants.sort((a, b) => b.count - a.count),
      preferred,
      note: (group.note ?? "").trim(),
    });
  }

  return out;
}

/**
 * One group standardised, by rewriting every variant to the preferred one.
 *
 * ONE LEFT-TO-RIGHT PASS, AND IT HAS TO BE. The obvious implementation —
 * replace each non-preferred variant in turn — is wrong whenever one variant is
 * a substring of another, which for institution names is the common case rather
 * than the exotic one. Unifying "NewYork-Presbyterian Hospital" into
 * "NewYork-Presbyterian Hospital / Weill Cornell" found the short form sitting
 * inside the long one, which was already correct, and produced
 * "…Hospital / Weill Cornell / Weill Cornell". Sorting the replacements by
 * length does not help: the damage is to text that was right before the pass
 * started.
 *
 * So the preferred form is matched too, and rewritten to itself. Every position
 * is visited once, the longest variant wins where several could match, and
 * anything already correct is consumed rather than descended into.
 */
export function applyVariant(text: string, issue: NameVariant): string {
  const alternatives = issue.variants
    .map((v) => v.text)
    // Longest first: JS alternation takes the first branch that matches at a
    // position, not the longest, so the order here is what makes it greedy.
    .sort((a, b) => b.length - a.length)
    .map((span) => span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (!alternatives.length) return text;
  return text.replace(new RegExp(alternatives.join("|"), "g"), issue.preferred);
}

export function applyVariants(text: string, issues: NameVariant[]): string {
  return issues.reduce(applyVariant, text);
}
