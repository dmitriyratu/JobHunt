/**
 * Puts a Tectonic and a primed TeX cache inside the deployment bundle.
 *
 * Runs at build time, on Linux only. The app's own machine already has a
 * Tectonic on PATH and doesn't want a second one, so on Windows and macOS this
 * exits without doing anything.
 *
 * Why this exists: a serverless function has no package manager, no Tectonic,
 * and a filesystem it cannot write to. The previous answer was a container
 * behind an HTTP call, which works but is a second thing to deploy, pay for and
 * keep alive. The binary is 26MB and the cache for this app's preamble is 55MB
 * — together comfortably inside the 250MB a function is allowed — so the whole
 * engine can simply travel with the code and be spawned in-process.
 *
 * Two artifacts land in vendor/tectonic:
 *
 *   bin/tectonic  the statically-linked musl build, which has no shared-library
 *                 dependencies and so runs on the function's image as-is.
 *
 *   cache/        every TeX file the real preamble asks for. Tectonic fetches
 *                 these on first use and caches them; without this step the
 *                 first compile after each deploy would try to pull them at
 *                 runtime, against a read-only filesystem, and fail.
 *
 * Both are gitignored: they are build output, and 81MB of it.
 */

import { execFile } from "node:child_process";
import { access, chmod, cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Pinned, and pinned to match what a developer installs locally. The cache
 * carries a format file the engine dumped, so an engine and a cache from
 * different versions are not guaranteed to understand each other.
 */
const VERSION = process.env.TECTONIC_VERSION ?? "0.17.0";
const ASSET = `tectonic-${VERSION}-x86_64-unknown-linux-musl.tar.gz`;
const URL = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${VERSION}/${ASSET}`;

const ROOT = process.cwd();
const VENDOR = path.join(ROOT, "vendor", "tectonic");
const BIN = path.join(VENDOR, "bin", "tectonic");
const CACHE = path.join(VENDOR, "cache");
/**
 * The same document the container build warms with. Kept in one place rather
 * than copied here, because it carries a preamble that has to track
 * preambleFor() in src/lib/resumeLatex.ts and two of those would drift.
 */
const WARM_TEX = path.join(ROOT, "service", "warm.tex");

const exists = (p) => access(p).then(() => true, () => false);

async function main() {
  // The one machine this must not touch is the one someone is developing on.
  // Vercel builds on Linux; Windows and macOS keep using the Tectonic on PATH.
  if (process.platform !== "linux" && !process.env.TECTONIC_BUNDLE_FORCE) {
    console.log(`[tectonic] ${process.platform}: skipping bundle, local engine will be used.`);
    return;
  }

  await mkdir(path.dirname(BIN), { recursive: true });

  if (await exists(BIN)) {
    console.log("[tectonic] binary already present.");
  } else {
    console.log(`[tectonic] downloading ${ASSET}`);
    const response = await fetch(URL);
    if (!response.ok) {
      throw new Error(`Downloading Tectonic ${VERSION} failed: ${response.status}`);
    }
    const staging = await mkdtemp(path.join(tmpdir(), "tectonic-dl-"));
    try {
      const tarball = path.join(staging, ASSET);
      await writeFile(tarball, Buffer.from(await response.arrayBuffer()));
      // Node has no tar reader and this only ever runs on Linux, where one is
      // always present.
      await run("tar", ["xzf", tarball, "-C", staging, "tectonic"]);
      await cp(path.join(staging, "tectonic"), BIN);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  await chmod(BIN, 0o755);
  const { stdout } = await run(BIN, ["--version"]);
  console.log(`[tectonic] ${stdout.trim()}`);

  // A cache with anything in it is a cache that was warmed by a previous run of
  // this script; only an empty or missing one is worth the download again.
  const warmed = await readdir(CACHE).then((e) => e.length > 0, () => false);
  if (warmed) {
    console.log("[tectonic] cache already warm.");
    return;
  }

  console.log("[tectonic] warming the bundle cache…");
  await mkdir(CACHE, { recursive: true });
  const work = await mkdtemp(path.join(tmpdir(), "tectonic-warm-"));
  try {
    await cp(WARM_TEX, path.join(work, "warm.tex"));
    await run(
      BIN,
      ["-X", "compile", "--untrusted", "-r", "0", "--synctex", "--outfmt", "pdf", "warm.tex"],
      { cwd: work, env: { ...process.env, TECTONIC_CACHE_DIR: CACHE }, timeout: 300_000 }
    );
    // The PDF is thrown away — the download was the point — but its absence
    // means the cache is incomplete, and that only shows up as a failed compile
    // on the deployed site.
    if (!(await exists(path.join(work, "warm.pdf")))) {
      throw new Error("The warm-up document did not produce a PDF; the cache is not usable.");
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  console.log("[tectonic] cache warmed.");
}

main().catch((error) => {
  console.error(`[tectonic] ${error.message}`);
  process.exit(1);
});
