/**
 * What happens to a long document that only half-fits the posting.
 *
 * Answers, with numbers rather than argument:
 *   1. SELECT   — how much of the source survives, and is what survives the
 *                 half the posting asked for?
 *   2. COMBINE  — how many surviving bullets weld two or more source lines?
 *   3. CHECK    — what the grounding pass found and did.
 *   4. ORDER    — does the strongest evidence reach the top of the page, or is
 *                 it buried behind a fixed spine and a date sort?
 *
 * Writes the rendered .tex so the finished document can be read directly
 * instead of inferred from counters.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/tailor-resume/route";
import { logicalLines } from "@/lib/sourceLines";
import { renderResumeLatex } from "@/lib/resumeLatex";
import { EMPTY_PROFILE } from "@/lib/settings";
import { draftToResume, resumeToPlainText, visibleBullets } from "@/lib/tailoredResume";
import { compileLatex } from "@/lib/latexEngine";
import { fitToPages } from "@/lib/fitToPages";
import { RESUME, JOB } from "./fixture-big";
import type { ResumeDraft, ResumePageTarget } from "@/types";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

/**
 * The material the posting actually asks for, and the material it does not.
 *
 * Hand-labelled from the fixture, because "relevant" is the judgement under
 * test and deriving it from the model's own output would beg the question.
 */
const WANTED = [
  "40 million events",
  "decompose the monolith",
  "Kafka",
  "idempotency layer",
  "200 support tickets",
  "OpenTelemetry",
  "Aurora",
  "90 seconds",
  "30 shipping carriers",
  "retry and backoff",
  "$430,000",
  "on-call",
];
const NOT_WANTED = [
  "2 million downloads",
  "Apple Pay",
  "launch time",
  "design system",
  "wish lists",
  "loyalty card",
  "marketing attribution",
  "Google Analytics",
  "office move",
  "78%",
  "HIPAA",
];

const PROFILE = {
  ...EMPTY_PROFILE,
  fullName: "Marcus Adeyemi-Hall",
  email: "marcus.adeyemihall@example.com",
  phone: "(312) 555-0177",
  location: "Chicago, IL",
};

const hits = (text: string, terms: string[]) => terms.filter((t) => text.toLowerCase().includes(t.toLowerCase()));

/**
 * The generation, cached on disk, and deliberately UNFITTED.
 *
 * Everything downstream of the model — the page fitting, the collapse rules,
 * the LaTeX, the compile — is deterministic and costs nothing but CPU. Paying
 * for a fresh nine page tailoring to test any of that is paying to answer a
 * question the model had no part in, and it is where most of a day's API spend
 * went.
 *
 * The route skips fitting when no profile is sent, which is exactly the seam
 * needed: fetch the draft without one, cache it, and run fitToPages here. The
 * fitter can then be changed and re-measured for free, and only a change to the
 * prompt or the schema costs anything. Set FRESH=1 to buy a new draft.
 */
async function draftFor(pageTarget: ResumePageTarget): Promise<Record<string, unknown>> {
  // Its own cache, deliberately. Sharing the audit's meant fitting a draft the
  // model had written FOR two pages down to one, which measures a squeeze the
  // app never performs — the route generates against the target it was given.
  const cache = `.tex-debug/draft-${pageTarget}p.json`;

  if (!process.env.FRESH && existsSync(cache)) {
    console.log(`   [cached draft — set FRESH=1 to buy a new generation]`);
    return JSON.parse(readFileSync(cache, "utf-8")) as Record<string, unknown>;
  }

  const res = await POST(
    new NextRequest("http://localhost/api/tailor-resume", {
      method: "POST",
      body: JSON.stringify({
        resumeText: RESUME,
        jobDescription: JOB,
        shape: "resume",
        pageTarget,
        // No profile on purpose: this is the unfitted draft.
      }),
    })
  );
  const body = (await res.json()) as Record<string, unknown>;
  if (body.error) return body;

  mkdirSync(".tex-debug", { recursive: true });
  writeFileSync(cache, JSON.stringify(body, null, 2), "utf-8");
  return body;
}

