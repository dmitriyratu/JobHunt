/**
 * Tectonic behind an HTTP endpoint.
 *
 * The app's document half needs a LaTeX engine, and the platforms people
 * actually deploy Next.js to cannot run one: a serverless function has no
 * Tectonic, no way to install it, and a read-only filesystem. This is the
 * smallest thing that fixes that — the same binary the app spawns locally, in a
 * container, reachable over HTTP. See DEPLOY.md.
 *
 * Deliberately dumb. It runs the engine and hands back the two files it
 * produces; page counting, log parsing and error wording all stay in the app,
 * in the one place that already does them, so a remote compile and a local one
 * are indistinguishable to everything downstream.
 *
 * No dependencies, so the image is Node plus a binary and the whole thing is
 * auditable in one screen.
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const run = promisify(execFile);

const PORT = Number(process.env.PORT ?? 8080);
const ENGINE = process.env.TECTONIC_PATH ?? "tectonic";
/** Shared secret. Unset means open, which is only sane behind a private network. */
const TOKEN = process.env.LATEX_SERVICE_TOKEN ?? "";
/** Matches the app's own guard: a two-page resume is around 6KB. */
const MAX_TEX_BYTES = 400_000;
const COMPILE_TIMEOUT_MS = 40_000;

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
};

/**
 * Written gzipped next to the PDF. Carried back because it is what lets a click
 * on the preview find its line in the editor, and it is deleted with the temp
 * directory the moment this returns — there is nothing to come back for.
 * Every failure is swallowed: click-to-locate is a convenience on top of a
 * preview that works without it.
 */
async function readSyncTex(dir) {
  try {
    return gunzipSync(await readFile(path.join(dir, "resume.synctex.gz"))).toString("utf8");
  } catch {
    try {
      return await readFile(path.join(dir, "resume.synctex"), "utf8");
    } catch {
      return "";
    }
  }
}

async function compile(tex) {
  const dir = await mkdtemp(path.join(tmpdir(), "jobhunt-tex-"));
  try {
    const texPath = path.join(dir, "resume.tex");
    await writeFile(texPath, tex, "utf8");

    let stderr = "";
    try {
      // The same flags the app uses locally. --untrusted disables \write18: the
      // document is part model-written and part hand-edited, and neither is a
      // reason to let a resume shell out. -r 0 is a single pass, which a
      // document with no cross-references does not need a second of.
      const result = await run(
        ENGINE,
        [
          "-X", "compile",
          "--untrusted",
          "-r", "0",
          "--keep-logs",
          "--synctex",
          "--outfmt", "pdf",
          "--outdir", dir,
          texPath,
        ],
        { timeout: COMPILE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }
      );
      stderr = result.stderr ?? "";
    } catch (err) {
      if (err?.killed) {
        return { status: 422, body: { message: "The document timed out while compiling.", log: err.stderr ?? "" } };
      }
      stderr = err?.stderr ?? String(err);
    }

    // Tectonic reports some failures through the exit code and others by simply
    // not writing a PDF, so the file's existence is the real test.
    let pdf;
    try {
      pdf = await readFile(path.join(dir, "resume.pdf"));
    } catch {
      const log = await readFile(path.join(dir, "resume.log"), "utf8").catch(() => "");
      // 422, not 500: the service is fine, the document is not. The app tells
      // the two apart on exactly this.
      return { status: 422, body: { message: "The document did not compile.", log: log || stderr } };
    }

    return {
      status: 200,
      body: { pdf: pdf.toString("base64"), synctex: await readSyncTex(dir) },
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer((req, res) => {
  // Liveness, and the one route that must never wait on the engine.
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST" || !req.url?.startsWith("/compile")) {
    return json(res, 404, { message: "POST /compile" });
  }

  if (TOKEN) {
    const offered = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    // Length-independent comparison is not worth the ceremony here — the secret
    // guards CPU, not data — but an absent header must never pass.
    if (!offered || offered !== TOKEN) {
      return json(res, 401, {
        message: "The compile service rejected the request: LATEX_SERVICE_TOKEN does not match.",
      });
    }
  }

  let body = "";
  let tooLarge = false;
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_TEX_BYTES * 2 && !tooLarge) {
      tooLarge = true;
      json(res, 413, { message: "That document is too large to compile." });
      req.destroy();
    }
  });

  req.on("end", () => {
    if (tooLarge) return;
    let tex;
    try {
      tex = JSON.parse(body)?.tex;
    } catch {
      return json(res, 400, { message: "Body must be JSON." });
    }
    if (typeof tex !== "string" || !tex.trim()) {
      return json(res, 400, { message: "No LaTeX source provided." });
    }
    if (tex.length > MAX_TEX_BYTES) {
      return json(res, 413, { message: "That document is too large to compile." });
    }

    compile(tex)
      .then(({ status, body: payload }) => json(res, status, payload))
      // Never leak a stack to the caller, and never leave a request hanging.
      .catch((err) => json(res, 500, { message: "The compile service failed.", log: String(err) }));
  });
});

server.listen(PORT, () => {
  console.log(`latex service listening on ${PORT}, engine ${ENGINE}`);
});
