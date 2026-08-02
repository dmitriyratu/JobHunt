import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { compileLatex, findEngine, INSTALL_HINT } from "@/lib/latexEngine";

export const runtime = "nodejs";

/** Max source size. A two-page resume is ~6KB; this is a runaway guard. */
const MAX_TEX_BYTES = 400_000;

/**
 * Every compiled document, kept on disk.
 *
 * The .tex is otherwise the one artifact that never survives its request: it
 * lives in React state, goes to a temp directory that is deleted the moment
 * Tectonic exits, and is gone. That makes the rendered document the hardest
 * thing in the app to inspect after the fact — a spacing bug, a bad escape or a
 * bullet that came out truncated can only be caught by watching it happen.
 *
 * Two files, overwritten each compile: the source as it last built, and the
 * previous one, so a change can be diffed against what it replaced. Off unless
 * JOBHUNT_TEX_DIR names somewhere to put them, and never fatal — a document
 * that typesets must not fail because a debug write did.
 */
async function keepSource(tex: string): Promise<void> {
  const dir = process.env.JOBHUNT_TEX_DIR;
  if (!dir) return;
  try {
    await mkdir(dir, { recursive: true });
    const { readFile } = await import("node:fs/promises");
    const previous = await readFile(join(dir, "latest.tex"), "utf-8").catch(() => null);
    if (previous && previous !== tex) {
      await writeFile(join(dir, "previous.tex"), previous, "utf-8");
    }
    await writeFile(join(dir, "latest.tex"), tex, "utf-8");
  } catch {
    // Debug output is never worth a failed compile.
  }
}

/**
 * Whether the machine can typeset at all.
 *
 * Called on mount so the editor can show install instructions up front instead
 * of letting the first keystroke fail with a compile error that looks like the
 * document's fault.
 */
export async function GET() {
  const engine = await findEngine();
  return NextResponse.json(
    engine ? { available: true } : { available: false, hint: INSTALL_HINT }
  );
}

/**
 * LaTeX in, PDF out.
 *
 * JSON both ways, with the PDF base64-encoded.
 *
 * This used to answer with raw PDF bytes, which was tidier, but a compile now
 * produces two things: the document and the SyncTeX map that lets a click on
 * the preview find its line in the source. They are generated together in a
 * temp directory that is deleted immediately afterwards, so they have to be
 * returned together — there is nothing to come back for. Base64 costs a third
 * more bytes over localhost, against a second compile to fetch the other half.
 */
export async function POST(request: NextRequest) {
  try {
    const { tex } = (await request.json()) as { tex?: string };

    if (!tex?.trim()) {
      return NextResponse.json({ error: "No LaTeX source provided." }, { status: 400 });
    }
    if (tex.length > MAX_TEX_BYTES) {
      return NextResponse.json(
        { error: "That document is too large to compile." },
        { status: 413 }
      );
    }

    // Before the compile, so a source that fails to build is still on disk to
    // look at — that is exactly when you want it.
    await keepSource(tex);

    const result = await compileLatex(tex);

    if (!result.ok) {
      // 422, not 500: the request was fine, the document didn't build. The
      // editor shows this inline rather than as a failure of the app.
      return NextResponse.json({ error: result.message, log: result.log }, { status: 422 });
    }

    return NextResponse.json(
      {
        pdf: result.pdf.toString("base64"),
        pages: result.pages,
        synctex: result.synctex,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compilation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
