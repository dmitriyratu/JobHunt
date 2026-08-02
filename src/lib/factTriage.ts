import type OpenAI from "openai";
import { normalise, type FactIssue } from "./factCheck";
import { getTaskModel } from "./models";
import { createStructuredCompletion, type UsageStats } from "./structuredCompletion";
import { formatIndexed, indexSource, resolveCitations } from "./sourceIndex";

/**
 * The reviewer the copied-field check never had.
 *
 * Every other check in this app has one. The number check hands its findings to
 * a model as `numericHint` rather than treating them as verdicts, precisely
 * because it is subject-blind and flags "eight years" derived from the
 * candidate's own dates (see the note in groundingPass.findViolations). checkFacts
 * was the exception: it ran after the grounding pass had finished, nothing read
 * its output, and every finding went straight to the screen.
 *
 * It fires on the same class of harmless thing. A fellowship listed in the
 * uploaded document as two entries — one title, one date range, two institutions
 * on two lines — comes back from the tailoring as one entry naming both, joined
 * with a slash. Every word is the candidate's. The combined string appears
 * nowhere, so containment fails, and the candidate is asked to check a warning
 * about an employer that was never in doubt.
 *
 * WHY A MODEL MAY CLEAR THESE WHEN IT MAY NOT REWRITE THEM
 * The audit behind the two-tier design in runGroundingPass found a model wrong
 * on eleven of thirteen judgements about what a source supports, which is a
 * strong argument against letting one silently drop a warning. The argument
 * only holds against an unchecked clearance. Here the model is not asked "is
 * this fine?" — it is asked WHICH LINES account for the field, and the answer is
 * re-checked in code: every word of the flagged value must appear in the lines
 * it named. The model does the part it is good at, recognising that two entries
 * were merged and finding both; the string matcher keeps the veto. Same shape as
 * the repair re-check, where nothing a model writes reaches the document without
 * passing the test that rejected the original.
 *
 * So its errors are one-directional. Pointing at the wrong lines fails the
 * re-check and the warning survives — noise, which costs a glance. Clearing
 * something real would need it to name lines that genuinely contain every word
 * of the value, at which point the warning was noise anyway.
 *
 * A value carrying a word that appears NOWHERE in the uploaded document never
 * reaches the reviewer at all. That is fabrication, it is decided by exact
 * matching over the whole source, and it is the failure this check exists for.
 */

export type ClearedFact = {
  /** The warning that was withheld. */
  issue: FactIssue;
  /** How the document accounts for it, in the reviewer's words. */
  reason: string;
  /** The candidate's own lines that carry it, resolved from the cited ids. */
  lines: string[];
};

export type FactReview = {
  /** What the candidate sees. */
  issues: FactIssue[];
  /**
   * What was withheld and why.
   *
   * Kept rather than discarded for the same reason GroundingReport.decisions is:
   * a pass that silently removes warnings cannot be audited afterwards, and the
   * question "was it right to withhold this" needs the warning, the reason and
   * the lines it was cleared on.
   */
  cleared: ClearedFact[];
  usage: { model: string; usage: UsageStats }[];
};

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    accounted: {
      type: "array",
      description:
        "Only the warnings the document accounts for. Omit everything you cannot place.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          lines: {
            type: "array",
            items: { type: "string" },
            description: "The line ids carrying this information. Every one it came from.",
          },
          reason: {
            type: "string",
            description: "A few words: how the document accounts for it.",
          },
        },
        required: ["id", "lines", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["accounted"],
  additionalProperties: false,
} as const;

const REVIEW_PROMPT = `You are reviewing warnings about a finished resume before a person is shown them.

Each warning names a field — an employer, a job title, a date, a location — that was supposed to be copied from the candidate's own document word for word, and reports that it does not appear there. Most of these are harmless: the document says the same thing in a different arrangement, and the warning sends the candidate hunting through their own resume for a problem that is not there.

Your job is to say which warnings the document accounts for, and to point at the lines that account for them.

ACCOUNTED FOR — name it, and cite the lines:
- Two entries merged into one. The document lists the same title and dates twice under two different employers; the resume writes one entry naming both.
- The same institution written differently. An affiliation joined with a slash where the document used a dash, or a fuller or shorter form of a name the document states.
- Words reordered, punctuation changed, a location or a date moved from one part of the entry to another.

NOT ACCOUNTED FOR — leave it out entirely, and say nothing about it:
- An employer, institution, credential or place the document never names.
- A year the document does not state.
- A different or larger role than the document gives.

Cite by id, and cite every line the information came from — a merged employer needs both of them. Citing the wrong lines is worse than citing none: what you cite is checked against the field word by word, and a warning cleared on lines that do not contain it is put back.

Omitting a warning is always safe — it is shown to the candidate, who can read their own resume. Clearing a real one is not. When you cannot place a field, say nothing about it.`;

type ReviewResponse = {
  accounted: { id: string; lines: string[]; reason: string }[];
};

/** A value's words, for checks that work below the level of the whole string. */
function wordsOf(text: string): string[] {
  return normalise(text).split(" ").filter(Boolean);
}

