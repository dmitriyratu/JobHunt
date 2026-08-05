/**
 * Putting the space back into "PROFESSIONALSUMMARY".
 *
 * Some templates — LaTeX resume classes especially — typeset a section heading
 * as a single positioned glyph run with the inter-word space carried as a kern
 * rather than a space character. Nothing downstream can recover it from
 * geometry, because there is no geometry to read: the extractor is handed one
 * text item reading "PROFESSIONALSUMMARY", 197pt wide, and the gap logic in
 * `pdf.ts` never sees a pair to measure. Verified against a real resume — the
 * output is byte-identical with pdf.js's own item-combining on or off, so this
 * is not a threshold that can be tuned.
 *
 * What *is* recoverable is that resume headings come from a small, known
 * vocabulary. So this splits a run only when it decomposes exactly into words
 * from that list, and leaves everything else alone. "PROFESSIONALSUMMARY" and
 * "WORKEXPERIENCE" come back; "BLOOMBERGLP" and "DEFENSESTORM" do not, and
 * should not — a company name is not in any vocabulary, and a guess there would
 * corrupt an employer on a document the user sends to an employer.
 */

/**
 * The words a resume section heading is built from.
 *
 * Deliberately independent of the section catalogue in `documentShape.ts`:
 * that one governs what the app *prints*, and its titles are chosen for the
 * document being generated. This is about what an arbitrary uploaded resume
 * shouts at the top of a section, which is a different and more varied set.
 */
const HEADING_WORDS = [
  "ACADEMIC", "ACCOMPLISHMENTS", "ACHIEVEMENTS", "ACTIVITIES", "ADDITIONAL",
  "ADMISSIONS", "AFFILIATIONS", "AND", "APPOINTMENTS", "AWARDS", "BACKGROUND",
  "BAR", "CAREER", "CERTIFICATES", "CERTIFICATIONS", "CLINICAL", "COMMUNITY",
  "COMPETENCIES", "CONTACT", "CORE", "COURSEWORK", "CREDENTIALS", "EDUCATION",
  "EMPLOYMENT", "ENGAGEMENTS", "EXPERIENCE", "EXPERTISE", "EXHIBITIONS",
  "GRANTS", "HIGHLIGHTS", "HISTORY", "HONORS", "HONOURS", "INFORMATION",
  "INTERESTS", "INVOLVEMENT", "KEY", "LANGUAGES", "LEADERSHIP", "LICENSURE",
  "COURSES", "DEVELOPMENT", "MEMBERSHIPS", "OBJECTIVE", "OF", "ORGANIZATIONS",
  "OTHER", "PATENTS", "PERSONAL", "PRESENTATIONS", "PROFESSIONAL", "PROFILE",
  "PROJECTS", "PUBLICATIONS", "QUALIFICATIONS", "RELEVANT", "REFERENCES",
  "RESEARCH", "SELECTED", "SERVICE", "SKILLS", "SOCIETIES", "SUMMARY",
  "TEACHING", "TECHNICAL", "TECHNOLOGIES", "TECHNOLOGY", "TOOLS", "TRAINING",
  "VOLUNTEER", "WORK",
];

/** Longest-first, so "EXPERIENCE" is tried before "EXPERT" would be. */
const VOCABULARY = [...HEADING_WORDS].sort((a, b) => b.length - a.length);

/** The shortest run worth examining — below this, a real word is likelier. */
const MIN_LENGTH = 8;

/**
 * Every way `run` decomposes into vocabulary words, or null if there is none.
 *
 * Exhaustive rather than greedy: greedy matching commits to the first word that
 * fits and cannot back out, so "WORKEXPERIENCE" would take "WORK" and then fail
 * on nothing, while a run needing a different first split would be abandoned
 * even though a decomposition exists.
 */
function decompose(run: string): string[] | null {
  if (!run) return [];
  for (const word of VOCABULARY) {
    if (!run.startsWith(word)) continue;
    const rest = decompose(run.slice(word.length));
    if (rest) return [word, ...rest];
  }
  return null;
}

/**
 * A single unspaced heading run, with its spaces restored.
 *
 * Two or more words only: a run that "decomposes" into one word is just that
 * word, already correct.
 */
export function splitHeadingRun(run: string): string {
  if (run.length < MIN_LENGTH) return run;
  const words = decompose(run);
  return words && words.length > 1 ? words.join(" ") : run;
}

/**
 * The document with unspaced all-caps headings repaired.
 *
 * Scoped to lines that are entirely upper-case, which is what a shouted heading
 * looks like and what nothing else in a resume looks like. A body line
 * containing an acronym is never a candidate, so no sentence can be rewritten
 * by this.
 */
export function restoreHeadingSpaces(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // Upper-case and single-token: "PROFESSIONALSUMMARY", not "WORK HISTORY"
      // (already fine) and not "DEFENSESTORM | Cybersecurity" (has body text).
      if (!/^[A-Z]{8,}$/.test(trimmed)) return line;
      const split = splitHeadingRun(trimmed);
      return split === trimmed ? line : line.replace(trimmed, split);
    })
    .join("\n");
}
