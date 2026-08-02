/**
 * Deterministic probe for the sources[] union: a rewrite that combines two of
 * the candidate's own lines must survive, and one that invents must not.
 */
import {
  checkNumbers,
  collectPairs,
  numbersIn,
  unsupportedNumbers,
  spelledNumbers,
  unsupportedSkills,
  usedCitations,
} from "@/lib/grounding";
import { aiTells, stripFiller } from "@/lib/deAiText";
import { checkFacts } from "@/lib/factCheck";
import { indexSource, resolveCitations, uncited } from "@/lib/sourceIndex";
import { logicalLines } from "@/lib/sourceLines";
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

check("the fragment alone would have flagged it", unsupportedNumbers("serving about 400 internal users", [CUT]), [
  "400",
]);

check("a section heading stays its own line", LINES[0], "SUMMARY");

check(
  "a prose paragraph under it joins into one line",
  LINES[1],
  "Operations lead with a background in support. Comfortable with data and automation."
);

// --- Unused citations --------------------------------------------------------
check(
  "a cited line the value never used is dropped",
  usedCitations("Participated in code review and helped establish review guidelines", [
    "Participated in code review and helped establish the team's review guidelines",
    "Took part in the hiring process as an interviewer",
  ]),
  ["Participated in code review and helped establish the team's review guidelines"]
);

check(
  "a genuinely combined bullet keeps both",
  usedCitations("Built the settlement pipeline clearing $2B across 14 markets", [
    "Built the settlement pipeline from scratch",
    "The pipeline clears $2B annually across 14 markets",
  ]),
  [
    "Built the settlement pipeline from scratch",
    "The pipeline clears $2B annually across 14 markets",
  ]
);

check(
  "a citation is kept when only a figure connects it",
  usedCitations("Mentored engineers, 15 hired over three years", [
    "Mentored engineers on the payments team",
    "Helped interview and hire approximately 15 engineers",
  ]).length,
  2
);

check(
  "a lone citation is never stripped, however reworded",
  usedCitations("Owned the payments on-call tier", ["Was responsible for the rotation"]),
  ["Was responsible for the rotation"]
);

check(
  "when nothing looks used the citations stand",
  usedCitations("Completely unrelated wording here", ["Alpha beta gamma", "Delta epsilon zeta"]),
  ["Alpha beta gamma", "Delta epsilon zeta"]
);

// --- Filler and tells --------------------------------------------------------
check(
  "deletable qualifiers are removed",
  stripFiller("Successfully shipped a highly robust seamlessly integrated service"),
  "shipped a robust integrated service"
);

check("a clean line is untouched", stripFiller("Cut latency from 40 minutes to 3"), "Cut latency from 40 minutes to 3");

check(
  "the candidate's own summary is reported as tell-laden",
  aiTells("Passionate about building great products, seeking a challenging role where I can leverage my skills").sort(),
  ["leverage", "passionate"]
);

check("a plain bullet reports no tells", aiTells("Built the settlement pipeline"), []);

// --- Copied fields -----------------------------------------------------------
// The gap nothing else covered: employers, titles, dates and list lines are told
// to be copied verbatim and were never verified against the source.
const SOURCE = `EXPERIENCE

Staff Engineer, Meridian Pay - San Francisco, CA
March 2021 - Present
- Built the settlement pipeline

CERTIFICATIONS
AWS Certified Solutions Architect, 2022`;

const factSections: ResumeSection[] = [
  {
    key: "experience",
    entries: [
      {
        id: "e1",
        heading: "Staff Engineer",
        organization: "Meridian Pay",
        location: "San Francisco, CA",
        startDate: "March 2021",
        endDate: "Present",
        bullets: [],
      },
    ],
  },
];

const mutate = (change: (s: ResumeSection[]) => void): ResumeSection[] => {
  const copy = JSON.parse(JSON.stringify(factSections)) as ResumeSection[];
  change(copy);
  return copy;
};

check("a faithful entry raises nothing", checkFacts(factSections, SOURCE), []);

check(
  "an employer the source never names is reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].organization = "Stripe";
    }),
    SOURCE
  ).map((i) => `${i.field}:${i.value}`),
  ["employer:Stripe"]
);

check(
  "an inflated title is reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].heading = "Director of Engineering";
    }),
    SOURCE
  ).map((i) => i.field),
  ["title"]
);

check(
  "a year the source never states is reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].startDate = "March 2018";
    }),
    SOURCE
  ).map((i) => `${i.field}:${i.value}`),
  ["dates:March 2018"]
);

check(
  "a reformatted month is not reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].startDate = "Mar 2021";
    }),
    SOURCE
  ),
  []
);

check(
  "extraction whitespace is not reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].organization = "Meridian  Pay";
    }),
    SOURCE
  ),
  []
);

check(
  "a hyphen written as an en dash is not reported",
  checkFacts(
    mutate((x) => {
      x[0].entries![0].location = "San Francisco, CA";
      x[0].entries![0].organization = "Meridian–Pay";
    }),
    "Staff Engineer, Meridian-Pay - San Francisco, CA March 2021"
  ),
  []
);

check(
  "a certification line the source never lists is reported",
  checkFacts(
    [{ key: "certifications", items: ["Certified Kubernetes Administrator, 2021"] }],
    SOURCE
  ).map((i) => i.field),
  ["line"]
);

