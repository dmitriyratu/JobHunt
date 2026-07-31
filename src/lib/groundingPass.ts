import type OpenAI from "openai";
import { getTaskModel } from "./models";
import { createStructuredCompletion } from "./structuredCompletion";
import {
  applyValues,
  checkNumbers,
  collectPairs,
  pruneSkills,
  unsupportedSkills,
  type GroundedPair,
  type Violation,
} from "./grounding";
import type { ResumeSection } from "@/types";
import type { UsageStats } from "./structuredCompletion";

/**
 * The pass that makes the grounding rule enforced rather than requested.
 *
 * Three stages, and the second two only happen when the first finds something,
 * so a clean generation costs one small call and a document with problems costs
 * two:
 *
 *   1. CHECK — deterministic number and skill checks, then one cheap model call
 *      asking which rewrites claim something their source doesn't.
 *   2. REPAIR — one call to the expensive model, on the failures only, to
 *      rewrite them so every claim is supported. This exists because reverting
 *      throws away real work: a bullet that front-loaded a metric and adopted
 *      the posting's vocabulary shouldn't be discarded over one overreaching
 *      verb.
 *   3. RE-CHECK — the repairs go back through stage 1. Anything still failing
 *      is reverted to the candidate's own line.
 *
 * The repair never gets the last word. A stronger model asked to "make this
 * grounded" can produce something differently ungrounded, so nothing it writes
 * reaches the document without passing the same check that rejected the
 * original. One repair attempt, then the fallback — no loop.
 */

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    ungrounded: {
      type: "array",
      description: "Only the rewrites that add something. Omit everything that is fine.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string", description: "A few words: what it adds." },
        },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["ungrounded"],
  additionalProperties: false,
} as const;

const REPAIR_SCHEMA = {
  type: "object",
  properties: {
    repairs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          value: { type: "string", description: "The corrected line." },
        },
        required: ["id", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["repairs"],
  additionalProperties: false,
} as const;

const VERIFY_PROMPT = `You are checking a tailored resume against the document it was derived from.

Each item gives "originals" — one or more lines from the candidate's own resume — and a "rewrite" produced for a job application. Decide, for each, whether the rewrite states anything the originals do not.

Judge the originals TOGETHER. Combining is allowed and is the point: a rewrite that takes a system from one line and a figure from another is correct, and rejecting it because no single line holds both would be wrong.

ALLOWED, and not a finding:
- Rewording, compression, reordering clauses, changing voice.
- Leading with a figure that was already in the original.
- Swapping a term for a synonym: "Postgres" for "PostgreSQL", "physicians" for "doctors".
- Dropping detail. A shorter line claims less, never more.
- Merging two originals into one sentence, as long as every part traces to one of them.

A FINDING, always:
- A number, percentage, duration, headcount or amount present in none of the originals, including one derived from them.
- A technology, tool, system, credential or place none of the originals mention.
- A relationship asserted between two originals that neither states. "Worked at MSK" and "published in Haematologica" do not together support "published while at MSK". Combining facts is allowed; inferring a link between them is not.
- A larger role than the original states: "led" from "contributed to", "owned" from "helped", "designed" from "used", "managed a team" from "worked with a team".
- A scope or outcome the original does not claim: "across the organisation" from "on my team", "eliminating downtime" from "reducing downtime".

Judge only the item in front of you. You do not have the rest of the resume, and something being plausible for this candidate is not evidence the originals said it.

An item with an empty "originals" list cites nothing at all. Report it: a sentence that can point at no source is exactly what this check exists to catch.

Return only the ungrounded ones. An empty array means everything checks out.`;

const REPAIR_PROMPT = `You are correcting lines of a tailored resume that claim more than the candidate's own document supports.

Each item gives "originals" — the lines from the candidate's resume it is allowed to draw on — the "rewrite" that failed checking, and the "problem" with it.

Rewrite each one so that every claim in it is supported by the originals taken together, while keeping as much of the rewrite's value as you can — its ordering, its emphasis, its vocabulary. You are removing an unsupported claim, not undoing the tailoring. You may still combine the originals; that is not what failed.

- Never introduce a fact, figure, tool or scope that is not in the originals.
- Never restore the claim the problem names, in any wording.
- If the problem is an INFERRED LINK between two originals, drop one of them. Do not keep both and soften the join: "built the pipeline while fraud losses fell over the same period" implies the same causation the problem named, and a bullet the candidate cannot claim credit for is worth less than a shorter one they can.
- If the rewrite's only value came from the unsupported claim, return the first original verbatim. That is a correct answer, not a failure.
- Keep the register: past-tense verb first, no first person, not a full sentence, no trailing period.
- No em dashes or en dashes. Avoid: delve, leverage, robust, seamless, spearheaded, pivotal, honed, adept, streamlined.

Return one repair per item, using the same id.`;

export type GroundingReport = {
  /** Values compared. Untouched lines are not checked and not counted. */
  checked: number;
  /**
   * Failed, then rewritten into something the source supports — and genuinely
   * rewritten. A "repair" that comes back as the source verbatim is a revert
   * however it was produced, and is counted as one.
   */
  repaired: number;
  /** Failed with nothing salvageable, so the candidate's own line stands. */
  reverted: number;
  /** Skills claimed that the original never listed. Deleted, not rewritten. */
  skillsRemoved: number;
  /**
   * Flagged, unrepairable, and with no cited line to fall back to — so the text
   * stands as written. Reverting to nothing would delete it, which is a worse
   * answer than leaving a sentence the check couldn't clear.
   */
  unverified: number;
  usage: { model: string; usage: UsageStats }[];
};

type VerifyResponse = { ungrounded: Violation[] };
type RepairResponse = { repairs: { id: string; value: string }[] };

/** Deterministic checks plus one model call, over whatever pairs are given. */
async function findViolations(
  client: OpenAI,
  pairs: GroundedPair[],
  report: GroundingReport
): Promise<Violation[]> {
  if (!pairs.length) return [];

  const numeric = checkNumbers(pairs);
  const flagged = new Set(numeric.map((v) => v.id));

  // Only the pairs the cheap checks cleared go to the model: a line already
  // known to be wrong doesn't need a second opinion to say so.
  const remaining = pairs.filter((p) => !flagged.has(p.id));
  if (!remaining.length) return numeric;

  const model = getTaskModel("verify-grounding");
  const { result, usage } = await createStructuredCompletion<VerifyResponse>(client, {
    model: model.id,
    schemaName: "grounding_check",
    schema: VERIFY_SCHEMA,
    temperature: 0,
    supportsTemperature: model.supportsTemperature,
    reasoning: model.reasoning,
    maxTokens: 1500,
    messages: [
      { role: "system", content: VERIFY_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          remaining.map((p) => ({ id: p.id, originals: p.sources, rewrite: p.value }))
        ),
      },
    ],
  });
  report.usage.push({ model: model.id, usage });

  const known = new Set(remaining.map((p) => p.id));
  const semantic = (result.ungrounded ?? []).filter((v) => known.has(v.id));
  return [...numeric, ...semantic];
}

