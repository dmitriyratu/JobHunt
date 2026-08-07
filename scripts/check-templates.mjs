/**
 * Template regression check.
 *
 * Renders a fixture document in every shape, compiles it with the same engine
 * and flags the app uses, and reads the text back out with three independent
 * PDF parsers. It fails on anything that would reach a recruiter as a defect:
 *
 *   - a document that does not compile
 *   - a line pushed past the margin (overfull box)
 *   - a word split across lines, which extracts as "hema-tology"
 *   - words run together, which is what justification does under XeTeX
 *   - a missing name, email, phone or section heading
 *   - sections coming out in an order the catalogue's bands forbid
 *
 * This exists because every one of those was found by hand once. Checking them
 * by hand again on every preamble edit is not going to happen, and each is
 * invisible in a PDF viewer.
 *
 * Run:  npm run check:templates
 * Needs Tectonic on PATH or at TECTONIC_PATH (same discovery as the app).
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

// --- Engine -----------------------------------------------------------------

function candidatePaths() {
  const out = [];
  if (process.env.TECTONIC_PATH) out.push(process.env.TECTONIC_PATH);
  out.push("tectonic");
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    out.push(path.join(process.env.LOCALAPPDATA, "Programs", "tectonic", "tectonic.exe"));
  } else if (process.env.HOME) {
    out.push(path.join(process.env.HOME, ".cargo", "bin", "tectonic"));
    out.push("/usr/local/bin/tectonic");
    out.push("/opt/homebrew/bin/tectonic");
  }
  return out;
}

async function findEngine() {
  for (const c of candidatePaths()) {
    try {
      await run(c, ["--version"], { timeout: 10_000 });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}

// --- Fixture ----------------------------------------------------------------

const PROFILE = {
  fullName: "Alex Moreno",
  headline: "Pediatric Hematology-Oncology Physician",
  location: "Boston, MA",
  email: "alex.moreno@example.edu",
  phone: "(617) 555-0142",
  // One clickable link and one identifier that deliberately has no URL, so the
  // contact line exercises both branches of the renderer.
  links: [
    { kind: "linkedin", value: "linkedin.com/in/alex-moreno" },
    { kind: "npi", value: "1234567890" },
  ],
};

const res = (v) => ({ value: v, source: v, change: "unchanged", resolution: "pending" });
const bullet = (id, v) => ({ id, value: v, source: v, change: "unchanged", resolution: "pending" });

function section(key, over = {}) {
  return {
    key,
    prose: res(""),
    keywords: res([]),
    entries: [],
    items: [],
    ...over,
  };
}

/**
 * Deliberately awkward content. Every field here has broken something at least
 * once: a note beginning with "[", an ampersand, a percent sign, a long
 * unbreakable technical word, and an entry with no dates at all.
 */
