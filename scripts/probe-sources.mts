/**
 * Deterministic probe for the sources[] union: a rewrite that combines two of
 * the candidate's own lines must survive, and one that invents must not.
 */
import {
  checkNumbers,
  collectPairs,
  unsupportedNumbers,
  unsupportedSkills,
} from "@/lib/grounding";
import { expandCitation, logicalLines } from "@/lib/sourceLines";
import type { ResumeSection } from "@/types";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got  ${g}\n      want ${w}`}`);
}

// --- The whole point: a number from source B, a system from source A ---------
check(
  "combined bullet, figure from the second cited line",
  unsupportedNumbers("Built the ledger pipeline processing $2B in annual volume", [
    "Built the ledger pipeline",
    "Pipeline processed $2B annually",
  ]),
  []
);

check(
  "single-source bullet, figure invented",
  unsupportedNumbers("Built the ledger pipeline processing $2B annually", [
    "Built the ledger pipeline",
  ]),
  ["2"]
);

check(
  "figure in neither cited line",
  unsupportedNumbers("Cut latency 38% across 12 services", [
    "Cut latency on the checkout path",
    "Owned 12 services",
  ]),
  ["38"]
);

check("no sources at all is every figure unsupported", unsupportedNumbers("Led 4 teams", []), ["4"]);

// --- Normalisation still holds across the union -----------------------------
check("comma separators", unsupportedNumbers("1,200 patients", ["Seen by 1200 patients"]), []);
check("trailing decimal zeros", unsupportedNumbers("99.9% uptime", ["Held 99.90% uptime"]), []);
check("integers keep their zeros", unsupportedNumbers("100 sites", ["Ran 1 site"]), ["100"]);

// --- collectPairs: verbatim skipping under a list ---------------------------
const sections: ResumeSection[] = [
  {
    key: "summary",
    prose: { value: "Same line", sources: ["Same line"] },
  },
  {
    key: "experience",
    entries: [
      {
        id: "e1",
        heading: "Engineer",
        organization: "Acme",
        location: "",
        startDate: "2020",
        endDate: "2024",
        bullets: [
          // verbatim: one source equal to the value -> skipped
          { id: "b1", value: "Shipped the API", sources: ["Shipped the API"], dropped: false },
          // combined: two sources -> checked, even though one equals the value
          {
            id: "b2",
            value: "Shipped the API serving 4M requests",
            sources: ["Shipped the API", "API served 4M requests"],
            dropped: false,
          },
          // dropped -> never printed, never checked
          { id: "b3", value: "Cut costs 40%", sources: ["Cut costs"], dropped: true },
          // no sources -> checked, and it will fail
          { id: "b4", value: "Led a team of 6", sources: [], dropped: false },
        ],
      },
    ],
  },
];

check(
  "collectPairs skips verbatim and dropped, keeps combined and uncited",
  collectPairs(sections).map((p) => p.id),
  ["b2", "b4"]
);

check(
  "checkNumbers over those pairs flags only the uncited one",
  checkNumbers(collectPairs(sections)).map((v) => v.id),
  ["b4"]
);

// --- Skills are unchanged by sources[] --------------------------------------
check(
  "skills containment",
  unsupportedSkills(
    [{ label: "Tools", items: ["Go", "Kubernetes"] }],
    [{ label: "", items: ["Go", "SQL"] }]
  ),
  ["Kubernetes"]
);

// --- Wrapped source lines ----------------------------------------------------
// The defect this guards: a hard-wrapped bullet cited at its first physical
// line, then reverted to, putting "...which involved" on a finished resume.
const WRAPPED = `SUMMARY
Operations lead with a background in support.
Comfortable with data and automation.

WORK HISTORY

Support Operations Manager, Halcyon
Jan 2022 to present
- Manage a support team and own the escalation process
- Responsible for reporting to leadership on support trends, which involved
  building out a set of SQL queries against the ticket database that eventually
  replaced the weekly manual report and now serves about 400 internal users
- Took ownership of the data quality problem, tracked down the duplicate issue
  inflating our volume numbers by around
  30% and wrote the dedup logic that fixed it`;

const LINES = logicalLines(WRAPPED);
const WHOLE = LINES.find((l) => l.startsWith("Responsible for reporting"));
const CUT = "Responsible for reporting to leadership on support trends, which involved";

check(
  "a wrapped bullet becomes one logical line",
  WHOLE,
  "Responsible for reporting to leadership on support trends, which involved building out a set of SQL queries against the ticket database that eventually replaced the weekly manual report and now serves about 400 internal users"
);

check(
  "a continuation starting with a digit still joins",
  LINES.some((l) => l.includes("by around 30% and wrote the dedup logic")),
  true
);

check("a citation cut at the wrap grows back to the whole bullet", expandCitation(CUT, LINES), WHOLE);

check(
  "the grown citation supports the figure the fragment did not",
  unsupportedNumbers(
    "Built SQL reporting that replaced the weekly manual report, serving about 400 internal users",
    [expandCitation(CUT, LINES)]
  ),
  []
);

check("the fragment alone would have flagged it", unsupportedNumbers("serving about 400 internal users", [CUT]), [
  "400",
]);

check(
  "an unrecognised citation is left alone",
  expandCitation("Something the document never said", LINES),
  "Something the document never said"
);

check(
  "an already-whole citation is unchanged",
  expandCitation("Manage a support team and own the escalation process", LINES),
  "Manage a support team and own the escalation process"
);

check("a section heading stays its own line", LINES[0], "SUMMARY");

check(
  "a prose paragraph under it joins into one line",
  LINES[1],
  "Operations lead with a background in support. Comfortable with data and automation."
);

check(
  "so a citation from that paragraph never drags the heading in",
  expandCitation("Operations lead with a background in support.", LINES),
  "Operations lead with a background in support. Comfortable with data and automation."
);

console.log(failed ? `\n${failed} failing` : "\nall green");
process.exit(failed ? 1 : 0);
