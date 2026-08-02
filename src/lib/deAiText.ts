/**
 * The words the prompts forbid, checked rather than trusted.
 *
 * Split by what can safely be done about them. A qualifier can be deleted and
 * leave a grammatical sentence behind — "successfully shipped" is "shipped".
 * "Passionate about building great products" is not repairable by deletion; it
 * has to be rewritten or not written, so it is only reported.
 */
const DELETABLE = [
  "successfully",
  "effectively",
  "efficiently",
  "seamlessly",
  "holistically",
  "cutting-edge",
  "state-of-the-art",
  "world-class",
  "best-in-class",
  "highly",
  "truly",
  "very",
];

const REPORTED = [
  "delve",
  "leverage",
  "robust",
  "seamless",
  "holistic",
  "spearheaded",
  "pivotal",
  "testament to",
  "landscape",
  "realm",
  "resonate",
  "passionate",
  "thrilled",
  "honed",
  "adept",
  "synergy",
  "streamlined",
  "instrumental in",
  "played a key role",
  "proven track record",
  "fast-paced",
  "results-driven",
  "detail-oriented",
  "track record of",
  "wide range of",
  "variety of domains",
];

/**
 * Deletes the qualifiers that carry no information.
 *
 * Deliberately conservative: whole words only, and only ones whose removal
 * leaves the sentence intact. Everything harder is left for aiTells to report.
 */
export function stripFiller(text: string): string {
  let out = text;
  for (const word of DELETABLE) {
    out = out.replace(new RegExp(`\\b${word}\\b\\s*`, "gi"), "");
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Which forbidden words a piece of text still contains.
 *
 * Used to stop a correction making the writing worse: the grounding pass falls
 * back to the candidate's own line when a rewrite fails, and the candidate's
 * own line is exactly where "Passionate about building great products" and
 * "Seeking a challenging role where I can leverage my diverse skill set" live.
 * Reverting into one is a truthful answer to a question nobody asked.
 */
export function aiTells(text: string): string[] {
  const lower = text.toLowerCase();
  return [...DELETABLE, ...REPORTED].filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
}

/**
 * Strips the single most recognisable AI tell from generated prose: the em/en
 * dash.
 *
 * The letter prompt forbids them outright, but instruction-following on
 * punctuation isn't reliable enough to trust for something this visible to a
 * recruiter, so it is enforced deterministically here too.
 *
 * Substitution depends on what the dash is doing, because a blanket comma is
 * wrong for ranges:
 *   "2013–2019"          → "2013-2019"        (numeric range)
 *   "July 2024–Present"  → "July 2024 to Present"  (dated range)
 *   "12 years—the last four leading" → "12 years, the last four leading"
 */
export function removeDashTells(text: string): string {
  return (
    text
      // Numeric range: a hyphen, not a comma.
      .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
      // Dated range ending in a year and continuing with a word ("2024–Present").
      .replace(/(\b\d{4})\s*[—–]\s*(?=[A-Z])/g, "$1 to ")
      // A dash with nothing after it on the line is dropped outright. It must
      // not become a comma: doing that then needing to clean up the dangling
      // comma would also eat the real commas after "Hi Sam," and "Best,".
      .replace(/[ \t]*[—–]+[ \t]*$/gm, "")
      .replace(/^[ \t]*[—–]+[ \t]*/gm, "")
      // Everything else is a parenthetical or appositive break; a comma reads
      // cleanly in its place.
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/[ \t]+--[ \t]+/g, ", ")
      // A substituted comma can land against existing punctuation.
      .replace(/,[ \t]*([.,;:!?])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/gm, "")
  );
}
