/**
 * What the proofreader is allowed to offer.
 *
 * The model reads a page of proper nouns and is asked which are misspelled,
 * which is exactly the prompt a model answers with a rewrite if you let it.
 * verifySuggestions is what stops that reaching the candidate, and accepting a
 * suggestion edits the text every later check is made against — so the rules are
 * tested here rather than trusted.
 */
import { applySuggestion, applySuggestions, contextFor, verifySuggestions } from "@/lib/proofread";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      got  ${JSON.stringify(got)}`}`);
}

const TEXT = [
  "Clinical Fellow, Pediatirc Hematology and Oncology",
  "Memorial Sloan Ketering Cancer Center · New York, NY",
  "Recieved the Magna Cum Laude distinction in allogeneic transplantation",
  "Pediatirc emergency care at Centro Médico Real",
].join("\n");

const kept = (raw: { wrong: string; right: string }[]) =>
  verifySuggestions(raw, TEXT).map((s) => `${s.wrong}>${s.right}x${s.count}`);

// --- The ones worth showing --------------------------------------------------
check("a transposition, counted across both occurrences", kept([{ wrong: "Pediatirc", right: "Pediatric" }]), [
  "Pediatirc>Pediatricx2",
]);
check("a dropped letter", kept([{ wrong: "Ketering", right: "Kettering" }]), ["Ketering>Ketteringx1"]);
check("i before e", kept([{ wrong: "Recieved", right: "Received" }]), ["Recieved>Receivedx1"]);

// --- The ones that must never be shown ---------------------------------------
check(
  "a rewrite dressed as a correction",
  kept([{ wrong: "Recieved", right: "Obtained" }]),
  []
);

// What this actually offered on a real document, against "Provided community
// education on vaccinations". One deleted letter, so edit distance cannot tell
// it from a typo — but a plural is a choice the candidate made, not a mistake.
check("a plural", kept([{ wrong: "vaccinations", right: "vaccination" }]), []);
check("a tense", kept([{ wrong: "Provided", right: "Provide" }]), []);
// The next one it offered, on the same CV: "served as Spanish–English medical
// translator". Two edits, both words real, and the suggestion is the wrong one.
check(
  "one real word in place of another, same stem",
  verifySuggestions(
    [{ wrong: "translator", right: "translation" }],
    "served as Spanish-English medical translator for visiting physicians"
  ),
  []
);
// ...while a word missing its last letter still is a typo, and the tail it is
// missing is what tells them apart.
check(
  "a truncated word, whose ending is not an inflection",
  verifySuggestions([{ wrong: "Hematolog", right: "Hematology" }], "Pediatirc Hematolog and Oncology").map(
    (s) => `${s.wrong}>${s.right}`
  ),
  ["Hematolog>Hematology"]
);
check(
  "a word that is not in the document",
  kept([{ wrong: "Pediatrick", right: "Pediatric" }]),
  []
);
check("a multi-word replacement", kept([{ wrong: "Ketering", right: "Kettering Cancer" }]), []);
check("a no-op", kept([{ wrong: "Ketering", right: "Ketering" }]), []);
check("too short to judge", kept([{ wrong: "NY", right: "NJ" }]), []);

// The only thing the reviewer reported on the first real CV it read: a missing
// letter in the candidate's institutional email username. Correct as spelling,
// catastrophic as a change — it is the address an employer replies to.
const WITH_EMAIL = `${TEXT}\n954-551-9455 · alfauteresa@gmail.com · alfauht1@mskcc.org`;
check(
  "a username inside an email address",
  verifySuggestions([{ wrong: "alfauht1", right: "alfaut1" }], WITH_EMAIL),
  []
);
check(
  "an English-looking word that only ever appears inside an address",
  verifySuggestions([{ wrong: "alfauteresa", right: "alfauteres" }], WITH_EMAIL),
  []
);
check(
  "the same word twice collapses to one decision",
  kept([
    { wrong: "Ketering", right: "Kettering" },
    { wrong: "Ketering", right: "Kettering" },
  ]),
  ["Ketering>Ketteringx1"]
);
check("nothing at all", kept([]), []);

// --- Applying -----------------------------------------------------------------
const suggestions = verifySuggestions(
  [
    { wrong: "Pediatirc", right: "Pediatric" },
    { wrong: "Ketering", right: "Kettering" },
  ],
  TEXT
);

check(
  "accepting fixes every occurrence",
  applySuggestion(TEXT, suggestions[0]).includes("Pediatirc"),
  false
);
check(
  "accepting one leaves the other alone",
  applySuggestion(TEXT, suggestions[0]).includes("Ketering Cancer"),
  true
);
check(
  "accept all fixes both",
  /Pediatirc|Ketering /.test(applySuggestions(TEXT, suggestions)),
  false
);

// Whole-word: the fix must not fire inside a longer word that was already right.
check(
  "a fix does not run inside a longer word",
  applySuggestion("advance advanced ance", { wrong: "ance", right: "once", note: "", count: 1 }),
  "advance advanced once"
);

// The whole line, split around the word — enough of the sentence to judge the
// correction, which four words either side was not.
check(
  "context is the line, split around the word",
  contextFor(TEXT, suggestions[1]),
  { before: "Memorial Sloan ", word: "Ketering", after: " Cancer Center · New York, NY" }
);
check(
  "a word that is not in the text has no context",
  contextFor(TEXT, { wrong: "Absent", right: "Absents", note: "", count: 0 }),
  null
);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
