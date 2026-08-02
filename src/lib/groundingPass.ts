import type OpenAI from "openai";
import { aiTells } from "./deAiText";
import { logicalLines } from "./sourceLines";
import { getTaskModel } from "./models";
import { createStructuredCompletion } from "./structuredCompletion";
import {
  applyValues,
  checkNumbers,
  collectPairs,
  numbersIn,
  pruneSkills,
  skillKey,
  skillsWithoutLiteralSupport,
  spelledNumbers,
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

YOU ARE GIVEN THE CANDIDATE'S WHOLE DOCUMENT. Judge every rewrite against ALL of it. A fact stated anywhere in that document is the candidate's to use, wherever it appears and whichever section it sits in.

Each rewrite also carries "cited" — the lines the writer says it worked from. Read those first, because they are usually the answer. But they are a pointer, not a fence: a rewrite that draws on a line it forgot to cite is a bookkeeping slip, NOT a false claim, and is not a finding. You are checking whether the resume tells the truth, not whether the footnotes are tidy.

ALLOWED, and not a finding:
- Rewording, compression, reordering clauses, changing voice, changing tense.
- Combining facts from anywhere in the document into one sentence.
- Leading with a figure the document states.
- Naming a system, employer or technology the document names elsewhere.
- Writing a number the document spells out as a numeral, or the reverse: "over twelve years" and "12+ years" are the same claim.
- Swapping a term for a synonym.
- Dropping detail. A shorter line claims less, never more.

A FINDING, and only these:
- A number, tool, place, employer or credential that appears NOWHERE in the document.
- A larger role than the document states anywhere: "led" from "contributed to", "owned" from "helped", "migrated" from "was heavily involved in".
- A scope or outcome the document does not claim: "across the organisation" from "on my team".
- A causal or temporal link asserted between two facts that the document never connects.

Before reporting anything, name to yourself the exact words you believe are unsupported, then search the whole document for them. If you find them, it is not a finding. Most apparent problems are this.

Some items carry a "numericHint" — a regex that could not find a figure among the cited lines. It does not see the rest of the document and it cannot tell what a number was attached to, so it is wrong more often than right. Check it against the full document before believing it.

Return only genuine findings. An empty array is the normal answer and the correct one for most documents. Never return an item you have concluded is fine.`;

const SKILL_SCHEMA = {
  type: "object",
  properties: {
    unsupported: {
      type: "array",
      description: "Only the skills the document does not support. Omit every skill that is fine.",
      items: {
        type: "object",
        properties: {
          skill: { type: "string", description: "Exactly as it was given to you." },
          reason: { type: "string", description: "A few words: why nothing supports it." },
        },
        required: ["skill", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["unsupported"],
  additionalProperties: false,
} as const;

const SKILL_PROMPT = `You are checking keywords on a tailored resume against the candidate's own document.

Every keyword you are given has already failed a literal text search of that document, so "I cannot find those exact characters" is not an answer — it is the reason you were asked. Your job is the part a search cannot do: deciding whether the document claims the capability under another name.

SUPPORTED, and not a finding:
- The same thing abbreviated or spelled out: K8s and Kubernetes, RAG and retrieval-augmented generation, CI/CD and continuous delivery.
- A spelling, casing or spacing variant: Postgres and PostgreSQL, NodeJS and Node.js, fine tuning and fine-tuning.
- A common synonym or the industry's usual name for what the document describes.
- A named tool or method the document plainly used, described there in words rather than named: a document describing a pipeline that turns natural language into database queries supports "text-to-SQL".
- A narrower term the document's own wording contains, or a broader one it clearly demonstrates.

A FINDING, and only this:
- Nothing anywhere in the document claims this capability, under any name. The candidate would be asserting something new by printing it.

WHEN YOU ARE UNSURE, IT IS SUPPORTED. A keyword deleted wrongly costs the candidate a skill they really have and can be matched on; a generous one that survives costs almost nothing, and the writer was already forbidden to invent. Return only the keywords nothing in the document supports. An empty array is the normal answer and the correct one for most documents.`;

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
  /**
   * Skills claimed that the original never listed. Deleted, not rewritten.
   *
   * Named rather than counted: "2 skills were removed" is not a claim anyone
   * can check, and this is the one thing the pass deletes outright — the only
   * way to tell a correct deletion from a normalisation slip ("Node" against
   * "Node.js") is to read which words went.
   */
  removedSkills: string[];
  /**
   * Flagged, unrepairable, and with no cited line to fall back to — so the text
   * stands as written. Reverting to nothing would delete it, which is a worse
   * answer than leaving a sentence the check couldn't clear.
   */
  unverified: number;
  /**
   * Objected to, but left exactly as written.
   *
   * The default outcome now. See the two-tier note in runGroundingPass: the
   * checker is wrong often enough that only fabrication — a figure absent from
   * the whole uploaded document — is allowed to change the text.
   */
  flagged: number;
  /**
   * Every line this pass acted on, with enough context to judge whether it
   * should have.
   *
   * The counters above say how often the check fired. They cannot say whether
   * it was RIGHT to fire, and nothing here recorded enough to find out — the
   * model's original wording was overwritten and lost, so a revert and a
   * correct revert looked identical afterwards. Reverts have been running at
   * two to thirteen a document, every one of them replacing tailored text with
   * the candidate's own, and the false-positive rate is simply unknown.
   *
   * This is also what a "flag, don't rewrite" surface needs: to show someone a
   * line worth checking, you have to have kept the line, its sources and the
   * objection.
   */
  decisions: GroundingDecision[];
  usage: { model: string; usage: UsageStats }[];
};

export type GroundingDecision = {
  id: string;
  /** What the writer produced, before this pass touched it. */
  wrote: string;
  /** The lines it cited, as it cited them. */
  sources: string[];
  /** Which check objected, and why. */
  reason: string;
  /** Whether the objection came from a regex or from a model. */
  detector: "numbers" | "model";
  outcome: "repaired" | "reverted" | "unverified" | "flagged";
  /** What now stands in the document. */
  became: string;
};

type VerifyResponse = { ungrounded: Violation[] };
type RepairResponse = { repairs: { id: string; value: string }[] };
type SkillResponse = { unsupported: { skill: string; reason: string }[] };

/**
 * The second half of the skills check: judgement, on the few that need it.
 *
 * Only runs when the text search left something over, which on most documents
 * is nothing at all — so the usual generation still pays for exactly one
 * grounding call. What reaches here is the genuinely ambiguous set, where the
 * document says the same thing in different characters, and no amount of string
 * comparison was ever going to settle it.
 *
 * Deliberately not folded into the bullet checker's call. That one judges
 * rewritten sentences against their sources and is tuned to be strict; this one
 * judges vocabulary and is told to be lenient. Sharing a prompt would make one
 * of them wrong.
 *
 * A failure keeps every keyword. The pass is a backstop against a writer that
 * was already forbidden to invent skills, and deleting a candidate's real
 * skill because a network call timed out is the worst outcome on offer here.
 */
async function findUnsupportedSkills(
  client: OpenAI,
  candidates: string[],
  resumeText: string,
  report: GroundingReport
): Promise<string[]> {
  if (!candidates.length) return [];

  try {
    const model = getTaskModel("verify-grounding");
    const { result, usage } = await createStructuredCompletion<SkillResponse>(client, {
      model: model.id,
      schemaName: "skill_check",
      schema: SKILL_SCHEMA,
      temperature: 0,
      supportsTemperature: model.supportsTemperature,
      reasoning: model.reasoning,
      maxTokens: 800,
      messages: [
        { role: "system", content: SKILL_PROMPT },
        {
          role: "user",
          content: [
            "## The candidate's document, in full. Nothing outside this is theirs to claim.",
            logicalLines(resumeText).join("\n"),
            "",
            "## The keywords to judge",
            JSON.stringify(candidates),
          ].join("\n"),
        },
      ],
    });
    report.usage.push({ model: model.id, usage });

    // Only ever delete something that was actually asked about — a model that
    // returns a keyword nobody offered it has misunderstood the task, and
    // acting on that would delete a skill at random.
    const asked = new Set(candidates.map(skillKey));
    return (result.unsupported ?? [])
      .map((u) => u.skill)
      .filter((s) => asked.has(skillKey(s)));
  } catch {
    return [];
  }
}

/**
 * Deterministic checks plus one model call, over whatever pairs are given.
 *
 * The checker is given the WHOLE uploaded document, not just the lines each
 * bullet cited. That scope used to be the citations alone, and it was the
 * single largest source of false findings: almost every surviving objection in
 * the last audit was of the form "adds Rails", "adds shipment-tracking", "adds
 * 40 million events" — every one of them a fact the candidate had written down,
 * in a line the bullet happened not to cite. The claim was true and the
 * bookkeeping was off, and the check could not tell the difference because it
 * had never been shown the rest of the resume.
 *
 * Citations stay in the payload as "cited", because where the writer says a
 * line came from is real evidence and worth reading first. They are just no
 * longer the boundary of what counts as supported.
 *
 * It costs a copy of the resume per call — a bit over a cent on a nine page
 * document. Against reverting a candidate's best line, that is not a trade
 * worth thinking about twice.
 */
async function findViolations(
  client: OpenAI,
  pairs: GroundedPair[],
  resumeText: string,
  report: GroundingReport
): Promise<Violation[]> {
  if (!pairs.length) return [];

  // The numeric check is a signal, not a verdict.
  //
  // It used to be treated as proof: a pair it flagged skipped the model
  // entirely and went straight to repair-or-revert. But the check is
  // subject-blind — it asks only whether a digit appears among the cited lines,
  // never what that digit was attached to — so it flags "eight years" derived
  // from the candidate's own dates, and a figure correctly reworded into
  // different phrasing, with no appeal. Everything now goes to the model; the
  // numeric finding rides along as a hint about where to look. It is the same
  // single batched call either way, so the extra certainty is free.
  const numeric = checkNumbers(pairs);
  const hints = new Map(numeric.map((v) => [v.id, v.reason]));
  const remaining = pairs;

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
        content: [
          "## The candidate's document, in full. Nothing outside this is theirs to claim.",
          logicalLines(resumeText).join("\n"),
          "",
          "## The rewrites to judge",
          JSON.stringify(
            remaining.map((p) => ({
              id: p.id,
              cited: p.sources,
              rewrite: p.value,
              ...(hints.has(p.id) ? { numericHint: hints.get(p.id) } : {}),
            }))
          ),
        ].join("\n"),
      },
    ],
  });
  report.usage.push({ model: model.id, usage });

  const known = new Set(remaining.map((p) => p.id));
  return (result.ungrounded ?? []).filter((v) => known.has(v.id));
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
  jobDescription: string,
  resumeText: string
): Promise<{ sections: ResumeSection[]; report: GroundingReport }> {
  const report: GroundingReport = {
    checked: 0,
    repaired: 0,
    reverted: 0,
    removedSkills: [],
    unverified: 0,
    flagged: 0,
    decisions: [],
    usage: [],
  };

  try {
    // Skills first, in two stages: search the candidate's document for each
    // keyword, then ask the model about whatever the search could not find.
    // Cheapest first — most documents never reach the second stage, and the
    // ones that do send it three or four words rather than a resume.
    let working = sections;
    const candidates = sections.flatMap((section) =>
      section.keywords
        ? skillsWithoutLiteralSupport(
            section.keywords.value,
            section.keywords.source,
            resumeText
          )
        : []
    );

    if (candidates.length) {
      const removed = await findUnsupportedSkills(client, candidates, resumeText, report);
      if (removed.length) {
        report.removedSkills.push(...removed);
        working = sections.map((section) =>
          section.keywords
            ? {
                ...section,
                keywords: {
                  ...section.keywords,
                  value: pruneSkills(section.keywords.value, removed),
                },
              }
            : section
        );
      }
    }

    const pairs = collectPairs(working);
    report.checked = pairs.length;
    if (!pairs.length) return { sections: working, report };

    const byId = new Map(pairs.map((p) => [p.id, p]));

    // --- Two tiers ----------------------------------------------------------
    // Measured on thirteen decisions across three documents, eleven of the
    // checker's objections were wrong — and wrong in the most expensive way,
    // deleting the $430,000 saving, the build-time numbers and the EMEA remit
    // that were sitting verbatim in the very lines it had been shown. One of
    // them rewrote "on-call rotation owner" down to "participated in", making
    // the document LESS true than the candidate's own resume.
    //
    // A check that unreliable must not hold the pen. So only the objections
    // that can be confirmed without it are allowed to change anything:
    //
    //   HARD — the value states a figure that appears NOWHERE in the uploaded
    //     document. That is fabrication, it is decided by exact matching over
    //     the whole source rather than by judgement over a few cited lines, and
    //     it is the failure that actually matters.
    //   SOFT — everything else the model objects to. Recorded and surfaced,
    //     never rewritten. An over-strict check that flags costs a glance; one
    //     that silently reverts costs the tailoring.
    const everyFigure = new Set(
      logicalLines(resumeText).flatMap((l) => [...numbersIn(l), ...spelledNumbers(l)])
    );
    const invented = (value: string) => numbersIn(value).filter((n) => !everyFigure.has(n));

    // The hard tier stands on its own, and has to.
    //
    // Demoting the numeric check to a hint for the model left a hole: a figure
    // the model failed to notice was no longer caught by anything, because the
    // only path to enforcement ran through the model's findings. Exact matching
    // over the whole document is the one judgement here that needs no model and
    // is never wrong about what it claims — a digit is present or it is not —
    // so it decides on its own.
    const failing: Violation[] = pairs
      .map((p) => ({ pair: p, bad: invented(p.value) }))
      .filter(({ bad }) => bad.length > 0)
      .map(({ pair, bad }) => ({
        id: pair.id,
        reason: `states ${bad.map((n) => `"${n}"`).join(", ")}, which appears nowhere in the uploaded document`,
      }));
    const hard = new Set(failing.map((v) => v.id));

    const violations = await findViolations(client, pairs, resumeText, report);

    // Everything the model objected to that is not outright fabrication.
    // Recorded and surfaced, never rewritten.
    for (const soft of violations.filter((v) => byId.has(v.id) && !hard.has(v.id))) {
      const pair = byId.get(soft.id)!;
      report.flagged++;
      report.decisions.push({
        id: soft.id,
        wrote: pair.value,
        sources: pair.sources,
        reason: soft.reason,
        detector: "model",
        outcome: "flagged",
        became: pair.value,
      });
    }

    if (!failing.length) return { sections: working, report };

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
    const stillBad = new Set((await findViolations(client, repaired, resumeText, report)).map((v) => v.id));

    const fixes = new Map<string, string>();
    for (const violation of failing) {
      const pair = byId.get(violation.id)!;
      const repair = proposed.get(violation.id);
      const fallback = pair.sources[0] ?? "";

      const usable = repair && !stillBad.has(violation.id) && repair !== pair.value;

      // Reverting is a truth fix, and it must not be a style regression. The
      // candidate's own summary is where "Passionate about building great
      // products" and "Seeking a challenging role where I can leverage my
      // diverse skill set" live — words this app forbids everywhere else.
      // Falling back into one of those puts the loudest AI tells on the page in
      // the name of accuracy. Where the fallback reads worse than what it would
      // replace, the text stands and is reported instead.
      const fallbackReadsWorse =
        aiTells(fallback).length > aiTells(pair.value).length;

      // Recorded whatever happens, so the pass can be audited rather than
      // trusted. `wrote` is the writer's text before this loop touches it.
      const decide = (outcome: GroundingDecision["outcome"], became: string) => {
        report.decisions.push({
          id: violation.id,
          wrote: pair.value,
          sources: pair.sources,
          reason: violation.reason,
          // The hard tier is the only thing that reaches here, and it is decided
          // by exact matching rather than by the model.
          detector: "numbers",
          outcome,
          became,
        });
      };

      if (usable && repair !== fallback) {
        fixes.set(violation.id, repair);
        report.repaired++;
        decide("repaired", repair);
      } else if (fallback.trim() && !fallbackReadsWorse) {
        // No repair, one that failed again, one identical to what was
        // rejected, or one that simply handed back the original: all of these
        // end at the candidate's own line, so all of them are reverts. The
        // first cited line is the fallback — a combined bullet loses the other
        // fact, which is the safe direction to lose it in.
        fixes.set(violation.id, fallback);
        report.reverted++;
        decide("reverted", fallback);
      } else {
        // Nothing worth falling back TO — either no cited line at all, or one
        // that would read worse than what it replaced. This is the case that
        // used to delete a summary outright: a prose section citing nothing was
        // flagged, could not be repaired, and got "reverted" to the empty string
        // it came from. Neither reverting to nothing nor reverting to filler is
        // a correction, so the text stands and is reported instead.
        report.unverified++;
        decide("unverified", pair.value);
      }
    }

    working = applyValues(working, fixes);
    return { sections: working, report };
  } catch {
    return { sections, report };
  }
}
