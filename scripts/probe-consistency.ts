/**
 * What a "this is named two ways" finding is allowed to be.
 *
 * Accepting one rewrites spans of the candidate's own document, so the rules
 * matter more than the model does: every variant has to be findable verbatim,
 * the group has to be one name rather than two organisations sharing a word, and
 * the form standardised on has to be one the candidate already wrote. A model
 * cannot introduce a name here, only choose between spellings that exist.
 */
import { applyVariant, applyVariants, verifyVariants } from "@/lib/consistency";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}`}`);
}

const A = "NewYork-Presbyterian Hospital / Weill Cornell Medical Center";
const B = "NewYork-Presbyterian – Weill Cornell Medical Center";

const CV = [
  "Clinical Fellow, Pediatric Hematology and Oncology",
  A,
  "New York, NY · July 2024 – June 2027",
  "Chief Fellow, Pediatric Hematology and Oncology",
  `Memorial Sloan Kettering Cancer Center / ${B}`,
  "New York, NY · 2026–2027",
  "Social Chair, Pediatric Hematology and Oncology Fellowship",
  `Memorial Sloan Kettering Cancer Center / ${B}`,
  "Header: Memorial Sloan Kettering Cancer Center/Weill Cornell Medicine · New York, NY",
].join("\n");

const shape = (raw: Parameters<typeof verifyVariants>[0]) =>
  verifyVariants(raw, CV).map((v) => `${v.preferred} <= ${v.variants.map((x) => `${x.text}(${x.count})`).join(" | ")}`);

// --- The finding this exists for ---------------------------------------------
check(
  "the same hospital, two forms, counted",
  shape([{ variants: [A, B], preferred: A, note: "" }]),
  [`${A} <= ${B}(2) | ${A}(1)`]
);

// --- What it must not be -----------------------------------------------------
check(
  "a variant the document does not actually contain",
  shape([{ variants: [A, "NewYork Presbyterian Weill Cornell"], preferred: A, note: "" }]),
  []
);
check(
  "standardising on a form the candidate never wrote",
  shape([{ variants: [A, B], preferred: "NewYork-Presbyterian/Weill Cornell Medical Center", note: "" }]),
  []
);
// The medical school and the hospital are different institutions that share a
// name. Grouping them would rewrite one into the other.
check(
  "two different organisations that share a word",
  shape([
    {
      variants: ["Weill Cornell Medicine", "Weill Cornell Medical Center"],
      preferred: "Weill Cornell Medical Center",
      note: "",
    },
  ]),
  []
);
// What it actually proposed on the first live run, and the reason the test is
// the symmetric difference rather than the overlap ratio: these share seven
// words of eleven. Weill Cornell Medicine is the school in her header; Weill
// Cornell Medical Center is the hospital.
check(
  "the school and the hospital, sharing most of their words",
  shape([
    {
      variants: [
        "Memorial Sloan Kettering Cancer Center/Weill Cornell Medicine",
        `Memorial Sloan Kettering Cancer Center / ${B}`,
      ],
      preferred: `Memorial Sloan Kettering Cancer Center / ${B}`,
      note: "",
    },
  ]),
  []
);

check("a group of one", shape([{ variants: [A], preferred: A, note: "" }]), []);
check(
  "a single word, which belongs to the proofreader",
  shape([{ variants: ["Kettering", "Ketering"], preferred: "Kettering", note: "" }]),
  []
);
check("nothing at all", shape([]), []);

// --- Applying -----------------------------------------------------------------
const [issue] = verifyVariants([{ variants: [A, B], preferred: A, note: "" }], CV);

check("unifying leaves no other spelling behind", applyVariant(CV, issue).includes(B), false);
check(
  "and puts the preferred one everywhere",
  applyVariant(CV, issue).split(A).length - 1,
  3
);
check("all of them at once", applyVariants(CV, [issue]).includes(B), false);

// A name given in full and then shortened is normal practice, not an
// inconsistency — and unifying it would be wrong as often as right, since the
// short form may be a different thing. The overlap floor drops it.
check(
  "a full name and a shortened later mention",
  verifyVariants(
    [
      {
        variants: ["Roth Laboratory, NYU Langone", "Roth Laboratory"],
        preferred: "Roth Laboratory, NYU Langone",
        note: "",
      },
    ],
    "Roth Laboratory, NYU Langone and Roth Laboratory elsewhere"
  ),
  []
);

// Where one variant IS a substring of another and the group survives, the long
// one has to be rewritten first or replacing the short one destroys it.
const NESTED =
  "NewYork-Presbyterian Hospital / Weill Cornell in one place, NewYork-Presbyterian Hospital in another";
const [nested] = verifyVariants(
  [
    {
      variants: ["NewYork-Presbyterian Hospital / Weill Cornell", "NewYork-Presbyterian Hospital"],
      preferred: "NewYork-Presbyterian Hospital / Weill Cornell",
      note: "",
    },
  ],
  NESTED
);
check(
  "a variant nested inside another does not corrupt it",
  nested ? applyVariant(NESTED, nested) : "(dropped)",
  "NewYork-Presbyterian Hospital / Weill Cornell in one place, NewYork-Presbyterian Hospital / Weill Cornell in another"
);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
