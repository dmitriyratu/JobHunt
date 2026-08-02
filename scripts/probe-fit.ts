/** Why fitToPages measured 0 pages. No API calls — render and compile only. */
import { readFileSync, writeFileSync } from "node:fs";
import { renderResumeLatex } from "@/lib/resumeLatex";
import { compileLatex, findEngine } from "@/lib/latexEngine";
import { fitToPages } from "@/lib/fitToPages";
import { EMPTY_PROFILE } from "@/lib/settings";
import type { ResumeEntry, TailoredResume } from "@/types";

for (const line of readFileSync(".env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const bullet = (id: string, text: string) => ({
  id,
  value: text,
  sources: [text],
  dropped: false,
});

const entry = (id: string, heading: string, org: string, start: string, end: string, n: number): ResumeEntry => ({
  id,
  heading,
  organization: org,
  location: "Chicago, IL",
  startDate: start,
  endDate: end,
  bullets: Array.from({ length: n }, (_, i) =>
    bullet(`${id}-${i}`, `Built the ${heading} thing number ${i} with Kafka and Postgres at considerable scale and some detail to take up room`)
  ),
});

const resume: TailoredResume = {
  shape: "resume",
  pageTarget: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  sections: [
    { key: "summary", prose: { value: "A backend engineer.", sources: ["A backend engineer."] } },
    {
      key: "experience",
      entries: [
        entry("e1", "Principal Engineer", "Corvid", "2021", "Present", 10),
        entry("e2", "Senior Engineer", "Corvid", "2019", "2021", 8),
        entry("e3", "Engineer", "Northgate", "2010", "2012", 8),
      ],
    },
  ],
};

async function main() {
  console.log("engine:", (await findEngine()) ?? "NONE FOUND");

  const tex = renderResumeLatex(resume, { ...EMPTY_PROFILE, fullName: "Test Person" });
  writeFileSync(".tex-debug/fit-probe.tex", tex, "utf-8");

  const direct = await compileLatex(tex);
  console.log("direct compile:", direct.ok ? `${direct.pages} pages` : `FAILED — ${direct.message}`);
  if (!direct.ok) console.log((direct.log ?? "").split("\n").slice(-25).join("\n"));

  const profile = { ...EMPTY_PROFILE, fullName: "Test Person" };
  const fitted = await fitToPages(resume, profile, "Kafka Postgres platform");
  console.log("fitToPages:", JSON.stringify({ ...fitted, resume: undefined }));
  const kept = fitted.resume.sections
    .flatMap((s) => s.entries ?? [])
    .map((e) => `${e.heading}: ${e.bullets.filter((b) => !b.dropped).length}`);
  console.log("bullets per entry after fit:", kept.join(" | "));
  console.log("collapsed:", (fitted.resume.collapsed ?? []).map((c) => c.heading).join(", ") || "none");

  // --- The collapse path ----------------------------------------------------
  // Enough entries that trimming to the floor still overflows, which is the
  // only way collapseWeakest fires. This is the case that exposed the bug where
  // the search after a collapse rebuilt its cut order from an already-emptied
  // document and so could never restore anything: it collapsed five entries and
  // shipped a one page resume carrying three bullets.
  const crowded: TailoredResume = {
    ...resume,
    sections: [
      resume.sections[0],
      {
        key: "experience",
        entries: [
          entry("e1", "Platform Engineer", "Corvid", "2021", "Present", 8),
          entry("e2", "Kafka Engineer", "Corvid", "2019", "2021", 6),
          // Enough dated blocks that their headings alone overflow the page, so
          // trimming to the floor cannot get there and collapse has to fire.
          ...Array.from({ length: 12 }, (_, i) =>
            entry(`f${i}`, `Odd Job ${i}`, `Employer ${i}`, `${1996 + i}`, `${1997 + i}`, 3)
          ),
        ],
      },
      { key: "education", entries: [entry("ed1", "BS Computer Science", "Purdue", "2011", "2015", 0)] },
    ],
  };

  const crammed = await fitToPages(crowded, profile, "Kafka Postgres platform engineer");
  console.log("\ncollapse case:", JSON.stringify({ ...crammed, resume: undefined }));
  console.log(
    "  surviving:",
    crammed.resume.sections
      .flatMap((s) => s.entries ?? [])
      .map((e) => `${e.heading}(${e.bullets.filter((b) => !b.dropped).length})`)
      .join(" ")
  );
  console.log("  collapsed:", (crammed.resume.collapsed ?? []).map((c) => c.heading).join(", ") || "none");

  const survivors = crammed.resume.sections.flatMap((s) => s.entries ?? []).map((e) => e.heading);
  const gone = (crammed.resume.collapsed ?? []).map((c) => c.heading);
  console.log(
    `  ${survivors.includes("Platform Engineer") ? "PASS" : "FAIL"} the posting's own role survived`
  );
  console.log(
    `  ${survivors.includes("BS Computer Science") ? "PASS" : "FAIL"} education was never collapsed`
  );
  console.log(`  ${gone.some((h) => h.startsWith("Odd Job")) ? "PASS" : "FAIL"} the weakest roles were collapsed`);
  console.log(
    `  ${
      crammed.resume.sections
        .flatMap((s) => s.entries ?? [])
        .find((e) => e.heading === "Platform Engineer")!
        .bullets.filter((b) => !b.dropped).length > 1
        ? "PASS"
        : "FAIL"
    } collapsing freed room the lead role got back`
  );
}

main();
