"use client";

import { sanitizeSegment } from "./filePaths";

/**
 * Saves a generated file to Downloads/<Company>/<Role>/<name>.
 *
 * Hands the bytes to the app's own server, which can create the folders — see
 * /api/save-download for why the browser can't. Falls back to an ordinary
 * download if that fails for any reason, so a save never silently does nothing;
 * the flat name carries the company and role that the folders would have.
 */

export type SaveResult = {
  /** Where it went, for showing the user. */
  path: string;
  /** False when we fell back to an ordinary browser download. */
  usedFolders: boolean;
};

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
  filename: string
): Promise<SaveResult> {
  try {
    const res = await fetch("/api/save-download", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        // Percent-encoded because header values are Latin-1 only, and these are
        // arbitrary text: a job title like "Outpatient Practice – Various
        // locations" carries an en dash, which makes fetch reject the request
        // outright and silently drop the save to a flat browser download.
        "X-Company": encodeURIComponent(company),
        "X-Role": encodeURIComponent(role),
        "X-Filename": encodeURIComponent(filename),
      },
      body: blob,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not save the file");
    return { path: data.path as string, usedFolders: true };
  } catch {
    const flat = [sanitizeSegment(company), sanitizeSegment(role), filename].join("_");
    browserDownload(blob, flat);
    return { path: flat, usedFolders: false };
  }
}
