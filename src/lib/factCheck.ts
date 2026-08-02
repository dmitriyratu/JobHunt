import { logicalLines } from "./sourceLines";
import type { ResumeSection, TailoredResume } from "@/types";

/**
 * Checking the fields the grounding pass never looks at.
 *
 * The grounding rule covers bullets and prose — the text the model is invited
 * to rewrite. It says nothing about employer names, job titles, degrees, dates
 * or locations, which the prompt tells the model to copy character-for-character
 * and which nothing verifies. That is the one remaining way a fabrication
 * reaches a finished document without tripping anything: a hallucinated employer
 * passes every check in the app, and it is the failure that actually costs
 * someone an interview.
 *
 * WHY THIS IS NOT A MODEL CALL
 * These fields are supposed to be copies. Asking whether a copy is a copy is
 * string matching, and a language model is a worse string matcher than a string
 * matcher — the same argument that keeps the number check deterministic. What a
 * model would buy is judgement about paraphrase, and paraphrase is precisely
 * what is forbidden here.
 *
 * WHY IT IS FUZZY ANYWAY
 * The source arrives from PDF or DOCX extraction, so it carries the artefacts of
 * whatever produced it: doubled spaces, non-breaking spaces, smart quotes,
 * ligatures, a hyphen that is really an en dash. Matching those literally would
 * report every second entry and train the reader to ignore the warning. So both
 * sides are normalised down to letters, digits and single spaces before they are
 * compared, and only a field that survives that is reported.
 *
 * WHAT IT STILL CANNOT SEE, AND WHO DOES
 * Containment is blind to arrangement. A fellowship the candidate listed as two
 * entries — one title, one date range, two institutions — comes back from the
 * tailoring as one entry naming both, and the combined string is nowhere in the
 * source, so this reports it. Every word of it is the candidate's. That is not a
 * bug to fix here: loosening the rule to admit rearrangements is how a check
 * stops catching invention. It is fixed downstream instead, by factTriage, which
 * reads these findings against the document before any of them reach the screen.
 */

export type FactIssue = {
  /** Which entry, in words a reader can find on the page. */
  where: string;
  /** Which field: "employer", "job title", "dates". */
  field: string;
  /** What the document says that the source does not. */
  value: string;
};

/**
 * Down to comparable text.
 *
 * Dashes and quotes are unified rather than stripped because they separate
 * words; everything else that is not a letter or digit becomes a space, so
 * "Memorial Sloan-Kettering" and "Memorial Sloan Kettering" are one string.
 *
 * Exported for factTriage, which re-checks the reviewer's clearances. Both
 * sides of that check have to normalise identically or the review would be
 * judged against a different string than the one that raised the issue.
 */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Whether a copied field appears in the source document.
 *
 * Containment rather than equality: an employer sits inside a longer line
 * ("Staff Engineer, Meridian Pay - San Francisco, CA"), and a title sits inside
 * the same one. Short values are skipped — a two-character field carries no
 * evidence either way and matches everything.
 */
function statedInSource(value: string, source: string): boolean {
  const needle = normalise(value);
  if (needle.length < 4) return true;
  return source.includes(needle);
}

/**
 * Dates, checked by their parts rather than as a string.
 *
 * "Mar 2021" against a source that wrote "March 2021" is a formatting choice,
 * not a fabrication, and reporting it would be noise. What matters is the year:
 * a year that appears nowhere in the source is invented, and that is worth
 * saying. Month names are deliberately not checked.
 */
function yearsStated(value: string, source: string): boolean {
  const years = value.match(/\b(19|20)\d{2}\b/g);
  if (!years) return true;
  return years.every((y) => source.includes(y));
}

/**
 * Every copied field on the document that the uploaded one does not state.
 *
 * Reads the source once as normalised text. Entries only: prose and bullets are
 * rewrites by design and are the grounding pass's business, not this one's.
 */
export function checkFacts(
  sections: ResumeSection[],
  resumeText: string
): FactIssue[] {
  const source = normalise(
    // Logical lines rather than the raw text, so a field broken across a wrap
    // in the original still matches as one run.
    logicalLines(resumeText).join(" ")
  );
  const issues: FactIssue[] = [];

  for (const section of sections) {
    for (const entry of section.entries ?? []) {
      const where =
        [entry.heading, entry.organization].filter(Boolean).join(", ") || section.key;

      if (entry.organization.trim() && !statedInSource(entry.organization, source)) {
        issues.push({ where, field: "employer", value: entry.organization.trim() });
      }
      if (entry.heading.trim() && !statedInSource(entry.heading, source)) {
        issues.push({ where, field: "title", value: entry.heading.trim() });
      }
      if (entry.location.trim() && !statedInSource(entry.location, source)) {
        issues.push({ where, field: "location", value: entry.location.trim() });
      }

      const dates = [entry.startDate, entry.endDate].filter((d) => d.trim());
      for (const date of dates) {
        if (!yearsStated(date, source)) {
          issues.push({ where, field: "dates", value: date.trim() });
        }
      }
    }

    // List sections are copies too: certifications, licences, publications and
    // awards are all "print this line as the document wrote it".
    for (const item of section.items ?? []) {
      if (item.trim() && !statedInSource(item, source)) {
        issues.push({ where: section.key, field: "line", value: item.trim() });
      }
    }
  }

  return issues;
}

/** The same check against a stored document, for the chat and the UI. */
export function checkResumeFacts(
  resume: TailoredResume,
  resumeText: string
): FactIssue[] {
  return checkFacts(resume.sections, resumeText);
}