function fixtureSections(shape) {
  const entry = (id, heading, organization, location, startDate, endDate, bullets) => ({
    id,
    heading,
    organization,
    location,
    startDate,
    endDate,
    bullets,
  });

  const experience = section("experience", {
    entries: [
      entry("e1", "Fellow, Pediatric Hematology-Oncology", "Boston Children's Hospital", "Boston, MA", "2022", "Present", [
        bullet("b1", "[Immunophenotyping] of leukemia & lymphoma specimens, raising turnaround 40% to 92%"),
        bullet("b2", "Managed febrile neutropenia, tumor lysis syndrome and hyperleukocytosis on a 24-bed service"),
      ]),
      entry("e2", "Resident, Pediatrics", "Massachusetts General Hospital", "Boston, MA", "", "", [
        bullet("b3", "Electroencephalographically confirmed seizure protocols across PICU and NICU rotations"),
      ]),
    ],
  });

  const education = section("education", {
    entries: [
      entry("d1", "Doctor of Medicine", "Johns Hopkins University School of Medicine", "Baltimore, MD", "2015", "2019", []),
    ],
  });

  const publications = section("publications", {
    items: [
      "Moreno A, Chen L, Okafor N. Immunophenotypic drift in relapsed disease. J Clin Oncol. 2025;43(2):211-219.",
    ],
  });

  const languages = section("languages", { items: ["English (native)", "Spanish (professional)"] });

  const research = section("research", {
    entries: [
      {
        id: "r1",
        heading: "Minimal residual disease kinetics in relapsed ALL",
        organization: "Dana-Farber Cancer Institute",
        location: "Boston, MA",
        startDate: "2023",
        endDate: "Present",
        bullets: [bullet("rb1", "[Retrospective cohort] of 240 patients; manuscript under review")],
      },
    ],
  });

  // Each shape gets a fixture built from its OWN sections, not a shared one
  // filtered down. A section key that a shape does not declare is dropped by the
  // renderer, so a shared fixture would silently exercise nothing on the shapes
  // whose catalogue it does not overlap — the check would pass by rendering an
  // almost empty page. Every branch below therefore fills that shape's required
  // sections, and each keeps at least one of the awkward strings above.
  switch (shape) {
    case "resume":
      return [
        section("summary", { prose: res("Board-eligible physician with eight years across inpatient and ambulatory oncology.") }),
        section("skills", {
          keywords: res([
            { label: "Clinical", items: ["Chemotherapy", "Transfusion medicine", "Palliative care"] },
            { label: "Research", items: ["REDCap", "R", "Chart review"] },
          ]),
        }),
        experience,
        education,
        section("certifications", { items: ["American Board of Pediatrics, 2022", "PALS & BLS, current through 2027"] }),
      ];

    case "cv":
      return [
        education,
        // Dated entries, matching the spec in documentShape. This carried
        // `items` long after licensure stopped being a plain list, and the
        // renderer had a fallback that printed them — so the check was
        // exercising a shape the generator no longer produces, and passing.
        section("licensure", {
          entries: [
            entry("l1", "Massachusetts Medical License #123456", "Board of Registration in Medicine", "", "2021", "2027", []),
            entry("l2", "American Board of Pediatrics", "ABP", "", "2022", "", []),
            entry("l3", "APHON Pediatric Chemotherapy & Biotherapy Provider", "APHON", "", "2023", "2026", []),
          ],
        }),
        experience,
        section("procedures", {
          keywords: res([{ label: "Independent", items: ["Bone marrow aspiration and biopsy", "Lumbar puncture with intrathecal chemotherapy"] }]),
        }),
        research,
        publications,
        section("memberships", { items: ["American Society of Pediatric Hematology/Oncology, 2022-Present"] }),
        languages,
      ];

    case "academic":
      return [
        section("interests", { prose: res("Immunophenotypic heterogeneity in relapsed pediatric leukemia, and the measurement error it introduces into minimal residual disease assays.") }),
        education,
        section("experience", {
          entries: [
            entry("a1", "Assistant Professor of Pediatrics", "Harvard Medical School", "Boston, MA", "2024", "Present", []),
            entry("a2", "Postdoctoral Research Fellow", "Dana-Farber Cancer Institute", "Boston, MA", "2022", "2024", []),
          ],
        }),
        research,
        section("grants", {
          entries: [
            entry("g1", "K08 Mentored Clinical Scientist Award (5% effort relief)", "National Cancer Institute", "Bethesda, MD", "2024", "Present", [
              bullet("gb1", "[Principal investigator] on a five-year award; direct costs $675,000"),
            ]),
          ],
        }),
        publications,
        section("presentations", {
          items: [
            "Moreno A. Electroencephalographically silent relapse: a measurement problem. ASPHO Annual Meeting, Denver CO, 2025. Invited talk.",
          ],
        }),
        section("teaching", {
          entries: [
            entry("t1", "PED-320: Hematologic Malignancies in Childhood", "Harvard Medical School", "Boston, MA", "2024", "Present", [
              bullet("tb1", "Designed & taught a 14-week seminar for 22 third-year students"),
            ]),
          ],
        }),
        section("service", {
          entries: [
            entry("s1", "Reviewer", "Journal of Clinical Oncology & Blood Advances", "", "2023", "Present", []),
          ],
        }),
        section("memberships", { items: ["American Society of Pediatric Hematology/Oncology, 2022-Present"] }),
        languages,
      ];

    case "federal":
      return [
        section("summary", { prose: res("Board-eligible physician with eight years of progressively responsible experience across inpatient and ambulatory oncology, including direct patient care, protocol development and quality improvement at a 24-bed service.") }),
        section("eligibility", {
          items: [
            "US Citizen",
            "Veterans' preference: 5-point (TP)",
            "Security clearance: Public Trust, active",
            "Current federal grade: GS-0602-13",
          ],
        }),
        section("experience", {
          entries: [
            entry("f1", "Fellow, Pediatric Hematology-Oncology", "Boston Children's Hospital", "Boston, MA", "2022", "Present", [
              bullet("fb1", "40 hours/week; GS-0602-12 equivalent; Supervisor: Dr. L. Chen, (617) 555-0188, may contact"),
              bullet("fb2", "[Immunophenotyping] of leukemia & lymphoma specimens, raising turnaround 40% to 92%"),
              bullet("fb3", "Managed febrile neutropenia, tumor lysis syndrome and hyperleukocytosis on a 24-bed service"),
            ]),
          ],
        }),
        education,
        section("skills", {
          keywords: res([
            { label: "Clinical", items: ["Chemotherapy", "Transfusion medicine", "Palliative care"] },
            { label: "Analysis", items: ["REDCap", "R", "Chart review"] },
          ]),
        }),
        section("training", { items: ["Protocol Development for Federal Trials, NIH, 2024, 40 contact hours"] }),
        section("certifications", { items: ["American Board of Pediatrics, 2022", "PALS & BLS, current through 2027"] }),
        languages,
      ];

    case "legal":
      return [
        section("education", {
          entries: [
            entry("l1", "Juris Doctor, cum laude", "Georgetown University Law Center", "Washington, DC", "2016", "2019", [
              bullet("lb1", "Notes Editor, Georgetown Law Journal; [Moot Court] semifinalist"),
            ]),
            entry("l2", "Bachelor of Arts, History", "Amherst College", "Amherst, MA", "2011", "2015", []),
          ],
        }),
        section("admissions", {
          items: [
            "Massachusetts, 2019",
            "US District Court, District of Massachusetts, 2020",
            "New York, application pending",
          ],
        }),
        section("experience", {
          entries: [
            entry("l3", "Associate, Health Care & Life Sciences", "Ropes & Gray LLP", "Boston, MA", "2021", "Present", [
              bullet("lb2", "Second-chaired a 340B pricing dispute; drafted summary judgment briefing"),
            ]),
            entry("l4", "Summer Associate", "Ropes & Gray LLP", "Boston, MA", "", "", []),
          ],
        }),
        section("clerkships", {
          entries: [
            entry("l5", "Law Clerk", "Hon. R. Okafor, US District Court, D. Mass.", "Boston, MA", "2019", "2021", []),
          ],
        }),
        publications,
        languages,
      ];

    case "creative":
      return [
        section("credits", {
          entries: [
            entry("c1", "Masha", "Three Sisters, Huntington Theatre Company", "Boston, MA", "2025", "", [
              bullet("cb1", "Directed by L. Chen; [understudy] for Olga"),
            ]),
            entry("c2", "Ensemble", "Electroencephalographically Yours, Fringe Festival", "Edinburgh", "", "", []),
          ],
        }),
        section("exhibitions", {
          items: [
            "Drift (solo), Gallery 263, Cambridge MA, 2025",
            "Interference & Noise (group), SPRING/BREAK, New York NY, 2024",
          ],
        }),
        section("experience", {
          entries: [
            entry("c3", "Teaching Artist", "Boston Children's Theatre", "Boston, MA", "2022", "Present", [
              bullet("cb2", "Led a 12-week devising residency for 30% tuition-waived students"),
            ]),
          ],
        }),
        section("education", {
          entries: [
            entry("c4", "MFA, Acting", "Brown University / Trinity Rep", "Providence, RI", "2019", "2022", []),
          ],
        }),
        section("skills", {
          keywords: res([
            { label: "Dialects", items: ["RP", "General American", "Dublin"] },
            { label: "Movement", items: ["Stage combat (unarmed)", "Contemporary"] },
          ]),
        }),
        section("awards", { items: ["Elliot Norton Award, Outstanding Actress, 2025"] }),
        languages,
      ];

    default:
      throw new Error(`fixture missing for shape ${JSON.stringify(shape)}`);
  }
}

