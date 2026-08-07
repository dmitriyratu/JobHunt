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

  // --- Demote rather than starve --------------------------------------------
  // Five jobs, newest first, whose relevance runs the other way: the oldest is
  // the role the posting describes and the current one has nothing to do with
  // it. Ranked on relevance alone the fitter has every reason to gut the top of
  // the page, and before the demotion step it did something worse than that —
  // it left all five standing with one bullet each, a career listed rather than
  // argued.
  //
  // What should come back: the oldest roles carrying the argument, the weakest
  // middle ones as dated lines, and the current job still explained.
  const scored = (
    id: string,
    heading: string,
    start: string,
    end: string,
    n: number,
    rel: number
  ): ResumeEntry => ({ ...entry(id, heading, `Employer ${id}`, start, end, n), relevance: rel });

  const inverted: TailoredResume = {
    ...resume,
    sections: [
      resume.sections[0],
      {
        key: "experience",
        entries: [
          scored("a", "Operations Lead", "2023", "Present", 5, 1),
          scored("b", "Support Manager", "2021", "2023", 5, 3),
          scored("c", "Analyst", "2019", "2021", 5, 5),
          // More than can fit, so there is somewhere for freed space to go. With
          // the strong roles already showing every bullet they have, collapsing
          // a weak one buys room nothing can use, and the step correctly
          // declines — which is a real outcome but tests nothing.
          scored("d", "Backend Engineer", "2016", "2019", 9, 8),
          scored("e", "Platform Engineer", "2013", "2016", 9, 10),
        ],
      },
    ],
  };

  const flipped = await fitToPages(inverted, profile, "Kafka Postgres platform engineer");
  const shown = flipped.resume.sections.flatMap((s) => s.entries ?? []);
  const bulletsOf = (heading: string) =>
    shown.find((e) => e.heading === heading)?.bullets.filter((b) => !b.dropped).length ?? 0;
  const asLine = (flipped.resume.collapsed ?? []).map((c) => c.heading);

  console.log("\ninverted-relevance case:", JSON.stringify({ ...flipped, resume: undefined }));
  console.log("  shown:", shown.map((e) => `${e.heading}(${bulletsOf(e.heading)})`).join(" "));
  console.log("  as dated lines:", asLine.join(", ") || "none");

  const stubs = shown.filter((e) => e.bullets.filter((b) => !b.dropped).length === 1).length;
  console.log(
    `  ${bulletsOf("Operations Lead") >= 3 ? "PASS" : "FAIL"} the current role kept its floor of 3`
  );
  console.log(
    `  ${!asLine.includes("Operations Lead") ? "PASS" : "FAIL"} the current role was never collapsed`
  );
  console.log(
    `  ${!asLine.includes("Support Manager") ? "PASS" : "FAIL"} the second-newest was never collapsed`
  );
  console.log(
    `  ${bulletsOf("Platform Engineer") > 1 ? "PASS" : "FAIL"} the role the posting describes argues`
  );
  console.log(`  ${stubs <= 2 ? "PASS" : "FAIL"} the page is not a row of stubs (${stubs} at one bullet)`);
  console.log(`  ${flipped.fits ? "PASS" : "FAIL"} it reached the page target`);
}

main();
