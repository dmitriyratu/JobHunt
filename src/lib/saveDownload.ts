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

/**
 * Shows a saved file in the OS file manager. See /api/reveal-download.
 *
 * Returns the reason on failure rather than throwing: this is a convenience on
 * top of a save that already succeeded, and nothing about it is worth
 * interrupting anyone over.
 */
export async function revealDownload(filePath: string): Promise<string> {
  try {
    const res = await fetch("/api/reveal-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    if (res.ok) return "";
    const data = await res.json().catch(() => ({}));
    return (data as { error?: string }).error ?? "Could not open the folder";
  } catch {
    return "Could not open the folder";
  }
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
