import { logicalLines } from "./sourceLines";

/**
 * The uploaded document as addressable lines.
 *
 * WHY CITATION BY REFERENCE RATHER THAN BY COPY
 * A tailored bullet has to say which lines of the candidate's own document it
 * was built from. The first design had the model copy those lines out verbatim,
 * which sounds simplest and is not: a copy can be wrong in ways a reference
 * cannot, and every one of those ways actually happened.
 *
 *   - The model copied a hard-wrapped line as far as the wrap, so a bullet
 *     citing "…which involved" was checked against a fragment, flagged for a
 *     figure it could not see, and then REVERTED to that fragment — a resume
 *     bullet ending mid-clause.
 *   - It copied the list marker sometimes and not others, so a verbatim
 *     citation stopped matching the value it was identical to.
 *   - It paraphrased citations, which are supposed to be quotations.
 *
 * None of those are representable here. A citation is an id or it is nothing.
 *
 * It is also markedly cheaper. Copying three source lines per bullet across a
 * thirty bullet document is on the order of two thousand output tokens of pure
 * duplication, billed at the output rate; ids cost a handful.
 *
 * WHAT IT COSTS
 * One failure mode gets quieter rather than rarer. A miscopied quotation is
 * visibly wrong and can be caught by string comparison; a wrong-but-valid id
 * looks perfectly healthy and is only caught downstream, when the checker reads
 * the resolved line against the claim. That trade is worth making, but it is a
 * trade.
 */

export type SourceLine = {
  /** Stable across re-extraction and reordering: derived from the text itself. */
  id: string;
  text: string;
};

/**
 * FNV-1a, base36.
 *
 * Not cryptographic and does not need to be — this only has to be stable for
 * the same line and different for different ones, within one document. Chosen
 * over node:crypto so the same function runs unchanged in any environment.
 */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Every line of the document, addressable.
 *
 * Ids are content-derived so that regenerating from the same upload produces
 * the same citations, and so a stored citation still resolves after the
 * document is re-extracted. Two identical lines would collide, so a repeat gets
 * a suffix — rare, but a resume that lists "Volunteer" twice should not have
 * one of them silently address the other.
 */
export function indexSource(text: string): SourceLine[] {
  const seen = new Map<string, number>();

  return logicalLines(text).map((line) => {
    const base = `L${hash(line)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { id: n === 0 ? base : `${base}-${n}`, text: line };
  });
}

/**
 * The document as the model sees it, one addressable line per row.
 *
 * Ids lead so that the association is unmissable while it reads, and so a line
 * it wants to cite is never far from the token it has to emit.
 */
export function formatIndexed(lines: SourceLine[]): string {
  return lines.map((l) => `[${l.id}] ${l.text}`).join("\n");
}

/**
 * Citations back into text.
 *
 * Deliberately tolerant of a model that ignores the protocol. An id it invented
 * resolves to nothing and is dropped; a line it quoted instead of referencing
 * is matched by content and kept. Being strict here would mean discarding real
 * provenance over a formatting mistake, and a bullet with no sources is treated
 * as unverifiable — the strictness would cost exactly what it was meant to
 * protect.
 */
export function resolveCitations(raw: string[] | undefined, lines: SourceLine[]): string[] {
  const byId = new Map(lines.map((l) => [l.id.toLowerCase(), l.text]));
  const byText = new Map(lines.map((l) => [normalise(l.text), l.text]));

  const out: string[] = [];
  for (const item of raw ?? []) {
    const token = item.trim();
    if (!token) continue;

    const resolved =
      byId.get(token.toLowerCase()) ??
      byId.get(token.replace(/^[[\]\s]+|[[\]\s]+$/g, "").toLowerCase()) ??
      byText.get(normalise(token)) ??
      // A quoted line the model shortened or reflowed: match on its opening,
      // which is the half a copy is least likely to have mangled.
      lines.find((l) => normalise(l.text).startsWith(normalise(token)) && token.length > 24)?.text;

    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** Too common to say anything about whether a line reached the page. */
const COMMON = new Set([
  "the", "and", "for", "with", "that", "this", "from", "was", "were", "has",
  "had", "have", "which", "into", "over", "our", "their", "its", "all", "not",
  "but", "are", "been", "than", "then", "them", "also", "about",
]);

/** The words worth matching on: long enough to mean something, plus figures. */
function distinctive(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length >= 3 && !COMMON.has(w));
}

/**
 * Lines of the upload that no part of the finished document draws on.
 *
 * This compared against citations alone, and reported four lines of this
 * resume as unused while every one of them was printed on the page: the
 * contact header, the DefenseStorm heading, the whole skills block and the
 * education line. All four are copied through rather than rewritten — a
 * heading, an employer, a date, a keyword and a profile field are not bullets
 * and cite nothing, so a citation-only test cannot see them arrive.
 *
 * So the test is what the document says, not what it footnotes: `printed` is
 * every string the page ends up carrying, citations included, and a source
 * line counts as used when half its distinctive words are somewhere in it.
 *
 * Half, rather than all, because these lines are composite. One line of a
 * two-column resume header holds an employer, a sector, a location and two
 * dates; an education line holds a degree, an institution and a study-abroad
 * term. Demanding every word would report the line as missing over the one
 * clause that did not make it, which is the failure this is meant to report
 * and not at all the same thing.
 */
export function unusedLines(lines: SourceLine[], printed: string[]): string[] {
  const onPage = new Set(printed.flatMap(distinctive));

  return lines
    // Short lines are section headings and stray fragments: too little to say
    // whether they were used, and noise in a list meant to be read.
    .filter((l) => l.text.length >= 40)
    .filter((l) => {
      const words = distinctive(l.text);
      if (!words.length) return false;
      const found = words.filter((w) => onPage.has(w)).length;
      return found / words.length < 0.5;
    })
    .map((l) => l.text);
}

const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
