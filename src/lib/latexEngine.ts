import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const run = promisify(execFile);

/**
 * Compiling LaTeX to PDF with Tectonic.
 *
 * Server-only: this spawns a process and touches the filesystem, so nothing
 * here may be imported from a client component.
 *
 * Tectonic rather than a full TeX distribution because it is a single
 * executable that fetches and caches only the packages a document actually
 * asks for. The first compile on a machine pulls its bundle and takes about a
 * minute; every one after that is local.
 */

const COMPILE_TIMEOUT_MS = 40_000;
/**
 * Longer than the local one, because it covers a cold start as well as a
 * compile: a container that scales to zero has to be booted by the first
 * request after an idle period, and on a free tier that is not fast.
 */
const REMOTE_TIMEOUT_MS = 75_000;
const TEX_NAME = "resume.tex";

export type CompileSuccess = {
  ok: true;
  pdf: Buffer;
  pages: number;
  /**
   * The SyncTeX log, uncompressed, or "" if the engine didn't write one.
   *
   * Empty is not a failure: it costs the preview nothing but click-to-locate,
   * so a compile is never rejected over it.
   */
  synctex: string;
};

export type CompileFailure = {
  ok: false;
  /** One-line summary for the banner. */
  message: string;
  /** The engine's own words, for the details pane. */
  log: string;
};

export type CompileResult = CompileSuccess | CompileFailure;

// --- Engine discovery -------------------------------------------------------

/**
 * Where to find tectonic, most explicit first.
 *
 * The PATH entry is second rather than first so a deliberate TECTONIC_PATH
 * always wins. The last is where the install instructions put it, checked
 * because a PATH edit doesn't reach an already-running dev server.
 */
function candidatePaths(): string[] {
  const out: string[] = [];
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

/**
 * A compile service to call instead of spawning anything.
 *
 * This is what makes the app deployable to a host that cannot run binaries.
 * A serverless function has no Tectonic, no way to install one, and a
 * read-only filesystem, so on Vercel the whole document half of the app was
 * dead: no preview, no PDF download, and — less visibly — no page fitting,
 * because the length pass measures a document by building it. It reported
 * "0 pages" and quietly trimmed nothing.
 *
 * Set LATEX_SERVICE_URL and every compile goes over HTTP to `service/`, which
 * is the same Tectonic in a container. Leave it unset and nothing changes:
 * the local binary is spawned exactly as before, which is what keeps a
 * developer's machine working with no configuration at all.
 */
const SERVICE_URL = process.env.LATEX_SERVICE_URL?.replace(/\/+$/, "") ?? "";

let cachedEngine: string | null | undefined;

/**
 * Where compiles will happen: a path to a binary, "remote" for the service, or
 * null when there is neither.
 *
 * The service is NOT pinged to answer this. The check runs on every visit to
 * the resume step, and a service that scales to zero would be woken by each
 * one — paying a cold start to answer a question whose answer is "yes, it is
 * configured". A misconfigured URL therefore reports available and fails at the
 * first real compile, with the service's own error rather than a guess.
 */
export async function findEngine(): Promise<string | null> {
  if (SERVICE_URL) return "remote";
  if (cachedEngine !== undefined) return cachedEngine;
  for (const candidate of candidatePaths()) {
    try {
      await run(candidate, ["--version"], { timeout: 10_000 });
      cachedEngine = candidate;
      return candidate;
    } catch {
      // Not here; try the next.
    }
  }
  cachedEngine = null;
  return null;
}

const REMOTE_HINT =
  " On a host that cannot run binaries — Vercel, Netlify, any serverless"
  + " platform — deploy service/ and set LATEX_SERVICE_URL to it instead. See DEPLOY.md.";

export const INSTALL_HINT =
  (process.platform === "win32"
    ? "Tectonic is not installed. Download tectonic.exe from github.com/tectonic-typesetting/tectonic/releases into %LOCALAPPDATA%\\Programs\\tectonic, or set TECTONIC_PATH to point at it."
    : "Tectonic is not installed. Install it (brew install tectonic, or cargo install tectonic) or set TECTONIC_PATH to point at the binary.") +
  REMOTE_HINT;

// --- Log parsing ------------------------------------------------------------

/**
 * The part of a TeX log worth showing.
 *
 * A failed run emits hundreds of lines of font and package chatter around a
 * handful that say what is actually wrong. TeX marks real errors with a line
 * starting "!", and the two lines after one carry the location, so those are
 * what get kept.
 */
function extractErrors(log: string): string {
  const lines = log.split(/\r?\n/);
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/^!/.test(lines[i]) && !/^error:/i.test(lines[i])) continue;
    kept.push(...lines.slice(i, i + 3).filter((l) => l.trim()));
    kept.push("");
    if (kept.length > 40) break;
  }

  if (kept.length) return kept.join("\n").trim();
  // No "!" anywhere: fall back to the tail, which is where tectonic's own
  // summary lands.
  return lines.filter((l) => l.trim()).slice(-12).join("\n");
}

function firstLine(log: string): string {
  const line = log
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /^!/.test(l) || /^error:/i.test(l));
  if (!line) return "The document did not compile.";
  return line.replace(/^!\s*/, "").replace(/^error:\s*/i, "");
}

// --- Page counting ----------------------------------------------------------

/**
 * How many pages the PDF has, so the UI can say "2 pages, target 1".
 *
 * Parsed properly rather than pattern-matched on the raw bytes. An earlier
 * version scanned for the page tree's `/Type /Pages … /Count n`, which never
 * matched anything: xdvipdfmx packs the object structure into a compressed
 * object stream, so those tokens simply aren't in the file. It silently
 * returned 1 for every document, and a two-page resume against a one-page
 * target reported no problem at all.
 *
 * pdf-parse is already a dependency of the upload path and already declared in
 * serverExternalPackages. `max: 1` stops it rendering text for pages we're not
 * going to read — the page count comes from the document, not the render.
 */
