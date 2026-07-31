/**
 * Naming for saved files. Pure string work, shared by the browser (which shows
 * the path) and the API route (which writes it), so the two can't disagree
 * about where a download went.
 */

// Characters Windows forbids in a path component, plus the C0 control range.
// Space and hyphen are legal and deliberately absent: folding them in here
// would run words together ("Dmitriy Ratushny" -> "dmitriyratushny").
const ILLEGAL = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * One path segment, safe on Windows and readable by a person.
 * "Senior Backend Engineer (Remote)" becomes "Senior-Backend-Engineer-Remote".
 *
 * Also the only thing standing between a company name and a path traversal on
 * the server: separators and dots are stripped here, so no input can climb out
 * of the folder it is meant to land in.
 */
export function sanitizeSegment(raw: string, fallback = "Unknown"): string {
  let s = raw.replace(ILLEGAL, " ").replace(/[()[\]{}]/g, " ");
  s = s.replace(/\s+/g, "-").replace(/-+/g, "-");
  // Trailing dots and spaces make a directory Explorer cannot open or delete —
  // and a leading run of dots is how ".." gets in.
  s = s.replace(/^[-.\s]+|[-.\s]+$/g, "");
  if (RESERVED.test(s)) s = `${s}-folder`;
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/, "");
  return s || fallback;
}

/** "Dmitriy Ratushny" → "dmitriy_ratushny_resume.pdf" */
export function resumeFilename(fullName: string, extension = "pdf"): string {
  const base = fullName
    .normalize("NFKD")
    // Drop combining marks so "José" becomes "jose", not "jos_".
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "resume"}_resume.${extension}`;
}

/** Only the extensions this app produces may be written. */
export const ALLOWED_EXTENSIONS = ["pdf", "docx"] as const;
