/**
 * Splitting an uploaded document into the lines that can be cited.
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
 * Both are fixed here, by making the logical line — not the physical one — the
 * unit everything else addresses. sourceIndex hands these to the model with an
 * id apiece, so a citation is a reference to a whole line and the fragment
 * cannot be named, let alone reverted to.
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
 * A line that is nothing but a date or a date range.
 *
 * These sit directly under an entry's title line with no blank line between,
 * so joining continuations swallowed them: "Principal Engineer, Corvid
 * Logistics" plus "February 2021 - Present" became one citable line. Which
 * would be harmless, except the grounding pass falls back to a cited line when
 * a rewrite fails — and it duly reverted a Summary section to
 * "Principal Engineer, Corvid Logistics February 2021 - Present", printing a
 * job header as the candidate's summary.
 *
 * Neither piece is prose and neither is ever the source of a rewritten
 * sentence, so each stands alone and neither can absorb the other.
 */
function isDateLine(line: string): boolean {
  if (line.length > 48) return false;
  if (!/\d/.test(line)) return false;
  // Months, years, and the words that join them — and nothing else.
  return /^[\d\s\-–—/,.]*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|to|present|current|ongoing|now|expected|[\d\s\-–—/,.])+$/i.test(
    line
  );
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

      // A bare date line stands alone in both directions: it neither continues
      // the title above it nor absorbs whatever follows.
      if (isDateLine(line)) {
        if (current) out.push(current);
        out.push(line);
        current = "";
      } else if (MARKER.test(raw) || isHeading(line)) {
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


