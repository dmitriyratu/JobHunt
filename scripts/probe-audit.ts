/**
 * What the grounding pass actually did, in a form a person can judge.
 *
 * The counters say the check fired N times. They have never said whether it was
 * RIGHT to fire, and reverts have been running at two to thirteen a document —
 * each one replacing tailored text with the candidate's own words. If most of
 * those are correct the checks are doing their job; if most are false positives
 * the checks are quietly costing the quality they exist to protect. Nobody has
 * looked.
 *
 * This prints every decision beside the lines it was judged against, and marks
 * the ones where the objection is most likely wrong, so the read is quick.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tailor-resume/route";
import { logicalLines } from "@/lib/sourceLines";
import { numbersIn, spelledNumbers } from "@/lib/grounding";
import type { GroundingDecision } from "@/lib/groundingPass";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

type Fixture = { RESUME: string; JOB: string };

const FIXTURES: Record<string, () => Promise<Fixture>> = {
  big: () => import("./fixture-big"),
  hard: () => import("./fixture-hard"),
  easy: () => import("./fixture"),
};

async function auditOne(name: string, pageTarget: 1 | 2) {
  const { RESUME, JOB } = await FIXTURES[name]();
  const cache = `.tex-debug/audit-${name}-${pageTarget}p.json`;

  let body: Record<string, unknown>;
  if (!process.env.FRESH && existsSync(cache)) {
    body = JSON.parse(readFileSync(cache, "utf-8")) as Record<string, unknown>;
    console.log(`\n### ${name} @ ${pageTarget}p  [cached]`);
  } else {
    const res = await POST(
      new NextRequest("http://localhost/api/tailor-resume", {
        method: "POST",
        body: JSON.stringify({ resumeText: RESUME, jobDescription: JOB, shape: "resume", pageTarget }),
      })
    );
    body = (await res.json()) as Record<string, unknown>;
    if (body.error) {
      console.log(`\n### ${name} @ ${pageTarget}p  ERROR ${body.error}`);
      return [];
    }
    mkdirSync(".tex-debug", { recursive: true });
    writeFileSync(cache, JSON.stringify(body, null, 2), "utf-8");
    console.log(`\n### ${name} @ ${pageTarget}p  [fresh]`);
  }

  const grounding = body.grounding as { decisions?: GroundingDecision[] } & Record<string, number>;
  const decisions = grounding?.decisions ?? [];
  console.log(
    `checked ${grounding.checked} · repaired ${grounding.repaired} · reverted ${grounding.reverted} · unverified ${grounding.unverified}`
  );

  // Every figure anywhere in the candidate's document. A number the check
  // called unsupported that appears SOMEWHERE in the source is the signature of
  // the keyhole problem — real, just not in the lines that bullet happened to
  // cite.
  const everyFigure = new Set(
    logicalLines(RESUME).flatMap((l) => [...numbersIn(l), ...spelledNumbers(l)])
  );

  for (const d of decisions) {
    const claimed = numbersIn(d.wrote);
    const citedFigures = new Set(d.sources.flatMap(numbersIn));
    const elsewhere = claimed.filter((n) => !citedFigures.has(n) && everyFigure.has(n));
    const nowhere = claimed.filter((n) => !everyFigure.has(n));

    console.log(`\n[${d.outcome.toUpperCase()}] ${d.id}`);
    console.log(`  wrote : ${d.wrote}`);
    for (const s of d.sources) console.log(`  cited : ${s}`);
    if (!d.sources.length) console.log(`  cited : (nothing)`);
    console.log(`  reason: ${d.reason}`);
    if (d.became !== d.wrote) console.log(`  became: ${d.became}`);
    if (elsewhere.length) {
      console.log(`  >> SUSPECT: ${elsewhere.join(", ")} appears in the resume, just not in what it cited`);
    }
    if (nowhere.length) {
      console.log(`  >> FABRICATED: ${nowhere.join(", ")} appears nowhere in the resume`);
    }
  }

  return decisions;
}

async function main() {
  const all: GroundingDecision[] = [];
  for (const [name, target] of [
    ["big", 2],
    ["hard", 1],
    ["easy", 1],
  ] as [string, 1 | 2][]) {
    all.push(...(await auditOne(name, target)));
  }

  const by = (o: string) => all.filter((d) => d.outcome === o).length;
  console.log(
    `\n=== ${all.length} decisions: ${by("repaired")} repaired, ${by("reverted")} reverted, ${by("unverified")} unverified ===`
  );
}

main();
