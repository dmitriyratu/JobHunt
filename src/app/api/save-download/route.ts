import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_EXTENSIONS, sanitizeSegment } from "@/lib/filePaths";

export const runtime = "nodejs";

/**
 * Writes a generated file into Downloads, under a folder per company and role.
 *
 * A page cannot do this itself. Chrome strips path separators out of a download
 * filename, so "Acme/Engineer/resume.pdf" lands as one mangled file in the
 * Downloads root; the File System Access API can make real folders but only
 * after prompting for a directory, which is a permission dialog in exchange for
 * something the app should just do.
 *
 * JobHunt runs its own server on the machine it is used from, so the server can
 * write the file where it belongs. That is the whole reason this route exists,
 * and also why it is careful: every path component is sanitised, the extension
 * is checked against a list, and the result is verified to still be inside the
 * downloads root before anything is written.
 */

/** Generated resumes are small; this is a runaway guard, not a real limit. */
const MAX_BYTES = 25 * 1024 * 1024;

function downloadsRoot(): string {
  return process.env.JOBHUNT_DOWNLOAD_DIR?.trim() || path.join(homedir(), "Downloads");
}

export async function POST(request: NextRequest) {
  try {
    // Percent-encoded by the client — header values are Latin-1 only and these
    // are arbitrary text. Tolerant of an unencoded value so a malformed one
    // degrades to sanitising rather than throwing.
    const decode = (raw: string | null) => {
      if (!raw) return "";
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };

    const company = decode(request.headers.get("X-Company"));
    const role = decode(request.headers.get("X-Role"));
    const filename = decode(request.headers.get("X-Filename"));

    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    }

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "That file is too large to save." }, { status: 413 });
    }

    // The name is rebuilt from sanitised parts rather than trusted: it arrives
    // in a header, and "..\\..\\startup\\x.pdf" is a header a browser will
    // happily send.
    const stem = sanitizeSegment(filename.slice(0, -(extension.length + 1)), "resume");
    const safeName = `${stem}.${extension}`;

    const root = downloadsRoot();
    const dir = path.join(
      root,
      sanitizeSegment(company, "Unknown-Company"),
      sanitizeSegment(role, "Unknown-Role")
    );
    const target = path.join(dir, safeName);

    // Belt and braces: sanitizeSegment already removes separators and leading
    // dots, so this should be unreachable. It is cheap, and it is the check
    // that actually guarantees the write stays where it is meant to.
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) {
      return NextResponse.json({ error: "Refused to write outside Downloads." }, { status: 400 });
    }

    await mkdir(dir, { recursive: true });
    await writeFile(resolved, bytes);

    return NextResponse.json({ path: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
