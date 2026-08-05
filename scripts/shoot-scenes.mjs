#!/usr/bin/env node
/**
 * Photographs the scenes in `src/fixtures/scenes.json` for What's new.
 *
 *   node scripts/shoot-scenes.mjs                       # every scene, current version
 *   node scripts/shoot-scenes.mjs --scene=match-report  # just one
 *   node scripts/shoot-scenes.mjs --version=0.4.0       # write under a given version
 *   node scripts/shoot-scenes.mjs --list                # print the manifest, shoot nothing
 *
 * Output lands in `public/releases/<version>/<scene>-<theme>.png`, one file per
 * theme, because a light screenshot inside a dark modal reads as a rendering
 * bug. The modal picks the matching one.
 *
 * Shots are versioned rather than overwritten. A release note is a record of
 * what the app looked like when that note was written, so v0.3.0's picture must
 * keep showing v0.3.0's UI after the component moves on. This costs a little
 * disk and buys a history that doesn't quietly rewrite itself.
 *
 * Playwright is an optional dependency here on purpose: without it this exits
 * non-zero with a one-line explanation and the release note is written without
 * a picture. Notes are the product; pictures are a bonus that must never be
 * able to block a commit.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "src", "fixtures", "scenes.json");
const PACKAGE_PATH = join(ROOT, "package.json");

const THEMES = ["light", "dark"];

/**
 * The project's own dev port, deliberately — not a private one.
 *
 * A second `next dev` on another port is not isolated from the first: both
 * write the same `.next` directory, and they corrupt each other's manifests
 * within a request or two. The first version of this script used 3031 to "stay
 * out of the way" and instead broke whichever server was already running.
 *
 * So it shares. If `npm run dev` is up, this reuses it and takes a couple of
 * seconds; if nothing is listening, it starts one and stops it afterwards.
 */
const DEFAULT_PORT = 3001;

/** 2 makes the PNG twice the CSS size, which is what a modern display wants.
    The modal renders it at its CSS width, so this is sharpness, not scale. */
const DEVICE_SCALE = 2;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    return [key, value];
  }),
);

function note(message) {
  process.stdout.write(`shoot-scenes: ${message}\n`);
}

/**
 * Stops the dev server, and on Windows everything it started.
 *
 * `next dev` is reached through `npx`, so the child here is a shell that spawns
 * node, which spawns the compiler. `child.kill()` reaps only the shell: the
 * server keeps the port, and the next run finds 3031 occupied by something it
 * cannot see and hangs waiting for a page that will never compile. `taskkill /T`
 * takes the tree. POSIX signals propagate normally, so this is win32-only.
 */
function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

function fail(message) {
  process.stderr.write(`shoot-scenes: ${message}\n`);
  process.exit(1);
}

const scenes = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

if (args.has("list")) {
  process.stdout.write(`${JSON.stringify(scenes, null, 2)}\n`);
  process.exit(0);
}

const only = args.get("scene");
const selected = only ? scenes.filter((scene) => scene.id === only) : scenes;
if (only && selected.length === 0) {
  fail(`no scene called "${only}" — known: ${scenes.map((s) => s.id).join(", ")}`);
}

const version = args.get("version") || JSON.parse(readFileSync(PACKAGE_PATH, "utf8")).version;
const port = Number(args.get("port") || DEFAULT_PORT);
const base = `http://127.0.0.1:${port}`;

/**
 * Imported rather than required at the top so the "not installed" case can say
 * something useful instead of throwing a module-resolution stack.
 */
async function loadPlaywright() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    fail("playwright is not installed — run: npm i -D playwright && npx playwright install chromium");
  }
}

async function isUp() {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Reuses a server already listening on the port, otherwise starts one and
 * remembers to stop it. Reuse is what makes this fast to iterate on by hand:
 * leave `next dev -p 3031` running and each run is a couple of seconds.
 */
async function ensureServer() {
  if (await isUp()) {
    note(`using the server already on ${port}`);
    return null;
  }

  note(`starting next dev on ${port}`);
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: ROOT,
    stdio: "ignore",
    shell: process.platform === "win32",
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`next dev exited early with code ${child.exitCode}`);
    if (await isUp()) return child;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  stopServer(child);
  fail("next dev did not come up within 90s");
}

async function shoot(browser, scene, theme, outDir) {
  const context = await browser.newContext({
    viewport: { width: scene.width + 120, height: 1200 },
    deviceScaleFactor: DEVICE_SCALE,
    colorScheme: theme,
    // The app reads its theme from localStorage before first paint, so setting
    // the same key it uses beats any override: the page comes up in the right
    // theme rather than flipping into it after hydration.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: base,
          localStorage: [{ name: "jobhunt-theme", value: theme }],
        },
      ],
    },
  });

  const page = await context.newPage();
  await page.goto(`${base}/dev/showcase/${scene.id}`, { waitUntil: "networkidle" });

  const stage = page.locator("#scene");
  await stage.waitFor({ state: "visible", timeout: 30_000 });

  for (const name of scene.click ?? []) {
    await page.getByRole("button", { name }).click();
  }

  // Fonts decide the height of everything, and the app loads Inter over the
  // network. Shooting before it lands photographs the fallback face.
  await page.evaluate(() => document.fonts.ready);
  // Outcome pills and cards animate on toggle; this is longer than the 180ms
  // the stylesheet uses, so nothing is caught mid-transition.
  await page.waitForTimeout(400);

  const file = join(outDir, `${scene.id}-${theme}.png`);
  await stage.screenshot({ path: file });
  await context.close();
  return file;
}

async function main() {
  const chromium = await loadPlaywright();
  const outDir = join(ROOT, "public", "releases", version);
  mkdirSync(outDir, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch();

  try {
    for (const scene of selected) {
      for (const theme of THEMES) {
        const file = await shoot(browser, scene, theme, outDir);
        note(`wrote ${file.slice(ROOT.length + 1).replace(/\\/g, "/")}`);
      }
    }
  } finally {
    await browser.close();
    stopServer(server);
  }

  note(`done — ${selected.length} scene(s) at version ${version}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