/**
 * How much rearranging counts as rearranging.
 *
 * A merged employer is two pieces: one entry's institution and another's. Two is
 * therefore the limit, and it was three until the probe showed what three buys —
 * "Pediatric Hematology Clinical Fellow Cancer Center New York" decomposes into
 * exactly three phrases of the candidate's own line and is not a title anyone
 * held. Every piece allowed is another degree of freedom to assemble something
 * new out of old words, which is the thing the check exists to catch. A genuine
 * three-piece rearrangement stays reported, and being reported costs a glance.
 *
 * The two-word floor does the same job from the other side. Every single word of
 * a resume field — "chief", "of", "hospital" — is somewhere in a resume, so
 * allowing one-word pieces would let any value be "accounted for" by scavenging.
 * A run of two or more is a phrase the candidate actually wrote.
 */
const MAX_RUNS = 2;
const MIN_RUN_WORDS = 2;

/**
 * Whether a value is a rearrangement of contiguous pieces of the cited lines.
 *
 * This is the whole re-check, and it is deliberately not "are all these words
 * present". Presence over a union of lines clears "Chief of Pediatric
 * Hematology" against a document that says "Chief Fellow" and "Pediatric
 * Hematology and Oncology" — every word is there, and the title is invented.
 * Requiring long contiguous runs, each found within a SINGLE cited line, is the
 * difference between recombining a candidate's words and reprinting their
 * phrases in a new order. The merge this pass exists to forgive is exactly two
 * such runs.
 *
 * Greedy longest-first: not guaranteed to find the fewest possible runs, but it
 * is deterministic and errs towards reporting, which is the safe direction.
 *
 * Exported for the probe. It is the only thing standing between a model's
 * opinion and a warning the candidate never sees, so it is tested directly
 * rather than through a call that costs money and varies run to run.
 */
export function rearranges(value: string, cited: string[]): boolean {
  const words = wordsOf(value);
  if (!words.length) return false;
  // Padded so a run matches on whole words: "cornell medical" must not match
  // inside "cornell medicine".
  const lines = cited.map((line) => ` ${normalise(line)} `);

  let at = 0;
  let runs = 0;
  while (at < words.length) {
    let length = 0;
    for (let end = words.length; end > at; end--) {
      const run = ` ${words.slice(at, end).join(" ")} `;
      if (lines.some((line) => line.includes(run))) {
        length = end - at;
        break;
      }
    }
    if (length < MIN_RUN_WORDS) return false;
    if (++runs > MAX_RUNS) return false;
    at += length;
  }
  return true;
}

/**
 * Withholds the warnings the uploaded document accounts for.
 *
 * Never throws, and costs nothing on a clean document: no findings means no
 * call. A reviewer that fails for any reason leaves every warning standing,
 * which is the behaviour before this existed.
 */
export async function reviewFacts(
  client: OpenAI,
  issues: FactIssue[],
  resumeText: string
): Promise<FactReview> {
  if (!issues.length) return { issues, cleared: [], usage: [] };

  try {
    const lines = indexSource(resumeText);
    const everyWord = new Set(wordsOf(lines.map((l) => l.text).join(" ")));

    // The hard tier, decided here and never sent to the reviewer. A value using
    // a word the candidate never wrote is not an arrangement difference, and no
    // set of cited lines could account for it — the words are not in the
    // document to cite.
    const reviewable = new Map<string, FactIssue>();
    issues.forEach((issue, i) => {
      if (wordsOf(issue.value).every((w) => everyWord.has(w))) {
        reviewable.set(`F${i}`, issue);
      }
    });
    if (!reviewable.size) return { issues, cleared: [], usage: [] };

    const model = getTaskModel("review-facts");
    const { result, usage } = await createStructuredCompletion<ReviewResponse>(client, {
      model: model.id,
      schemaName: "fact_review",
      schema: REVIEW_SCHEMA,
      temperature: 0,
      supportsTemperature: model.supportsTemperature,
      reasoning: model.reasoning,
      maxTokens: 1000,
      messages: [
        { role: "system", content: REVIEW_PROMPT },
        {
          role: "user",
          content: [
            "## The candidate's uploaded document, one addressable line per row",
            formatIndexed(lines),
            "",
            "## The warnings to review",
            JSON.stringify(
              [...reviewable].map(([id, issue]) => ({
                id,
                field: issue.field,
                value: issue.value,
                entry: issue.where,
              }))
            ),
          ].join("\n"),
        },
      ],
    });

    // --- The re-check --------------------------------------------------------
    // Nothing is withheld on the reviewer's say-so. It named lines; the field
    // has to be a rearrangement of those lines, decided by rearranges() above.
    const cleared: ClearedFact[] = [];
    const clearedIds = new Set<string>();

    for (const claim of result.accounted ?? []) {
      const issue = reviewable.get(claim.id);
      if (!issue || clearedIds.has(claim.id)) continue;

      // An id it invented resolves to nothing, and nothing accounts for nothing.
      const cited = resolveCitations(claim.lines, lines);
      if (!cited.length) continue;
      if (!rearranges(issue.value, cited)) continue;

      clearedIds.add(claim.id);
      cleared.push({ issue, reason: claim.reason, lines: cited });
    }

    return {
      issues: issues.filter((_, i) => !clearedIds.has(`F${i}`)),
      cleared,
      usage: [{ model: model.id, usage }],
    };
  } catch {
    return { issues, cleared: [], usage: [] };
  }
}
