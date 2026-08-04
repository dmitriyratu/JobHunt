#!/usr/bin/env node
/**
 * Turns the commits since the last release into a What's new entry.
 *
 * Runs headless Claude Code (`claude -p`) rather than the OpenAI client the app
 * uses at runtime: this is a developer-machine tool, and the CLI authenticates
 * with the Claude Code session you are already signed into, so generating notes
 * doesn't spend the OpenAI credits reserved for tailoring resumes.
 *
 *   node scripts/release-notes.mjs            # write the files, leave them staged for you
 *   node scripts/release-notes.mjs --commit   # write and commit (what the hook does)
 *   node scripts/release-notes.mjs --dry-run  # print what it would write, touch nothing
 *
 * Not every commit earns an entry. The model is asked first whether anything
 * changed that a person using the app would notice; a refactor answers no and
 * this exits without bumping the version or writing a word.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASES_PATH = join(ROOT, "src", "data", "releases.json");
const PACKAGE_PATH = join(ROOT, "package.json");

/** Marks the commits this script makes, so they never become input to itself. */
const COMMIT_MARKER = "[release-notes]";

/** Sonnet, not Opus: this is a summarisation task over a handful of commits,
    and the hook runs on every push to main. Override with RELEASE_NOTES_MODEL. */
const MODEL = process.env.RELEASE_NOTES_MODEL || "sonnet";

/** How much diff to show the model. The stat block always goes; this caps the
    line-level detail so a large refactor doesn't turn one commit into a novel. */
const DIFF_CHAR_BUDGET = Number(process.env.RELEASE_NOTES_DIFF_BUDGET || 20000);

const args = new Set(process.argv.slice(2));
const shouldCommit = args.has("--commit");
const dryRun = args.has("--dry-run");
const allowMajor = args.has("--allow-major") || process.env.RELEASE_NOTES_ALLOW_MAJOR === "1";

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function note(message) {
  process.stdout.write(`release-notes: ${message}\n`);
}

/**
 * `claude.exe` is a real executable, so spawnSync finds it without a shell on
 * Windows — but a PATH shim on another machine may not resolve the same way,
 * hence the one retry through a shell before giving up.
 */
function runClaude(claudeArgs, stdin) {
  const options = {
    cwd: ROOT,
    input: stdin,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    // Inherited so a failure explains itself in the terminal instead of vanishing.
    stdio: ["pipe", "pipe", "inherit"],
  };
  let result = spawnSync("claude", claudeArgs, options);
  if (result.error?.code === "ENOENT") {
    result = spawnSync("claude", claudeArgs, { ...options, shell: true });
  }
  return result;
}

function bumpVersion(current, kind) {
  const parts = current.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`package.json version "${current}" is not a plain x.y.z`);
  }
  const [major, minor, patch] = parts;
  if (kind === "major") {
    // Below 1.0 a "major" change is still pre-release. Bumping the minor keeps
    // the model from declaring 1.0 on the app's behalf; --allow-major overrides.
    if (major === 0 && !allowMajor) return `0.${minor + 1}.0`;
    return `${major + 1}.0.0`;
  }
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The commits to describe: everything after the last released commit, with
    merges and this script's own commits left out. */
function collectCommitRange(releases) {
  const lastCommit = releases.find((entry) => entry.commit)?.commit;
  let base = null;
  if (lastCommit) {
    try {
      git("cat-file", "-e", `${lastCommit}^{commit}`);
      base = lastCommit;
    } catch {
      note(`last released commit ${lastCommit.slice(0, 8)} is not in this repo — using HEAD~1`);
    }
  }
  if (!base) {
    try {
      base = git("rev-parse", "HEAD~1");
    } catch {
      return null; // Root commit; nothing to compare against.
    }
  }
  return `${base}..HEAD`;
}

function gatherContext(range) {
  const logArgs = [
    "log",
    "--no-merges",
    "--grep",
    COMMIT_MARKER,
    "--invert-grep",
    "--fixed-strings",
    "--format=- %s%n%b",
    range,
  ];
  const log = git(...logArgs);
  if (!log) return null;

  // Lockfiles and the notes file itself say nothing about what a person sees.
  const pathspec = [
    "--",
    ".",
    ":(exclude)package-lock.json",
    ":(exclude)src/data/releases.json",
    ":(exclude)public",
  ];
  const stat = git("diff", "--stat", range, ...pathspec);
  let diff = git("diff", range, ...pathspec);
  let truncated = false;
  if (diff.length > DIFF_CHAR_BUDGET) {
    diff = diff.slice(0, DIFF_CHAR_BUDGET);
    truncated = true;
  }

  return { log, stat, diff, truncated };
}

