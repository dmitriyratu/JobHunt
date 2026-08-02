/**
 * The re-check that stands behind the copied-field reviewer.
 *
 * reviewFacts lets a model withhold a warning about an employer, title or date,
 * which is the one place in this app where a model's opinion can stop the
 * candidate from being told something. It is only safe because the clearance is
 * re-checked here: the field has to be a rearrangement of contiguous phrases
 * from the lines the model cited. This probe is that guarantee, tested without
 * a model in the loop.
 *
 * The first case is the one that prompted the whole pass — a fellowship the
 * candidate's document lists as two entries, written by the tailoring as one
 * entry naming both institutions.
 */
import { rearranges } from "@/lib/factTriage";
import { checkFacts } from "@/lib/factCheck";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)})`}`);
}

// The candidate's own lines, as logicalLines would hand them over.
const MERGED_A =
  "Clinical Fellow, Pediatric Hematology and Oncology Northgate Cancer Center New York, NY · July 2024 – June 2027";
const MERGED_B =
  "Clinical Fellow, Pediatric Hematology and Oncology St Aldate's Hospital / Kingsbridge Medical Center New York, NY · July 2024 – June 2027";

// --- The merge this pass exists to forgive -----------------------------------
check(
  "two entries merged into one employer, both lines cited",
  rearranges(
    "Northgate Cancer Center / St Aldate's Hospital / Kingsbridge Medical Center",
    [MERGED_A, MERGED_B]
  ),
  true
);

check(
  "the same merge with only one of its two lines cited",
  rearranges(
    "Northgate Cancer Center / St Aldate's Hospital / Kingsbridge Medical Center",
    [MERGED_A]
  ),
  false
);

check(
  "punctuation and joiner changed, one line",
  rearranges("Northgate Cancer Center — New York, NY", [MERGED_A]),
  true
);

// --- What it must not forgive ------------------------------------------------
// Every word below is in the cited lines. Presence is not the test; contiguity
// is. This is the case that makes the re-check worth having.
check(
  "a title recombined from words of the cited line",
  rearranges("Clinical Oncology Fellow", [MERGED_A]),
  false
);

check(
  "a plausible institution scavenged across two lines",
  rearranges("Northgate Medical Center", [MERGED_A, MERGED_B]),
  false
);

check(
  "an employer that is simply not there",
  rearranges("Johns Hopkins Hospital", [MERGED_A, MERGED_B]),
  false
);

// Three phrases, every one of them contiguous in the candidate's own line, and
// not a title anyone held. This is what set MAX_RUNS to two.
check(
  "assembled from three scraps of one line",
  rearranges("Pediatric Hematology Clinical Fellow Cancer Center New York", [MERGED_A]),
  false
);

// --- Matching is on whole words ----------------------------------------------
check(
  "'Medical Center' does not match a line that says 'Medicine'",
  rearranges("Kingsbridge Medical Center", [
    "Clinical Fellow Kingsbridge Medicine New York, NY",
  ]),
  false
);

check(
  "a dash in the source and a slash in the document are the same string",
  rearranges("Northgate Cancer Center / Kingsbridge Medical Center", [
    "Chief Fellow Northgate Cancer Center – Kingsbridge Medical Center New York, NY",
  ]),
  true
);

// --- Nothing to cite ---------------------------------------------------------
check("no cited lines clears nothing", rearranges("Northgate Cancer Center", []), false);

// --- The finding this all starts from still fires ----------------------------
// The reviewer withholds warnings; it must never be able to stop one being
// raised. checkFacts is unchanged and still reports the merge.
const SOURCE = `${MERGED_A}\n\n${MERGED_B}`;
check(
  "checkFacts still raises the merged employer",
  checkFacts(
    [
      {
        key: "experience",
        entries: [
          {
            id: "e1",
            heading: "Clinical Fellow, Pediatric Hematology and Oncology",
            organization:
              "Northgate Cancer Center / St Aldate's Hospital / Kingsbridge Medical Center",
            location: "New York, NY",
            startDate: "July 2024",
            endDate: "June 2027",
            relevance: 10,
            bullets: [],
          },
        ],
      },
    ],
    SOURCE
  ).map((i) => i.field),
  ["employer"]
);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
