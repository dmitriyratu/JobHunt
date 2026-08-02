/**
 * Which model should CHECK the resume?
 *
 * models.ts asserts that grounding checks are "small, local judgements, so it
 * runs on the cheapest model". That was never measured — the writer was tested
 * three ways and the checker not at all — and the audit says it is false: of
 * thirteen objections across three documents, eleven were wrong, several of
 * them naming a fact that sat verbatim in the line the checker had been shown.
 *
 * This replays the same pairs through each tier and prints what each objects
 * to, so the reasons can be read rather than the counts compared. The right
 * answer here is not "fewest findings" — a checker that never fires is useless.
 * It is "findings that survive reading".
 *
 * Cheap by construction: the drafts are cached, so this buys verification calls
 * only, never a generation.
 */
import { existsSync, readFileSync } from "node:fs";
import OpenAI from "openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import { collectPairs } from "@/lib/grounding";
import { draftToResume } from "@/lib/tailoredResume";
import type { ResumeDraft, ResumePageTarget } from "@/types";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const TIERS = [
  { name: "fast", id: "gpt-5.4-mini", temp: true, reasoning: false, price: [0.75, 4.5] },
  { name: "standard", id: "gpt-5.4", temp: true, reasoning: false, price: [2.5, 15] },
  { name: "smart", id: "gpt-5.6-sol", temp: false, reasoning: true, price: [5, 30] },
];

const SCHEMA = {
  type: "object",
  properties: {
    ungrounded: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["ungrounded"],
  additionalProperties: false,
} as const;

const PROMPT = `You are checking a tailored resume against the document it was derived from.

Each item gives "originals" — one or more lines from the candidate's own resume — and a "rewrite" produced for a job application. Decide, for each, whether the rewrite states anything the originals do not.

READ EVERY LINE IN "originals". They are a list, and a fact stated in the second or third one is just as supported as a fact in the first. Combining them is allowed and is the point.

ALLOWED, and not a finding:
- Rewording, compression, reordering clauses, changing voice, changing tense.
- Leading with a figure that was already in the originals.
- Swapping a term for a synonym.
- Dropping detail. A shorter line claims less, never more.
- Merging originals into one sentence, as long as every part traces to one of them.

A FINDING, always:
- A number, tool, place or credential present in none of the originals.
- A relationship asserted between two originals that neither states.
- A larger role than the originals state.

Before reporting an item, quote to yourself the words in the rewrite you believe are unsupported, then search every original for them. If you find them, it is not a finding.

Return only the ungrounded ones. An empty array means everything checks out.`;

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const cases: { label: string; file: string; target: ResumePageTarget }[] = [
    { label: "big", file: ".tex-debug/audit-big-2p.json", target: 2 },
    { label: "hard", file: ".tex-debug/audit-hard-1p.json", target: 1 },
    { label: "easy", file: ".tex-debug/audit-easy-1p.json", target: 1 },
  ];

  for (const c of cases) {
    if (!existsSync(c.file)) {
      console.log(`\n### ${c.label}: no cached draft at ${c.file} — run check:audit first`);
      continue;
    }
    const body = JSON.parse(readFileSync(c.file, "utf-8")) as { draft: ResumeDraft };
    const resume = draftToResume(body.draft, "resume", c.target);
    const pairs = collectPairs(resume.sections);

    console.log(`\n${"=".repeat(72)}\n${c.label}: ${pairs.length} pairs to judge\n${"=".repeat(72)}`);

    for (const tier of TIERS) {
      try {
        const { result, usage } = await createStructuredCompletion<{
          ungrounded: { id: string; reason: string }[];
        }>(client, {
          model: tier.id,
          schemaName: "grounding_check",
          schema: SCHEMA,
          temperature: 0,
          supportsTemperature: tier.temp,
          reasoning: tier.reasoning,
          maxTokens: 1500,
          messages: [
            { role: "system", content: PROMPT },
            {
              role: "user",
              content: JSON.stringify(
                pairs.map((p) => ({ id: p.id, originals: p.sources, rewrite: p.value }))
              ),
            },
          ],
        });

        const cost =
          (usage.promptTokens * tier.price[0] + usage.completionTokens * tier.price[1]) / 1e6;
        const found = result.ungrounded ?? [];
        console.log(`\n--- ${tier.name} (${tier.id}) — ${found.length} findings, $${cost.toFixed(4)}`);
        for (const f of found) {
          const pair = pairs.find((p) => p.id === f.id);
          console.log(`  [${f.id}] ${f.reason}`);
          console.log(`     wrote: ${pair?.value.slice(0, 130)}`);
          for (const src of pair?.sources ?? []) console.log(`     cited: ${src.slice(0, 130)}`);
        }
      } catch (e) {
        console.log(`\n--- ${tier.name}: threw ${(e as Error).message.slice(0, 140)}`);
      }
    }
  }
}

main();
