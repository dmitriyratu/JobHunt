"use client";

import { downloadSegments, flatDownloadName } from "./filePaths";
import { ensureSaveFolder, writeIntoFolder } from "./saveFolder";

/**
 * Saves a generated file to <your folder>/<Company>/<Role>/<name>.
 *
 * The browser writes it, wherever JobHunt is running — see @/lib/saveFolder for
 * how, and for what it costs.
 *
 * There used to be a second way: an API route that made the folders itself,
 * because JobHunt was something you ran on your own machine and its server was
 * therefore your disk. That is a fact about a deployment, not about the app, and
 * the moment it stopped being true the route kept succeeding — writing a real
 * file into a container discarded seconds later, reporting 200, and leaving the
 * page to announce a saved document nobody could find.
 *
 * It could have been kept for local use and the two paths chosen between. One
 * path is worth more. An app that saves differently depending on where its
 * server happens to be is an app tested in the arrangement its author uses and
 * shipped in the other one, and the difference surfaces where it can least
 * afford to: somebody else's first download.
 *
 * The price is the one thing a server could do that a page cannot — open the
 * containing folder afterwards. A directory handle will not even disclose an
 * absolute path, so that button is gone rather than reduced.
 *
 * There is still a last resort: an ordinary flat download, whose name carries
 * the company and role the folders would have. Firefox and Safari have no
 * picker, and a save must never silently do nothing.
 */

export type SaveResult = {
  /** Where it went, for showing the user. Starts at the folder they chose. */
  path: string;
  /** False when we fell back to an ordinary browser download. */
  usedFolders: boolean;
};

/**
 * Where the next save goes, resolved before anything is built.
 *
 * Separate from the save itself because choosing a folder opens a dialog, and a
 * dialog needs the click that asked for it. Building a PDF first would spend
 * that activation on a compile.
 */
export type Destination =
  | { kind: "folder"; handle: FileSystemDirectoryHandle }
  | { kind: "browser" };

/**
 * Must be called from the click that will save, so the picker can open.
 *
 * Never throws. It runs before the document is even built, so anything escaping
 * here would stop the save from being attempted at all — and a browser download
 * is always available as an answer.
 */
export async function resolveDestination(): Promise<Destination> {
  try {
    const handle = await ensureSaveFolder({ prompt: true });
    return handle ? { kind: "folder", handle } : { kind: "browser" };
  } catch {
    return { kind: "browser" };
  }
}

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some builds.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function saveToDownloads(
  blob: Blob,
  company: string,
  role: string,
  filename: string,
  destination: Destination
): Promise<SaveResult> {
  if (destination.kind === "folder") {
    try {
      const segments = downloadSegments(company, role);
      const path = await writeIntoFolder(destination.handle, segments, filename, blob);
      return { path, usedFolders: true };
    } catch {
      // Falls through to the flat download. A folder that was renamed or
      // unplugged, a disk that is full, permission withdrawn between the click
      // and the write — none of them are worth a dead button when the bytes are
      // already in hand.
    }
  }
  const flat = flatDownloadName(company, role, filename);
  browserDownload(blob, flat);
  return { path: flat, usedFolders: false };
}
