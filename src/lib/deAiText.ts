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
