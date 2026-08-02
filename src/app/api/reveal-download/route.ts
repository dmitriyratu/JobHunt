import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Opens the folder a saved file went into.
 *
 * The pane prints the full path of what it just wrote, and the obvious thing to
 * do with a path is click it. A page cannot: Chrome blocks navigation to a
 * file:// URL from an http one, so the link every user tries is the one thing
 * the browser will never allow. The path was therefore something to select and
 * paste, which is a worse version of what the app already knows.
 *
 * Same reasoning as /api/save-download — JobHunt's server runs on the machine
 * the files are on, so it can do what the page cannot — and the same caution.
 * This hands a path to the shell, so:
 *
 *   - the path must resolve inside the downloads root, which is the only place
 *     this app ever writes;
 *   - it must already exist, so this can only reveal something, never create it;
 *   - the command is run with execFile and an argument array, never a shell
 *     string, so a path containing a quote or a semicolon is an argument and
 *     cannot become a command.
 *
 * It opens a folder; it never launches the document. Running a file on the
 * user's behalf is a different and much larger promise than showing them where
 * it went — and the containment check is the reason this one is safe to make.
 */

function downloadsRoot(): string {
  return process.env.JOBHUNT_DOWNLOAD_DIR?.trim() || path.join(homedir(), "Downloads");
}

/**
 * The file manager command for this platform, opening the containing folder.
 *
 * This selected the file instead — "explorer /select,<path>", "open -R" — which
 * is the more precise gesture and the worse one in practice. Selecting reuses
 * an Explorer window that is already showing that folder, and a reused window
 * does not come to the front: it flashes in the taskbar behind the browser, so
 * the click reads as a click that did nothing and gets made again. Opening the
 * folder is the thing the link says it does anyway.
 */
function openCommand(target: string): { file: string; args: string[] } {
  const folder = path.dirname(target);
  switch (process.platform) {
    case "win32":
      return { file: "explorer.exe", args: [folder] };
    case "darwin":
      return { file: "open", args: [folder] };
    default:
      return { file: "xdg-open", args: [folder] };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { path: raw } = (await request.json()) as { path?: unknown };
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json({ error: "No path given." }, { status: 400 });
    }

    const root = path.resolve(downloadsRoot());
    const target = path.resolve(raw);
    if (!target.startsWith(root + path.sep)) {
      return NextResponse.json(
        { error: "Refused to open anything outside Downloads." },
        { status: 400 }
      );
    }

    // A saved file that has since been moved or deleted. Reporting it beats
    // opening a file manager on nothing and looking broken.
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) {
      return NextResponse.json({ error: "That file is no longer there." }, { status: 404 });
    }

    const { file, args } = openCommand(target);
    await new Promise<void>((resolve, reject) => {
      execFile(file, args, (error) => {
        // explorer.exe exits 1 on success — it has done this for twenty years
        // and is not going to stop. Treating its exit code as a result would
        // report every successful reveal as a failure.
        if (error && process.platform !== "win32") reject(error);
        else resolve();
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the folder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
