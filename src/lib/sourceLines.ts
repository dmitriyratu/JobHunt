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
 * How long a physical line has to be before the line under it is read as its
 * continuation rather than as a line of its own.
 *
 * Length is the primary signal because a wrap is a fact about width, not about
 * grammar: lines that wrapped all stop within a few characters of the same
 * margin, and lines meant to be short — a name, "Languages: Python, Go" — stop
 * well before it. Grammar-based tests (does the next line start lowercase?) get
 * this wrong on every bullet that wraps onto a proper noun.
 */
const WRAP_MIN = 55;

/**
 * A line laying out an entry's header rather than running on into the next one.
 *
 * The pipe is the tell, and a reliable one: resume templates set the
 * employer/location/date row as columns, and every extractor flattens columns to
 * a single line with their separators intact. A date at the end catches the
 * templates that use whitespace columns instead.
 *
 * Without this an entry header — long, and with no full stop — was continuable
 * by width alone, so it swallowed the job title beneath it and, worse, a bullet
 * running up to the next employer swallowed that employer's whole header. That
 * made one citable line out of two jobs, and `groundingPass` reverts a failed
 * rewrite to the cited line, which is how a job header can end up printed as
 * somebody's Summary.
 */
const ENTRY_HEADER = /\||(?:\b(?:19|20)\d{2}|\b(?:present|current|ongoing|now))\s*$/i;

/** A line opening a labelled field — "Data Infrastructure: MLOps, AWS ECS, …". */
const NEW_FIELD = /^[A-Z][A-Za-z/&+ ]{2,30}:\s/;

/** Whether `next` continues `prev` rather than starting a line of its own. */
function continues(prev: string, next: string, bullet: boolean): boolean {
  if (ENTRY_HEADER.test(next) || NEW_FIELD.test(next)) return false;
  // A hyphen left at a line end is always the typesetter's, never the author's.
  if (/[a-z0-9]-$/i.test(prev)) return true;
  if (ENTRY_HEADER.test(prev)) return false;
  // Everything after a bullet's marker and before the next one belongs to that
  // bullet, so its internal breaks are all the page's — no width test needed.
  if (bullet) return true;
  if (prev.length < WRAP_MIN) return false;
  // A trailing full stop or colon ends a line whatever its length: it is the
  // author saying the line finished here.
  return !/[.!?:]$/.test(prev);
}

/**
 * One run's physical lines, with wraps rejoined and deliberate breaks kept.
 *
 * A line broken mid-word keeps its hyphen ("LLM- based" → "LLM-based") rather
 * than losing it ("achiev- ing" → "achiev-ing", not "achieving"). Dropping it
 * reads better on a word hyphenated for justification and silently corrupts one
 * broken at a real hyphen — "gradient-boosted" would come out "gradientboosted"
 * — and a visible oddity beats an invisible wrong word in a document that gets
 * sent to an employer.
 */
function rejoinWraps(parts: string[], bullet: boolean): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const prev = out[out.length - 1];
    if (prev && continues(prev, part, bullet)) {
      out[out.length - 1] = prev.endsWith("-") ? prev + part : `${prev} ${part}`;
    } else {
      out.push(part);
    }
  }
  return out;
}

/** A logical line and what the document was using it for. */
export type LogicalLine = {
  kind: "heading" | "date" | "bullet" | "para";
  text: string;
};

/**
 * The document as logical lines, each labelled with its role.
 *
 * The labels come free — the split already has to recognise a heading, a bare
 * date and a bullet marker to know where one line ends — and throwing them away
 * meant the preview had to work them out a second time, from text that had by
 * then lost its markers. `logicalLines` is this with the labels dropped, so the
 * rules a citation is addressed by and the rules the document is laid out by
 * for the reader are one set of rules.
 */
export function logicalBlocks(text: string): LogicalLine[] {
  const out: LogicalLine[] = [];

  for (const block of text.split(/\n\s*\n/)) {
    let current: { kind: LogicalLine["kind"]; parts: string[] } | null = null;

    /**
     * Closes the run, re-splitting it on the breaks that were real.
     *
     * Only the first line out of the rejoin still carries the run's kind:
     * whatever split off did so precisely because it started something else.
     */
    const flush = () => {
      if (!current) return;
      const { kind, parts } = current;
      current = null;
      rejoinWraps(parts, kind === "bullet").forEach((text, i) =>
        out.push({ kind: i === 0 ? kind : "para", text })
      );
    };

    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      // A bare date line stands alone in both directions: it neither continues
      // the title above it nor absorbs whatever follows.
      if (isDateLine(line)) {
        flush();
        out.push({ kind: "date", text: line });
      } else if (MARKER.test(raw)) {
        flush();
        current = { kind: "bullet", parts: [line.replace(MARKER, "")] };
      } else if (isHeading(line)) {
        // A heading takes no continuations: the line under it opens the body.
        flush();
        out.push({ kind: "heading", text: line });
      } else if (current) {
        current.parts.push(line);
      } else {
        current = { kind: "para", parts: [line] };
      }
    }
    flush();
  }

  return out.map((l) => ({ ...l, text: squash(l.text) })).filter((l) => l.text);
}

/**
 * The document as logical lines: one per bullet, one per paragraph, one per
 * entry header.
 *
 * Blocks are separated by blank lines, and within a block every bullet marker
 * starts a new line. A line that merely wrapped continues the one above it; a
 * line the author meant to break — a contact row, a skills label, the header of
 * the next job — does not. Getting that distinction wrong in either direction
 * is what this file exists to avoid: too eager and two jobs become one citable
 * line, too shy and a sentence is cited by its first fragment.
 */
export function logicalLines(text: string): string[] {
  return logicalBlocks(text).map((l) => l.text);
}


