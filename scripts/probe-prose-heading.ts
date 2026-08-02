/**
 * Temporary. Two checks for the prose-heading guard added to /api/tailor-resume:
 *
 *  1. The RULE — mirrors the two lines of `isProseHeading` (it cannot be
 *     imported: a Next.js route module may only export HTTP handlers) and runs
 *     them over real headings taken from a clinical CV, the check-templates
 *     fixtures and the prompt's own examples. A false positive costs an entry
 *     its name, so this is the check that matters.
 *
 *  2. The WIRING — renders an entry with an empty heading through the real
 *     template and asserts the organisation is promoted rather than a blank
 *     bold line being printed above it.
 */
import { renderResumeLatex } from "@/lib/resumeLatex";
import type { ResumeProfile } from "@/lib/settings";
import type { TailoredResume } from "@/types";

// --- 1. the rule ------------------------------------------------------------

const FILLER = new Set([
  "a", "an", "the", "and", "or", "of", "in", "at", "for", "to", "with", "on", "as",
  "current", "currently", "ongoing", "present", "role", "position", "serving",
  "serve", "served", "working", "work", "is", "was", "are", "were", "be", "being",
  "this", "that", "my", "i", "new", "program", "programme",
  "completed", "complete", "finished", "attended", "obtained", "received",
  "participated", "undertook", "undertaking", "appointed", "selected",
]);
const contentTokens = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w)).map((w) => w.slice(0, 5));

function isProseHeading(heading: string): boolean {
  const text = heading.trim();
  if (!/[a-z0-9)]\.$/.test(text)) return false;
  return contentTokens(text).length >= 8;
}

const KEEP = [
  "Doctor of Medicine (MD), Magna Cum Laude",
  "General Pediatrics, Board Certified",
  "New York State Medical License",
  "Clinical Fellow, Pediatric Hematology and Oncology",
  "Resident Physician, General Pediatrics",
  "Primary Care Physician – Pediatric Emergency Department",
  "Targeting CD30 to Overcome Resistance to Immune Checkpoint Inhibitors in Hodgkin Lymphoma",
  "Cyclophosphamide Pharmacokinetics in Pediatric and Adult HCT/IEC Recipients",
  "Intracellular Cytokine Profiling Following Allogeneic HCT",
  "Chief Fellow, Pediatric Hematology and Oncology",
  "Social Chair, Pediatric Hematology and Oncology Fellowship",
  "Detroit Pediatric Health Fair",
  "Doctor for a Day Program",
  "Foundation Loma Los Pinos Medical Outreach",
  "Sister Parish Medical Mission – Pediatrics",
  // Initialisms: end in a full stop but are titles.
  "Doctor of Medicine, M.D.",
  "Doctor of Philosophy in Molecular Biology, Ph.D.",
  "Master of Public Health, M.P.H.",
  // Non-clinical shapes from the fixtures and prompt.
  "Principal Engineer",
  "Senior Backend Engineer (Remote)",
  "BS Computer Science",
  "Staff Software Engineer, Payments Platform",
  // Ends in a stop but far too short to be confident.
  "Investigating cytokines.",
];

const DEMOTE = [
  "Investigating CD30-directed therapeutic strategies to overcome resistance to immune checkpoint inhibitors in relapsed/refractory classical Hodgkin lymphoma.",
  "Characterizing intracellular cytokine profiles in patients following allogeneic HCT and correlating them with post-transplant outcomes.",
  "Led a team of eight engineers rebuilding the payments platform end to end.",
];

let bad = 0;
for (const h of KEEP) {
  if (isProseHeading(h)) { console.log(`FALSE POSITIVE  ${h}`); bad++; }
}
for (const h of DEMOTE) {
  if (!isProseHeading(h)) { console.log(`MISSED          ${h}`); bad++; }
}
console.log(
  bad === 0
    ? `PASS  rule: ${KEEP.length} real headings kept, ${DEMOTE.length} sentences demoted`
    : `FAIL  ${bad} wrong`
);

// --- 2. the wiring ----------------------------------------------------------

const profile: ResumeProfile = {
  fullName: "Test Candidate", headline: "", email: "t@example.com",
  phone: "", location: "New York, NY", links: [], hiddenLinks: [],
};

const resume: TailoredResume = {
  shape: "cv", pageTarget: null, generatedAt: "2026-01-01T00:00:00.000Z",
  sections: [
    {
      key: "research",
      entries: [
        {
          // What a demotion leaves behind: no heading, organisation intact.
          id: "e1", heading: "", organization: "Boelens Laboratory, MSKCC",
          location: "New York, NY", startDate: "", endDate: "",
          bullets: [
            { id: "e1-lead", value: "Investigating CD30-directed therapeutic strategies.", sources: ["Investigating CD30-directed therapeutic strategies."], dropped: false },
          ],
        },
        {
          id: "e2", heading: "A Real Project Title", organization: "Roth Laboratory, NYU Langone",
          location: "New York, NY", startDate: "", endDate: "",
          bullets: [{ id: "b2", value: "Did the work.", sources: ["Did the work."], dropped: false }],
        },
      ],
    },
  ],
};

const tex = renderResumeLatex(resume, profile);
const checks: [string, boolean][] = [
  ["organisation promoted into the heading slot", tex.includes("\\entryflat{Boelens Laboratory, MSKCC}")],
  ["no empty heading argument emitted", !tex.includes("\\entryflat{}")],
  // bindTail ties only the LAST space of each part, so "New York, NY" comes
  // through as "New York,~NY" and the org keeps its earlier spaces.
  ["promoted entry drops the org from the second line, keeping only location",
    tex.includes("\\entryflat{Boelens Laboratory, MSKCC}{New York,~NY}{}")],
  ["titled entry still renders heading + org + location",
    tex.includes("\\entryflat{A Real Project Title}{Roth Laboratory, NYU~Langone~· New York,~NY}{}")],
  ["headline falls back past the untitled entry", tex.includes("A Real Project Title}\\\\[3pt]") || tex.includes("{\\headlinestyle A Real Project Title}")],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS " : "FAIL "} wiring: ${name}`);
if (process.argv[2]) {
  require("node:fs").writeFileSync(process.argv[2], tex, "utf8");
  console.log(`wrote ${process.argv[2]}`);
}
