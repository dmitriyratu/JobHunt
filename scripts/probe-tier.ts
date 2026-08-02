/**
 * Which model should write the resume?
 *
 * Runs the real /api/tailor-resume handler against one fixed resume and posting,
 * varying only the writer model. The grounding pass is left on its own models
 * throughout, so what moves between rows is the writing, not the checking.
 *
 * The fixture is built so combining is available: several facts are split
 * across adjacent lines the way a real resume splits them, and the posting asks
 * for exactly the combinations. A model that never cites two lines is leaving
 * that on the table; one that cites two and gets reverted is overreaching.
 */
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tailor-resume/route";
import { TASK_MODELS } from "@/lib/models";
import type { ResumeSection } from "@/types";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

import { RESUME, JOB } from "./fixture";

const TIERS = ((process.env.TIERS ?? "fast,standard,smart").split(",")) as unknown as readonly ("fast"|"standard"|"smart")[];
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
  smart: {
    id: "gpt-5.6-sol",
    pricing: { input: 5, output: 30 },
    supportsTemperature: false,
    reasoning: true,
  },
};
const RUNS = Number(process.env.RUNS ?? 2);

/**
 * The figures the fixture deliberately strands on their own line, with no verb
 * to carry them. Each one has to be folded into the line above to survive, so
 * counting how many reach the document measures the combining behaviour the
 * blind judge kept deciding on.
 */
const ORPHAN_METRICS = ["14 markets", "$2B", "1,100", "30,000"];

const PRICES = new Map(Object.values(SPECS).map((s) => [s.id, s.pricing]));
const cost = (model: string, u: { promptTokens: number; completionTokens: number }) => {
  const p = PRICES.get(model);
  if (!p) return 0;
  return (u.promptTokens * p.input + u.completionTokens * p.output) / 1_000_000;
};

type Row = {
  tier: string;
  bullets: number;
  combined: number;
  reworded: number;
  /** Of ORPHAN_METRICS, how many reached the finished document. */
  kept: number;
  checked: number;
  repaired: number;
  reverted: number;
  unverified: number;
  skillsRemoved: number;
  seconds: number;
  usd: number;
};

const rows: Row[] = [];
const samples: string[] = [];

async function main() {
for (const tier of TIERS) {
  for (let run = 0; run < RUNS; run++) {
    // getTaskModel reads this object on every call, so swapping the entry here
    // steers the route without giving production code a test-only escape hatch.
    Object.assign(TASK_MODELS["tailor-resume"], SPECS[tier]);

    const started = process.hrtime.bigint();
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
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const body = await res.json();

    if (body.error) {
      console.log(`${tier} run ${run + 1}: ERROR ${body.error}`);
      continue;
    }

    const sections: ResumeSection[] = body.draft.sections;
    const bullets = sections
      .flatMap((s) => s.entries ?? [])
      .flatMap((e) => e.bullets)
      .filter((b) => !b.dropped);

    const row: Row = {
      tier,
      bullets: bullets.length,
      combined: bullets.filter((b) => b.sources.length > 1).length,
      // Verbatim copies are not tailoring. Anything else is the model's words.
      reworded: bullets.filter((b) => !b.sources.includes(b.value)).length,
      kept: ORPHAN_METRICS.filter((m) => bullets.some((b) => b.value.includes(m))).length,
      checked: body.grounding.checked,
      repaired: body.grounding.repaired,
      reverted: body.grounding.reverted,
      unverified: body.grounding.unverified,
      skillsRemoved: (body.grounding.removedSkills ?? []).length,
      seconds,
      usd:
        cost(body.usage.model, body.usage) +
        (body.groundingUsage ?? []).reduce(
          (t: number, g: { model: string; usage: { promptTokens: number; completionTokens: number } }) =>
            t + cost(g.model, g.usage),
          0
        ),
    };
    rows.push(row);
    if (process.env.DUMP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(`${process.env.TEMP}/draft-${tier}-${run + 1}.json`, JSON.stringify(body, null, 2));
    }
    console.log(`    [wrote with ${body.usage.model}: ${body.usage.promptTokens}p ${body.usage.completionTokens}c = $${cost(body.usage.model, body.usage).toFixed(4)}]`);
    console.log(
      `${tier.padEnd(9)} run ${run + 1}  ${row.bullets} bullets, ${row.combined} combined, ` +
        `${row.kept}/${ORPHAN_METRICS.length} metrics kept, ` +
        `${row.reworded} reworded | checked ${row.checked} → ${row.repaired}R ${row.reverted}V ` +
        `${row.unverified}U ${row.skillsRemoved}S | ${row.seconds.toFixed(1)}s $${row.usd.toFixed(4)}`
    );

    if (run === 0) {
      const combined = bullets.filter((b) => b.sources.length > 1).slice(0, 3);
      samples.push(
        `\n### ${tier}\n` +
          (combined.length
            ? combined
                .map((b) => `  ${b.value}\n${b.sources.map((s) => `    ← ${s}`).join("\n")}`)
                .join("\n")
            : "  (cited one line per bullet throughout)")
      );
    }
  }
}

const avg = (tier: string, k: keyof Row) => {
  const of = rows.filter((r) => r.tier === tier);
  return of.reduce((t, r) => t + (r[k] as number), 0) / (of.length || 1);
};

console.log("\n--- averages over " + RUNS + " runs each ---");
console.log(
  ["tier", "bullets", "combined", "metrics", "reworded", "reverted", "unverif", "secs", "usd"]
    .map((h) => h.padEnd(9))
    .join("")
);
for (const tier of TIERS) {
  console.log(
    [
      tier,
      avg(tier, "bullets").toFixed(1),
      avg(tier, "combined").toFixed(1),
      avg(tier, "kept").toFixed(1) + "/" + ORPHAN_METRICS.length,
      avg(tier, "reworded").toFixed(1),
      avg(tier, "reverted").toFixed(1),
      avg(tier, "unverified").toFixed(1),
      avg(tier, "seconds").toFixed(1),
      "$" + avg(tier, "usd").toFixed(4),
    ]
      .map((c) => String(c).padEnd(9))
      .join("")
  );
}

console.log("\n--- what combining looked like (first run of each) ---");
console.log(samples.join("\n"));
}

main();
