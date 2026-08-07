/**
 * Naming for saved files. Pure string work, kept apart from the writing so the
 * rules a name has to obey are in one place and can be read without reading a
 * save.
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
 * Company and role are model output about an uploaded document, and they name
 * folders. Separators and dots are stripped here, so a job title cannot climb
 * out of the folder it is meant to land in — `getDirectoryHandle` rejects a name
 * containing a slash outright, and a rejection is a failed save.
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

/**
 * The two folders a saved document lives under, in order.
 *
 * Also what the flat fallback name is built from, so a browser that cannot make
 * folders still files the document under the same two words — and the line in
 * the toolbar can say where it went without knowing which of them happened.
 */
export function downloadSegments(company: string, role: string): [string, string] {
  return [sanitizeSegment(company, "Unknown-Company"), sanitizeSegment(role, "Unknown-Role")];
}

/**
 * The name for a save that could not make folders — a browser with no directory
 * picker, or one the reader declined.
 *
 * Carries the company and the role in the name, because they are what the
 * folders were for: forty applications flattened into one directory are worth
 * telling apart, and the alternative is forty files called
 * `dmitriy_resume.pdf`.
 */
export function flatDownloadName(company: string, role: string, filename: string): string {
  return [...downloadSegments(company, role), filename].join("_");
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