check(
  "a certification the source does list is not",
  checkFacts([{ key: "certifications", items: ["AWS Certified Solutions Architect, 2022"] }], SOURCE),
  []
);

// --- Entry headers must not fuse -------------------------------------------
// The defect: a title line and the date line under it joined into one citable
// "logical line", which the grounding pass then reverted a Summary section to —
// printing "Principal Engineer, Corvid Logistics February 2021 - Present" as
// the candidate's summary.
const HEADERS = logicalLines(`EXPERIENCE

Principal Engineer, Corvid Logistics
February 2021 - Present
- Built the settlement pipeline

Senior Engineer, Kestrel Systems
June 2017 - February 2021
- Built the ingest service`);

check(
  "a title line does not absorb the date line under it",
  HEADERS.includes("Principal Engineer, Corvid Logistics"),
  true
);

check("the date line stands on its own", HEADERS.includes("February 2021 - Present"), true);

check(
  "so no citable line fuses a title to its dates",
  HEADERS.some((l) => /Corvid Logistics February/.test(l)),
  false
);

check(
  "a year-only range is still its own line",
  logicalLines("BS Computer Engineering, Purdue\n2008 - 2012\n").includes("2008 - 2012"),
  true
);

check(
  "a bullet that merely starts with a number is not mistaken for a date",
  logicalLines("- 2 million downloads and a 4.6 star rating on the App Store").length,
  1
);

check(
  "a wrapped bullet still joins across a line starting with a figure",
  logicalLines("- Cut volume inflation by around\n  30% with dedup logic")[0],
  "Cut volume inflation by around 30% with dedup logic"
);

// --- Citation by reference ---------------------------------------------------
const INDEX = indexSource(WRAPPED);
const wrapped = INDEX.find((l) => l.text.startsWith("Responsible for reporting"))!;
const manage = INDEX.find((l) => l.text.startsWith("Manage a support team"))!;

check("ids are stable for the same text", indexSource(WRAPPED)[0].id, INDEX[0].id);

check(
  "ids survive the document being reordered",
  indexSource(`WORK HISTORY\n\n- ${wrapped.text}`).find((l) => l.text === wrapped.text)?.id,
  wrapped.id
);

check(
  "an id resolves to the whole wrapped line",
  resolveCitations([wrapped.id], INDEX),
  [wrapped.text]
);

check("two ids resolve to two lines", resolveCitations([wrapped.id, manage.id], INDEX).length, 2);

check("an invented id resolves to nothing", resolveCitations(["Lnope"], INDEX), []);

check("the same id twice is one citation", resolveCitations([manage.id, manage.id], INDEX), [
  manage.text,
]);

check("bracketed ids are tolerated", resolveCitations([`[${manage.id}]`], INDEX), [manage.text]);

// A model that ignores the protocol and quotes instead. Being strict would
// discard real provenance over a formatting mistake.
check(
  "a quoted line is still resolved",
  resolveCitations(["Manage a support team and own the escalation process"], INDEX),
  [manage.text]
);

check(
  "a quoted line cut at the wrap still resolves to the whole line",
  resolveCitations(["Responsible for reporting to leadership on support trends, which involved"], INDEX),
  [wrapped.text]
);

// Two identical lines must not share an id, or a citation of one silently
// addresses the other.
const DUPES = indexSource("EXPERIENCE\n\n- Volunteer work here\n- Volunteer work here").filter(
  (l) => l.text === "Volunteer work here"
);
check("both duplicate lines are indexed", DUPES.length, 2);
check("and they get distinct ids", DUPES[0].id === DUPES[1].id, false);

check(
  "uncited is exact set subtraction now",
  uncited(INDEX, [wrapped.text]).some((l) => l.startsWith("Responsible for reporting")),
  false
);

check(
  "and still reports what nothing cited",
  uncited(INDEX, [wrapped.text]).some((l) => l.startsWith("Took ownership of the data quality")),
  true
);

// --- Spelled-out numbers -----------------------------------------------------
// The false positive this guards: a source saying "over twelve years", a
// summary saying "12+ years", and a fabrication check that reads digits only
// deciding 12 appeared nowhere in the document — then rewriting a faithful
// summary, on the one path still allowed to change text.
check("a spelled number reads as its digits", spelledNumbers("over twelve years"), ["12"]);
check("plain digits are not double-counted here", spelledNumbers("12+ years"), []);
check("scale words count too", spelledNumbers("roughly two billion a year"), ["2", "1000000000"]);
check("ordinary words yield nothing", spelledNumbers("built the settlement pipeline"), []);

const SPELLED = ["Backend engineer with over twelve years of experience"];
const supported = new Set([
  ...SPELLED.flatMap(numbersIn),
  ...SPELLED.flatMap(spelledNumbers),
]);
check("so '12+ years' is no longer fabrication", numbersIn("12+ years").every((n) => supported.has(n)), true);
check(
  "while a genuinely invented figure still is",
  numbersIn("led 47 engineers").every((n) => supported.has(n)),
  false
);

console.log(failed ? `\n${failed} failing` : "\nall green");
process.exit(failed ? 1 : 0);