/**
 * Runs the whole pass and returns corrected sections.
 *
 * Never throws: a failure anywhere here leaves the document exactly as the
 * model wrote it, which is the behaviour before this existed. Blocking a
 * generation because the checker had a bad day would be the worse trade.
 */
export async function runGroundingPass(
  client: OpenAI,
  sections: ResumeSection[],
  jobDescription: string
): Promise<{ sections: ResumeSection[]; report: GroundingReport }> {
  const report: GroundingReport = {
    checked: 0,
    repaired: 0,
    reverted: 0,
    skillsRemoved: 0,
    unverified: 0,
    usage: [],
  };

  try {
    // Skills first, and entirely in code: the check is set containment, and the
    // fix is deleting the offending item. Nothing to rewrite, nobody to ask.
    let working = sections.map((section) => {
      if (!section.keywords) return section;
      const bad = unsupportedSkills(section.keywords.value, section.keywords.source);
      if (!bad.length) return section;
      report.skillsRemoved += bad.length;
      return {
        ...section,
        keywords: {
          ...section.keywords,
          value: pruneSkills(section.keywords.value, section.keywords.source),
        },
      };
    });

    const pairs = collectPairs(working);
    report.checked = pairs.length;
    if (!pairs.length) return { sections: working, report };

    const violations = await findViolations(client, pairs, report);
    if (!violations.length) return { sections: working, report };

    const byId = new Map(pairs.map((p) => [p.id, p]));
    const failing = violations.filter((v) => byId.has(v.id));

    // --- Repair -------------------------------------------------------------
    const repairModel = getTaskModel("repair-grounding");
    const { result: repairResult, usage: repairUsage } =
      await createStructuredCompletion<RepairResponse>(client, {
        model: repairModel.id,
        schemaName: "grounding_repair",
        schema: REPAIR_SCHEMA,
        temperature: 0.2,
        supportsTemperature: repairModel.supportsTemperature,
        reasoning: repairModel.reasoning,
        maxTokens: 2000,
        messages: [
          { role: "system", content: REPAIR_PROMPT },
          {
            role: "user",
            content: [
              `[The posting, for tone and vocabulary only — never a source of facts]\n${jobDescription.slice(0, 2000)}`,
              `[Lines to correct]\n${JSON.stringify(
                failing.map((v) => ({
                  id: v.id,
                  originals: byId.get(v.id)!.sources,
                  rewrite: byId.get(v.id)!.value,
                  problem: v.reason,
                }))
              )}`,
            ].join("\n\n"),
          },
        ],
      });
    report.usage.push({ model: repairModel.id, usage: repairUsage });

    const proposed = new Map(
      (repairResult.repairs ?? [])
        .filter((r) => byId.has(r.id) && r.value.trim())
        .map((r) => [r.id, r.value.trim()])
    );

    // --- Re-check -----------------------------------------------------------
    // The repairs face the same test that rejected the originals.
    const repaired = [...proposed.entries()].map(([id, value]) => ({
      id,
      value,
      sources: byId.get(id)!.sources,
    }));
    const stillBad = new Set((await findViolations(client, repaired, report)).map((v) => v.id));

    const fixes = new Map<string, string>();
    for (const violation of failing) {
      const pair = byId.get(violation.id)!;
      const repair = proposed.get(violation.id);
      const fallback = pair.sources[0] ?? "";

      const usable = repair && !stillBad.has(violation.id) && repair !== pair.value;

      if (usable && repair !== fallback) {
        fixes.set(violation.id, repair);
        report.repaired++;
      } else if (fallback.trim()) {
        // No repair, one that failed again, one identical to what was
        // rejected, or one that simply handed back the original: all of these
        // end at the candidate's own line, so all of them are reverts. The
        // first cited line is the fallback — a combined bullet loses the other
        // fact, which is the safe direction to lose it in.
        fixes.set(violation.id, fallback);
        report.reverted++;
      } else {
        // Nothing to fall back TO. This is the case that used to delete a
        // summary: a prose section citing nothing was flagged, could not be
        // repaired, and got "reverted" to the empty string it came from.
        // Reverting to nothing is never a correction — leave the text alone and
        // report it as unverified instead.
        report.unverified++;
      }
    }

    working = applyValues(working, fixes);
    return { sections: working, report };
  } catch {
    return { sections, report };
  }
}
