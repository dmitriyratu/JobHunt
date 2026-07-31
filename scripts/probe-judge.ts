/**
 * Blind pairwise judgement: fast vs standard, on prose quality.
 *
 * The counters in probe-tier measure safety and combining. They cannot see
 * whether a document reads better, which is the thing a pricier writer is
 * supposed to buy. This puts two real generations side by side with their
 * models hidden, in both orders, and asks which one a hiring manager for this
 * posting would rather read.
 *
 * Both orders, always: a judge that prefers whichever it reads first would
 * otherwise look like a signal. Only a model that wins both halves of a pair
 * has actually won it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import OpenAI from "openai";
import { POST } from "@/app/api/tailor-resume/route";
import { TASK_MODELS } from "@/lib/models";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import { resumeToPlainText } from "@/lib/tailoredResume";
import { draftToResume } from "@/lib/tailoredResume";
// FIXTURE=hard swaps in the career-changer whose evidence is buried mid-sentence.
import * as easy from "./fixture";
import * as hard from "./fixture-hard";
const { RESUME, JOB } = process.env.FIXTURE === "hard" ? hard : easy;

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const SPECS = {
  fast: {
    id: "gpt-5.4-mini",
    pricing: { input: 0.75, output: 4.5 },
    supportsTemperature: true,
    reasoning: false,
  },
  standard: {
    id: "gpt-5.4",
    pricing: { input: 2.5, output: 15 },
    supportsTemperature: true,
    reasoning: false,
  },
};

const JUDGE_PROMPT = `You are a hiring manager for the posting below. Two candidates' resumes were produced from the same source material; you are seeing the text only, with no idea which tool produced which.

Judge only what is in front of you:
- Which reads like a stronger case for THIS posting?
- Which bullets carry more concrete evidence — scale, figures, outcomes — rather than description?
- Which has the tighter, less padded wording?

Ignore length differences of a line or two, formatting, and section ordering. Do not reward a document for claiming more; both were built from the same facts.

Answer A or B, then one sentence naming the single thing that decided it. If they are genuinely equivalent, answer TIE.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    winner: { type: "string", enum: ["A", "B", "TIE"] },
    because: { type: "string", description: "One sentence." },
  },
  required: ["winner", "because"],
  additionalProperties: false,
} as const;

const PAIRS = Number(process.env.PAIRS ?? 3);
const LABEL = process.env.FIXTURE === "hard" ? "hard" : "easy";

async function generate(tier: keyof typeof SPECS): Promise<string> {
  Object.assign(TASK_MODELS["tailor-resume"], SPECS[tier]);
  if (TASK_MODELS["tailor-resume"].id !== SPECS[tier].id) {
    throw new Error(`model swap did not take: wanted ${SPECS[tier].id}`);
  }
  const res = await POST(
    new NextRequest("http://localhost/api/tailor-resume", {
      method: "POST",
      body: JSON.stringify({
        resumeText: RESUME,
        jobDescription: JOB,
        shape: "resume",
        pageTarget: 1,
      }),
    })
  );
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return resumeToPlainText(draftToResume(body.draft, "resume", 1));
}

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const tally = { fast: 0, standard: 0, tie: 0 };
  const notes: string[] = [];

  for (let i = 0; i < PAIRS; i++) {
    // Sequential, and it has to be. Both calls steer the same shared
    // TASK_MODELS entry, so running them concurrently let the second
    // Object.assign land before the first request read the model — and the
    // "comparison" was two generations from whichever model won the race.
    const fast = await generate("fast");
    const standard = await generate("standard");

    for (const [aTier, a, bTier, b] of [
      ["fast", fast, "standard", standard],
      ["standard", standard, "fast", fast],
    ] as const) {
      const { result } = await createStructuredCompletion<{ winner: string; because: string }>(
        client,
        {
          model: "gpt-5.6-sol",
          schemaName: "judgement",
          schema: JUDGE_SCHEMA,
          supportsTemperature: false,
          reasoning: true,
          maxTokens: 400,
          messages: [
            { role: "system", content: JUDGE_PROMPT },
            {
              role: "user",
              content: `## Posting\n${JOB}\n\n## Resume A\n${a}\n\n## Resume B\n${b}`,
            },
          ],
        }
      );
      const won = result.winner === "A" ? aTier : result.winner === "B" ? bTier : "tie";
      tally[won as keyof typeof tally]++;
      notes.push(`pair ${i + 1} (A=${aTier}): ${result.winner} → ${won} — ${result.because}`);
      console.log(notes[notes.length - 1]);
    }

    writeFileSync(`${process.env.TEMP}/judge-${LABEL}-${i + 1}.txt`, `--- FAST ---\n${fast}\n\n--- STANDARD ---\n${standard}`);
  }

  console.log(
    `\n[${LABEL}] fast ${tally.fast}  standard ${tally.standard}  tie ${tally.tie}  ` +
      `(of ${PAIRS * 2} judgements)`
  );
}

main();
