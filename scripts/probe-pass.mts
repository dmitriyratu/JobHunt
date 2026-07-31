/**
 * End-to-end probe for the sources[] union through the real grounding pass.
 *
 * The unit probe proves the deterministic half. This one asks the question only
 * a live call can answer: does the verify prompt honour the union rule, or does
 * it reject a bullet because no single cited line holds every fact in it?
 */
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { runGroundingPass } from "@/lib/groundingPass";
import type { ResumeSection } from "@/types";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const bullet = (id: string, value: string, sources: string[]) => ({
  id,
  value,
  sources,
  dropped: false,
});

const sections: ResumeSection[] = [
  {
    key: "experience",
    entries: [
      {
        id: "e1",
        heading: "Staff Engineer",
        organization: "Northwind",
        location: "Boston, MA",
        startDate: "2021",
        endDate: "Present",
        bullets: [
          // 1. THE CASE THIS CHANGE EXISTS FOR. Two of the candidate's own
          //    lines, welded into one. Must survive untouched.
          bullet(
            "combine-ok",
            "Built the settlement pipeline, clearing $2B in annual volume across 14 markets",
            [
              "Built the settlement pipeline from scratch",
              "The pipeline clears $2B annually and runs in 14 markets",
            ]
          ),
          // 2. Same combining move, but asserts a link neither line states.
          bullet("combine-inferred", "Cut fraud losses by rebuilding the settlement pipeline", [
            "Built the settlement pipeline from scratch",
            "Fraud losses fell over the same period",
          ]),
          // 3. Two sources, and a figure in neither. Deterministic catch.
          bullet("number-invented", "Mentored 9 engineers across two teams", [
            "Mentored engineers on the payments team",
            "Also supported the ledger team",
          ]),
          // 4. Legitimate single-source rewrite. Must survive untouched.
          bullet("reword-ok", "Owned on-call for the payments tier", [
            "Was responsible for the payments on-call rotation",
          ]),
          // 5. Role inflation from one line. Should be repaired or reverted.
          bullet("scope-inflated", "Led the migration off the legacy ledger", [
            "Contributed to the migration off the legacy ledger",
          ]),
        ],
      },
    ],
  },
];

const before = new Map(
  sections[0].entries!.flatMap((e) => e.bullets).map((b) => [b.id, b.value])
);

const { sections: after, report } = await runGroundingPass(
  client,
  sections,
  "Senior payments engineer. High-volume settlement systems, multi-market."
);

console.log("\n--- what changed ---");
for (const b of after[0].entries![0].bullets) {
  const was = before.get(b.id)!;
  console.log(`\n[${b.id}] ${b.value === was ? "UNTOUCHED" : "CHANGED"}`);
  if (b.value !== was) {
    console.log(`  was: ${was}`);
    console.log(`  now: ${b.value}`);
  }
}

console.log("\n--- report ---");
console.log(
  JSON.stringify(
    { ...report, usage: report.usage.map((u) => ({ model: u.model, ...u.usage })) },
    null,
    2
  )
);

const survived = (id: string) =>
  after[0].entries![0].bullets.find((b) => b.id === id)!.value === before.get(id);

console.log("\n--- verdict ---");
console.log(`${survived("combine-ok") ? "PASS" : "FAIL"}  combined bullet survived`);
console.log(`${survived("reword-ok") ? "PASS" : "FAIL"}  legitimate reword survived`);
console.log(`${!survived("number-invented") ? "PASS" : "FAIL"}  invented headcount corrected`);
console.log(`${!survived("scope-inflated") ? "PASS" : "FAIL"}  role inflation corrected`);
console.log(`${!survived("combine-inferred") ? "PASS" : "FAIL"}  inferred link corrected`);