async function countPages(bytes: Buffer): Promise<number> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(bytes, { max: 1 });
    return parsed.numpages > 0 ? parsed.numpages : 1;
  } catch {
    // A page count is a nicety; never fail a good compile over it.
    return 1;
  }
}

// --- SyncTeX ----------------------------------------------------------------

/**
 * The SyncTeX log for the compile that just ran.
 *
 * Written gzipped next to the PDF and read out here, because the temp directory
 * is deleted the moment this function returns and the client has no way back to
 * it. Uncompressed on the server rather than in the browser: it is a few
 * kilobytes, and it keeps the client from needing a gzip implementation.
 *
 * Every failure is swallowed. Click-to-locate is a convenience layered on top
 * of a preview that works without it, and no part of it is worth failing a
 * good compile over.
 */
async function readSyncTex(dir: string): Promise<string> {
  try {
    const gz = await readFile(path.join(dir, "resume.synctex.gz"));
    return gunzipSync(gz).toString("utf8");
  } catch {
    try {
      // Some builds write it uncompressed.
      return await readFile(path.join(dir, "resume.synctex"), "utf8");
    } catch {
      return "";
    }
  }
}

// --- Compilation ------------------------------------------------------------

/**
 * Renders `tex` to a PDF.
 *
 * Runs in a throwaway directory so concurrent compiles — a debounced editor
 * fires them faster than they finish — cannot read each other's intermediate
 * files or race on the output.
 *
 * `--untrusted` disables \write18 and friends. The document is part
 * model-written and part hand-edited, and neither is a reason to let a resume
 * shell out.
 *
 * `-r 0` runs a single pass. A resume has no table of contents and no
 * cross-references, so the second pass only ever reproduces the first, and
 * skipping it halves the time to preview.
 */
/**
 * The same compile, over HTTP.
 *
 * The service returns the two artefacts and the log, and nothing else: page
 * counting and error formatting stay here, so a remote compile and a local one
 * produce the identical CompileResult and everything downstream — the preview,
 * the page-fitting search, the error pane — cannot tell which it got.
 *
 * The timeout is generous on purpose. A container that scales to zero is asleep
 * between applications, and the first compile after that pays for the wake-up
 * as well as the typesetting.
 */
async function compileRemote(tex: string): Promise<CompileResult> {
  try {
    const response = await fetch(`${SERVICE_URL}/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LATEX_SERVICE_TOKEN
          ? { Authorization: `Bearer ${process.env.LATEX_SERVICE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ tex }),
      signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
    });

    const data = (await response.json().catch(() => null)) as {
      pdf?: string;
      synctex?: string;
      message?: string;
      log?: string;
    } | null;

    if (!data) {
      return {
        ok: false,
        message: `The compile service answered ${response.status} with something that wasn't JSON.`,
        log: "",
      };
    }
    // A document that doesn't typeset is a 422 carrying the engine's own words,
    // and is reported as what it is: a problem with the document, not the
    // service. Anything else is the service itself failing.
    if (!data.pdf) {
      return {
        ok: false,
        message: data.message ?? `The compile service answered ${response.status}.`,
        log: data.log ?? "",
      };
    }

    const pdf = Buffer.from(data.pdf, "base64");
    return { ok: true, pdf, pages: await countPages(pdf), synctex: data.synctex ?? "" };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      message: timedOut
        ? `The compile service did not answer within ${REMOTE_TIMEOUT_MS / 1000}s.`
        : "Could not reach the compile service.",
      log: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function compileLatex(tex: string): Promise<CompileResult> {
  const engine = await findEngine();
  if (!engine) return { ok: false, message: INSTALL_HINT, log: "" };
  if (engine === "remote") return compileRemote(tex);

  const dir = await mkdtemp(path.join(tmpdir(), "jobhunt-tex-"));
  try {
    const texPath = path.join(dir, TEX_NAME);
    await writeFile(texPath, tex, "utf8");

    let stderr = "";
    try {
      const result = await run(
        engine,
        [
          "-X", "compile",
          "--untrusted",
          "-r", "0",
          "--keep-logs",
          // Records which source line produced each box on the page, which is
          // what lets a click on the preview find its line in the editor. It
          // does not need --keep-intermediates: the .synctex.gz is an output.
          "--synctex",
          "--outfmt", "pdf",
          "--outdir", dir,
          texPath,
        ],
        { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
      );
      stderr = result.stderr ?? "";
    } catch (err) {
      const e = err as { stderr?: string; killed?: boolean };
      if (e.killed) {
        return {
          ok: false,
          message: `Compile timed out after ${COMPILE_TIMEOUT_MS / 1000}s.`,
          log: e.stderr ?? "",
        };
      }
      stderr = e.stderr ?? String(err);
    }

    // Tectonic reports some failures through the exit code and others by
    // simply not writing a PDF, so the file's existence is the real test.
    let pdf: Buffer;
    try {
      pdf = await readFile(path.join(dir, "resume.pdf"));
    } catch {
      const log = await readFile(path.join(dir, "resume.log"), "utf8").catch(() => "");
      const detail = extractErrors(log || stderr);
      return { ok: false, message: firstLine(log || stderr), log: detail };
    }

    return {
      ok: true,
      pdf,
      pages: await countPages(pdf),
      synctex: await readSyncTex(dir),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
