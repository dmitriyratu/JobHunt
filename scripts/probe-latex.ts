/**
 * Checks the two things that decide whether the deployed site can typeset.
 *
 * 1. A document built from the real preamble compiles, on one page, with a
 *    SyncTeX map — and a broken one fails with something readable.
 *
 * 2. Every package the preamble loads is also loaded by service/warm.tex.
 *
 * The second is the one worth running. warm.tex exists to be compiled at build
 * time for the side effect of filling Tectonic's cache, and that cache ships
 * read-only inside the Vercel function — so a package the warm-up never fetched
 * cannot be fetched at runtime either. A \usepackage added to preambleFor()
 * and not to warm.tex compiles perfectly here, where the cache is writable, and
 * fails on the deployed site. Nothing else in the repo would catch it.
 *
 *   npm run check:latex
 */

import { readFileSync } from "node:fs";
import { compileLatex, findEngine } from "@/lib/latexEngine";

const PREAMBLE_SOURCE = "src/lib/resumeLatex.ts";
const WARM = "service/warm.tex";

/**
 * Package names, ignoring options. `\usepackage[scaled=0.96]{FiraSans}` and
 * `\usepackage{FiraSans}` warm the same files, so an option that differs
 * between the two is not drift worth failing over — a missing package is.
 */
function packagesIn(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    for (const name of match[1].split(",")) {
      const trimmed = name.trim();
      // Skips the interpolations that carry a value rather than a name.
      if (trimmed && !trimmed.includes("$")) names.add(trimmed);
    }
  }
  return names;
}

async function main() {
  const failures: string[] = [];

  const wanted = packagesIn(readFileSync(PREAMBLE_SOURCE, "utf8"));
  const warmed = packagesIn(readFileSync(WARM, "utf8"));
  const missing = [...wanted].filter((p) => !warmed.has(p)).sort();

  console.log(`preamble loads ${wanted.size} packages; warm.tex covers ${warmed.size}`);
  if (missing.length) {
    failures.push(
      `service/warm.tex is missing ${missing.length} package(s) the preamble loads: ${missing.join(", ")}.`
        + " Add them to warm.tex, or the deployed site cannot compile."
    );
  }

  const engine = await findEngine();
  console.log("engine:", engine ?? "none");
  if (!engine) {
    console.error("No engine, so the compile half of this check was skipped.");
    if (failures.length) {
      failures.forEach((f) => console.error("FAIL:", f));
      process.exit(1);
    }
    process.exit(0);
  }

  const preamble = readFileSync(WARM, "utf8").replace(/\\end\{document\}[\s\S]*$/, "");
  const result = await compileLatex(
    `${preamble}\nA second paragraph, so the page has some prose on it.\n\\end{document}\n`
  );

  if (!result.ok) {
    failures.push(`the warm document did not compile: ${result.message}`);
  } else {
    console.log(
      `pdf ${result.pdf.length} bytes · ${result.pages} page(s) · synctex ${result.synctex.length} chars`
    );
    if (result.pdf.subarray(0, 5).toString() !== "%PDF-") failures.push("output is not a PDF");
    if (result.pages !== 1) failures.push(`expected 1 page, got ${result.pages}`);
    // Not fatal to a preview, but it is the whole of click-to-locate, and it
    // going missing is exactly the kind of thing nobody notices for a month.
    if (!result.synctex.length) failures.push("no SyncTeX map; click-to-locate would be dead");
  }

  const broken = await compileLatex(
    "\\documentclass{article}\\begin{document}\\undefinedcommand\\end{document}"
  );
  if (broken.ok) failures.push("a document with an undefined command compiled anyway");
  else console.log("broken document reports:", broken.message);

  if (failures.length) {
    failures.forEach((f) => console.error("FAIL:", f));
    process.exit(1);
  }
  console.log("OK");
}

void main();