async function run(pageTarget: ResumePageTarget) {
  const body = await draftFor(pageTarget);
  if (body.error) {
    console.log(`page target ${pageTarget}: ERROR ${body.error}`);
    return;
  }

  const unfitted = draftToResume(body.draft as ResumeDraft, "resume", pageTarget);
  const fitResult = await fitToPages(unfitted, PROFILE, JOB);
  const resume = fitResult.resume;
  // Shaped like the route's own `fit` field so the report below reads the same
  // whether the draft was cached or freshly bought.
  (body as { fit?: unknown }).fit = {
    pages: fitResult.pages,
    trimmed: fitResult.trimmed,
    collapsed: fitResult.collapsed,
    droppedSections: fitResult.droppedSections,
    skillsRemoved: fitResult.skillsRemoved,
    summaryShortened: fitResult.summaryShortened,
    fits: fitResult.fits,
  };
  const entries = resume.sections.flatMap((s) => s.entries ?? []);
  const kept = entries.flatMap((e) => visibleBullets(e.bullets));
  const cut = entries.flatMap((e) => e.bullets.filter((b) => b.dropped));
  const text = resumeToPlainText(resume);

  const sourceBullets = logicalLines(RESUME).filter((l) => l.length > 40).length;

  console.log(`\n${"=".repeat(70)}\nPAGE TARGET: ${pageTarget}\n${"=".repeat(70)}`);
  console.log(`1. SELECT`);
  console.log(`   source lines worth keeping : ~${sourceBullets}`);
  console.log(`   bullets returned           : ${kept.length} kept, ${cut.length} marked dropped`);
  console.log(`   entries kept               : ${entries.length}`);
  console.log(`   sections                   : ${resume.sections.map((s) => s.key).join(" > ")}`);
  const gotWanted = hits(text, WANTED);
  const gotNoise = hits(text, NOT_WANTED);
  console.log(`   posting-relevant material  : ${gotWanted.length}/${WANTED.length} present`);
  console.log(`     missing: ${WANTED.filter((w) => !gotWanted.includes(w)).join(" | ") || "none"}`);
  console.log(`   off-target material        : ${gotNoise.length}/${NOT_WANTED.length} present`);
  console.log(`     present: ${gotNoise.join(" | ") || "none"}`);

  console.log(`\n2. COMBINE`);
  const combined = kept.filter((b) => b.sources.length > 1);
  console.log(`   bullets citing 2+ source lines : ${combined.length}/${kept.length}`);
  console.log(`   bullets reworded at all        : ${kept.filter((b) => !b.sources.includes(b.value)).length}/${kept.length}`);
  for (const b of combined.slice(0, 3)) {
    console.log(`   · ${b.value}`);
    for (const s of b.sources) console.log(`       from: ${s.slice(0, 90)}${s.length > 90 ? "…" : ""}`);
  }

  // Whether the summary on the page is the model's work or the candidate's own
  // paragraph handed back — and whether it carries the words the app bans.
  const prose = resume.sections.find((x) => x.prose)?.prose;
  const BANNED = ["passionate", "leverage", "seeking a challenging", "proven track record", "fast-paced"];
  console.log(`\n2b. SUMMARY`);
  console.log(`   verbatim from source : ${prose ? prose.sources.includes(prose.value) : "n/a"}`);
  console.log(
    `   banned words present : ${
      BANNED.filter((w) => (prose?.value ?? "").toLowerCase().includes(w)).join(", ") || "none"
    }`
  );

  console.log(`\n3. CHECK`);
  console.log(`   grounding: ${JSON.stringify(body.grounding)}`);
  console.log(`   fit:       ${JSON.stringify(body.fit)}`);
  console.log(`   omitted:   ${(resume.omitted ?? []).length} source lines nothing cites`);
  console.log(`   collapsed: ${(resume.collapsed ?? []).map((c) => `${c.heading} @ ${c.organization}`).join(" | ") || "none"}`);

  console.log(`\n4. ORDER — first bullet of each entry, in printed order`);
  for (const e of entries) {
    const first = visibleBullets(e.bullets)[0];
    console.log(`   ${e.heading} @ ${e.organization} (${e.startDate} - ${e.endDate})`);
    console.log(`     ${first ? first.value.slice(0, 100) : "(no bullets)"}`);
  }

  const tex = renderResumeLatex(resume, PROFILE);
  const dir = ".tex-debug";
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/volume-${pageTarget}p.tex`, tex, "utf-8");
  writeFileSync(`${dir}/volume-${pageTarget}p.txt`, text, "utf-8");

  const compiled = await compileLatex(tex);
  console.log(
    `\n   typeset: ${compiled.ok ? `${compiled.pages} pages (target ${pageTarget})` : `FAILED — ${compiled.message}`}`
  );
}

async function main() {
  const targets = (process.env.TARGETS ?? "1,2").split(",").map(Number);
  for (const t of targets) await run(t as ResumePageTarget);
}

main();