// --- Checks -----------------------------------------------------------------

async function extractAll(pdfPath) {
  const buf = await readFile(pdfPath);
  const out = {};

  const pdfParse = require("pdf-parse");
  out["pdf-parse"] = (await pdfParse(buf)).text;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("") + "\n";
  }
  out["pdfjs-dist"] = text;

  return { texts: out, pages: doc.numPages };
}

/**
 * `corpus` is every string that went into the document, lowercased. Run-together
 * words are found by asking whether a long extracted token actually appears in
 * the input rather than by length alone — "electroencephalographically" is a
 * real word a clinician might well write, while "immunophenotypingofleukemia"
 * is two words whose separating space did not survive. Only the second is a bug,
 * and only the corpus can tell them apart.
 */
function checkText(label, text, expected, corpus, failures) {
  // Content is matched against whitespace-normalised text. How *much* space an
  // extractor puts between two columns is its own business — pdf-parse pads the
  // gap out to five spaces — and asserting on the exact amount would fail a
  // document that is perfectly readable. That there is at least one space is
  // the thing worth pinning.
  //
  // Case is normalised for the same reason: the template sets section headings
  // in uppercase, so "Education & Training" arrives as "EDUCATION & TRAINING".
  // What is being checked here is that every word survived extraction with its
  // spaces intact, and letter case is not part of that question.
  //
  // A space before a closing bracket is normalised away on both sides. Charter's
  // "f" overhangs to the right, so the font kerns before a following ")" to stop
  // the glyphs colliding — and pdfjs-dist reads that kern as a space, extracting
  // "(5% effort relief)" as "(5% effort relief )". pdf-parse reads the same PDF
  // correctly, which is what identifies this as an extractor heuristic rather
  // than a defect in the document: it is triggered by the letter before the
  // bracket, not by the content ("effort)" is clean, "relief)" is not). No word
  // is split or run together, so keyword matching is unaffected, and asserting
  // on it would only pressure the fixture into avoiding the letter f.
  const norm = (s) => s.replace(/\s+/g, " ").replace(/\s+([)\]}])/g, "$1").toLowerCase();
  const flat = norm(text);
  // An array of alternatives passes if any one of them is present. Used for
  // rows whose halves may legitimately extract in either order — see gridRows.
  for (const needle of expected) {
    const alternatives = Array.isArray(needle) ? needle : [needle];
    if (!alternatives.some((a) => flat.includes(norm(a)))) {
      failures.push(`${label}: missing ${JSON.stringify(needle)}`);
    }
  }

  const split = text.match(/[a-z]{2,}-$/gm);
  if (split?.length) {
    failures.push(`${label}: ${split.length} word(s) split across lines, e.g. "${split[0]}"`);
  }

  const glued = (text.match(/[A-Za-z]{20,}/g) ?? []).filter(
    (t) => !corpus.includes(t.toLowerCase())
  );
  if (glued.length) {
    failures.push(`${label}: ${glued.length} run-together word(s), e.g. "${glued[0]}"`);
  }
}

