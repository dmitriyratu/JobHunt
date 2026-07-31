/**
 * Turning a citation into the whole line it came from.
 *
 * An uploaded resume arrives hard-wrapped — PDF and DOCX extraction both break
 * a long bullet across physical lines, and the model can only cite what it can
 * see. So it cites the first physical line, and two things go wrong:
 *
 *   - The grounding check reads a fragment as the whole source. A bullet saying
 *     "serving about 400 internal users" cites a line that stops at "which
 *     involved", the figure appears in no cited line, and it is flagged.
 *   - The revert that follows falls back to that fragment, and a bullet ending
 *     mid-sentence on "which involved" reaches a document the user sends to an
 *     employer. Observed on 2 of 8 generations from a wrapped resume, and on 0
 *     of 8 from an unwrapped one.
 *
 * Both are fixed by resolving citations against the source after the fact
 * rather than by rewriting what the model reads: the prompt keeps working on
 * the document as uploaded, and nothing downstream ever sees half a line.
 */

/** Bullet markers, including the numbered kinds. */
const MARKER = /^\s*(?:[-*•‣◦]|\d+[.)])\s+/;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A section heading — "SUMMARY", "WORK HISTORY", "TECHNICAL SKILLS".
 *
 * Headings usually sit directly above their content with no blank line, so
 * without this they are absorbed into the first paragraph and a fallback can
 * put the word "SUMMARY" at the front of a finished resume line. Requires a
 * letter and no lowercase, and stays short, so a shouted bullet does not
 * qualify.
 */
function isHeading(line: string): boolean {
  return line.length <= 40 && /[A-Z]/.test(line) && !/[a-z]/.test(line);
}

/**
 * The document as logical lines: one per bullet, one per paragraph.
 *
 * Blocks are separated by blank lines, and within a block every bullet marker
 * starts a new line. Anything else is a continuation of the line above, which
 * is what re-joins a wrapped bullet. A block with no markers — a summary
 * paragraph, an address header — becomes one line, which is right: its
 * sentences were never separate lines to begin with.
 */
export function logicalLines(text: string): string[] {
  const out: string[] = [];

  for (const block of text.split(/\n\s*\n/)) {
    let current = "";
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      if (MARKER.test(raw) || isHeading(line)) {
        if (current) out.push(current);
        current = line.replace(MARKER, "");
        // A heading takes no continuations: the line under it opens the body.
        if (!MARKER.test(raw)) {
          out.push(current);
          current = "";
        }
      } else if (current) {
        current += ` ${line}`;
      } else {
        current = line;
      }
    }
    if (current) out.push(current);
  }

  return out.map(squash).filter(Boolean);
}

/**
 * A cited fragment, grown back to the line it was cut from.
 *
 * Prefix first, because a wrapped citation is the opening of its line and that
 * is the only match that cannot be a coincidence. Containment second, for a
 * citation taken from the middle of a wrapped bullet. Shortest match wins:
 * where two logical lines both contain the fragment, the tighter one is the
 * more likely origin, and over-growing a citation would hand the check more
 * evidence than the writer actually had.
 *
 * A citation that matches nothing is returned untouched — the model is asked
 * for verbatim lines but paraphrases sometimes, and a citation this cannot
 * place is still the best record of what it drew on.
 */
export function expandCitation(cited: string, lines: string[]): string {
  const needle = squash(cited).toLowerCase();
  if (!needle) return cited;

  let best: string | undefined;
  for (const line of lines) {
    const hay = line.toLowerCase();
    if (hay === needle) return line;
    if (!hay.startsWith(needle)) continue;
    if (!best || line.length < best.length) best = line;
  }
  if (best) return best;

  for (const line of lines) {
    if (!line.toLowerCase().includes(needle)) continue;
    if (!best || line.length < best.length) best = line;
  }
  return best ?? cited;
}