const SYSTEM_PROMPT = `You write release notes for JobHunt, a web app that helps a job seeker tailor
their resume and cover letter to a specific posting.

Your reader is that job seeker. They do not read code, do not know the
codebase, and do not care what a component or a module is. Write about what
they can now do, or what stopped going wrong for them.

Rules:
- Plain language. No jargon, no file names, no component names, no commit
  message phrasing like "refactor", "implement", "enhance".
- Lead with the value to them, not the mechanism.
- Be specific and honest. Never invent a change that is not in the diff.
- If the commits only touch internals a person could not notice — refactors,
  types, tests, build config, dependency bumps, code comments — then set
  userFacing to false and leave every other field empty. That is a normal and
  expected answer.
- Choose the version bump by user impact: major for a change that breaks or
  replaces how something already worked, minor for new capability, patch for a
  fix or polish.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    userFacing: {
      type: "boolean",
      description: "True only if someone using the app would notice this change.",
    },
    bump: { type: "string", enum: ["major", "minor", "patch"] },
    headline: {
      type: "string",
      description: "One short sentence, sentence case, no trailing period. The value, not the mechanism.",
    },
    summary: {
      type: "string",
      description: "One or two sentences expanding the headline, addressed to the reader as 'you'.",
    },
    changes: {
      type: "array",
      description: "One entry per distinct thing the reader would notice. Empty if there is only the headline.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
        },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["userFacing", "bump", "headline", "summary", "changes"],
  additionalProperties: false,
};

function describeChanges(context) {
  const stdin = [
    "Commits since the last release:",
    context.log,
    "",
    "Files changed:",
    context.stat || "(none)",
    "",
    context.truncated ? "Diff (truncated):" : "Diff:",
    context.diff || "(empty)",
  ].join("\n");

  const claudeArgs = [
    "-p",
    "--output-format",
    "json",
    "--model",
    MODEL,
    "--system-prompt",
    SYSTEM_PROMPT,
    // Nothing here needs the filesystem or the web, and every tool definition
    // left in costs tokens on a call that runs after every commit.
    "--disallowed-tools",
    "Bash Read Write Edit Glob Grep WebFetch WebSearch Task NotebookEdit TodoWrite",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--json-schema",
    JSON.stringify(OUTPUT_SCHEMA),
    "Write the release note for these commits. Decide first whether any of this is user-facing at all.",
  ];

  const result = runClaude(claudeArgs, stdin);
  if (result.error) throw new Error(`could not run the claude CLI: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`claude exited with status ${result.status}`);

  let envelope;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    throw new Error("claude did not return JSON");
  }
  if (envelope.is_error) throw new Error(`claude reported an error: ${envelope.result ?? "unknown"}`);

  const output = envelope.structured_output;
  if (!output || typeof output !== "object") {
    throw new Error("claude returned no structured output");
  }
  if (typeof envelope.total_cost_usd === "number") {
    note(`model ${MODEL}, ${envelope.total_cost_usd.toFixed(4)} USD equivalent`);
  }
  return output;
}

function main() {
  // The hook sets this while committing the notes, so the commit it creates
  // cannot start the whole thing over.
  if (process.env.RELEASE_NOTES_SKIP === "1") {
    note("skipped (RELEASE_NOTES_SKIP=1)");
    return;
  }

  const releases = JSON.parse(readFileSync(RELEASES_PATH, "utf8"));
  const pkg = JSON.parse(readFileSync(PACKAGE_PATH, "utf8"));

  const range = collectCommitRange(releases);
  if (!range) {
    note("no earlier commit to compare against — nothing to do");
    return;
  }

  const context = gatherContext(range);
  if (!context) {
    note(`no new commits in ${range}`);
    return;
  }

  const head = git("rev-parse", "HEAD");
  const described = describeChanges(context);

  if (!described.userFacing) {
    note("nothing user-facing in these commits — no entry written");
    return;
  }

  const version = bumpVersion(pkg.version, described.bump);
  const entry = {
    version,
    // Local date, not UTC: the release is dated the day you shipped it.
    date: new Date().toLocaleDateString("en-CA"),
    headline: described.headline,
    summary: described.summary,
    changes: Array.isArray(described.changes) ? described.changes : [],
    commit: head,
  };

  if (dryRun) {
    note(`would write version ${version} (${pkg.version} -> ${version}, ${described.bump})`);
    process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
    return;
  }

  pkg.version = version;
  writeFileSync(PACKAGE_PATH, `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(RELEASES_PATH, `${JSON.stringify([entry, ...releases], null, 2)}\n`);
  note(`wrote version ${version}: ${entry.headline}`);

  if (!shouldCommit) {
    note("files updated — commit them yourself, or pass --commit next time");
    return;
  }

  git("add", "--", RELEASES_PATH, PACKAGE_PATH);
  execFileSync("git", ["commit", "-m", `${COMMIT_MARKER} v${version} — ${entry.headline}`], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, RELEASE_NOTES_SKIP: "1" },
  });
  note(`committed v${version}`);
}

try {
  main();
} catch (error) {
  // Never fail the commit that triggered this. The range is derived from the
  // last released commit, so whatever was missed is picked up on the next run.
  note(`skipped — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(0);
}