// --- Main -------------------------------------------------------------------

async function main() {
  const engine = await findEngine();
  if (!engine) {
    console.error("Tectonic not found. Set TECTONIC_PATH or put tectonic on PATH.");
    process.exit(2);
  }

  // Imported through the built Next aliases would need a bundler; these two
  // modules are dependency-free enough to load via tsx-less dynamic import of
  // the compiled output. Simplest reliable route: ask tsx to do it.
  const { renderResumeLatex } = await import("../src/lib/resumeLatex.ts");
  const { SHAPE_ORDER, allowsPageTarget, orderSectionKeys, specFor } = await import(
    "../src/lib/documentShape.ts"
  );

  const dir = await mkdtemp(path.join(tmpdir(), "jobhunt-check-"));
  let failed = false;

  try {
    // Driven off SHAPE_ORDER rather than a list here, so adding a shape to the
    // catalogue without a fixture fails loudly in fixtureSections() instead of
    // going unchecked.
    for (const shape of SHAPE_ORDER) {
      const sections = fixtureSections(shape);
      const resume = {
        shape,
        sections,
        pageTarget: allowsPageTarget(shape) ? 2 : null,
        generatedAt: new Date().toISOString(),
      };

      const failures = [];

      // Band invariant: whatever order the model returns, the printed order must
      // be non-decreasing in band.
      const keys = orderSectionKeys(shape, [...sections].reverse().map((s) => s.key));
      const bands = keys.map((k) => specFor(shape, k).band);
      if (bands.some((b, i) => i > 0 && b < bands[i - 1])) {
        failures.push(`band order violated: ${keys.join(" > ")}`);
      }

      const tex = renderResumeLatex(resume, PROFILE);
      const texPath = path.join(dir, `${shape}.tex`);
      await writeFile(texPath, tex, "utf8");

      try {
        await run(
          engine,
          ["-X", "compile", "--untrusted", "-r", "0", "--keep-logs", "--outfmt", "pdf", "--outdir", dir, texPath],
          { timeout: 90_000, maxBuffer: 8 * 1024 * 1024 }
        );
      } catch {
        /* tectonic exit code is unreliable; the PDF's existence is the real test */
      }

      const log = await readFile(path.join(dir, `${shape}.log`), "utf8").catch(() => "");
      const errors = (log.match(/^!.*/gm) ?? []).length;
      const overfull = (log.match(/^Overfull/gm) ?? []).length;
      if (errors) failures.push(`${errors} TeX error(s): ${log.match(/^!.*/m)?.[0] ?? ""}`);
      if (overfull) failures.push(`${overfull} overfull box(es): ${log.match(/^Overfull.*/m)?.[0] ?? ""}`);

      const pdfPath = path.join(dir, `${shape}.pdf`);
      let pages = 0;
      try {
        const { texts, pages: n } = await extractAll(pdfPath);
        pages = n;
        // Rows whose two halves are separate positioned runs in the PDF, with
        // only glue between them. An extractor has to infer the space, and
        // pdf-parse infers nothing, so without this the document extracts as
        // "2015 - 2019Doctor of Medicine" and still passes every other check.
        //
        // A date and its heading are asserted in EITHER order. They share a
        // line, with the date ranged right (resumeLatex note 3), and which one
        // an extractor emits first is its own business: pdf-parse, pdfjs-dist
        // and pypdf all currently read heading-then-date. Pinning one order
        // would fail a document that is perfectly readable — what matters is
        // that the two are adjacent at all, and that there is a space between
        // them. A label and its values are still asserted left-to-right,
        // because those genuinely are two columns.
        const gridRows = [];
        for (const s of sections) {
          for (const e of s.entries) {
            const dates = [e.startDate, e.endDate].map((d) => d.trim()).filter(Boolean).join(" – ");
            if (dates) gridRows.push([`${dates} ${e.heading}`, `${e.heading} ${dates}`]);
          }
          for (const g of s.keywords.value) {
            if (g.label.trim() && g.items.length) gridRows.push(`${g.label} ${g.items.join(" · ")}`);
          }
        }

        // A bullet that opens with a bracket must still open with one. \item
        // takes an optional [label], so "[Immunophenotyping] of leukemia..."
        // renders as an item *labelled* "Immunophenotyping" unless the renderer
        // shields it — the brackets are eaten and the words move into the
        // marker's position. Nothing here noticed for as long as bullets
        // indented an inch and a third, because a label that far in still
        // landed on the page; the fixture has carried a bracketed bullet the
        // whole time. Assert the opening bracket survives, per shape.
        const bracketed = [];
        for (const s of sections) {
          for (const e of s.entries) {
            for (const b of e.bullets ?? []) {
              const v = (b.value ?? "").trim();
              if (v.startsWith("[") && v.includes("]")) {
                bracketed.push(v.slice(0, v.indexOf("]") + 1));
              }
            }
          }
        }

        const expected = [
          PROFILE.fullName,
          PROFILE.email,
          PROFILE.phone,
          // Asserted as displayed, not as stored: an identifier kind is printed
          // with its label ("NPI 1234567890") and a URL kind without its scheme.
          "linkedin.com/in/alex-moreno",
          "NPI 1234567890",
          ...sections.map((s) => specFor(shape, s.key)?.title).filter(Boolean),
          ...gridRows,
          ...bracketed,
        ];
        const corpus = JSON.stringify({ PROFILE, sections }).toLowerCase();
        for (const [label, text] of Object.entries(texts)) {
          checkText(label, text, expected, corpus, failures);
        }
      } catch (err) {
        failures.push(`no readable PDF: ${err.message}`);
      }

      if (failures.length) {
        failed = true;
        console.error(`FAIL  ${shape}  (${pages} pages)`);
        for (const f of failures) console.error(`      - ${f}`);
      } else {
        console.log(`ok    ${shape}  ${pages} pages, 0 errors, 0 overfull, 0 split words, all headings extractable`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
