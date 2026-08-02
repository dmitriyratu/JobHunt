import {
  DETECTABLE_LINK_KINDS,
  LINK_DEF,
  extractLinks,
  getLink,
  setLink,
} from "./profileLinks";
import { EMPTY_PROFILE, type ResumeProfile } from "./settings";

/**
 * Pulls the contact block out of already-parsed resume text.
 *
 * Deliberately regex rather than an AI call: this is the most structurally
 * predictable part of any resume, it runs once per upload, and it seeds a form
 * the user reviews rather than feeding anything downstream unchecked. Paying a
 * model to read a whole resume for an email address would be the wrong trade.
 *
 * Every field is best-effort. A miss leaves the field empty, which the profile
 * form then asks for — a wrong value would be worse than a blank one.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Deliberately strict about separators. A loose \d{3}.\d{3}.\d{4} pattern
// happily matches dates, ZIP+4, and employee ids scattered through a resume.
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;

/**
 * "Toronto, ON" / "Toronto, Ontario" / "Austin, TX, USA".
 * Requires a comma — bare city names are indistinguishable from company names.
 */
const LOCATION_RE =
  /\b([A-Z][a-zA-Z.'-]+(?:[ -][A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2}|[A-Z][a-zA-Z]{2,})\b(?:,\s*(?:USA|United States|Canada|UK|United Kingdom))?/;

function looksLikeName(line: string): boolean {
  if (!line || line.length > 60) return false;
  if (/[@\d]/.test(line)) return false;
  if (/https?:|www\./i.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // "DMITRIY RATUSHNY" and "Dmitriy Ratushny" both qualify; "senior engineer"
  // does not. Every word must start with a capital.
  return words.every((w) => /^[A-Z]/.test(w));
}

export function extractContactProfile(resumeText: string): ResumeProfile {
  // The contact block is always at the top. Scanning the whole document finds
  // a referee's email or a former employer's city instead.
  const head = resumeText.slice(0, 1200);
  const lines = head
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const email = head.match(EMAIL_RE)?.[0] ?? "";
  const phone = head.match(PHONE_RE)?.[0]?.trim() ?? "";
  const nameLine = lines.find(looksLikeName) ?? "";
  const fullName = nameLine;

  // Restricted to the first few lines: a "Toronto, ON" under an employer three
  // jobs down is that job's location, not where the candidate lives.
  //
  // The name line is excluded, because a credential after a comma is
  // indistinguishable from a state: "Teresa Alfau Hernandez, MD" parses as
  // perfectly as "Silver Spring, MD" — and it sits above the real location, so
  // it wins. Same for a "Jane Doe, PA" or a "John Roe, LA".
  const locationMatch = lines
    .slice(0, 6)
    .filter((line) => line !== nameLine)
    .join("\n")
    .match(LOCATION_RE);

  return {
    ...EMPTY_PROFILE,
    fullName,
    email,
    phone,
    location: locationMatch?.[0] ?? "",
    // Which identifiers exist and how each is recognised belongs with the
    // catalogue that defines them, not here — this file knows about contact
    // blocks, not about what an ORCID looks like.
    links: extractLinks(head, email),
  };
}

/** One change the upload proposes, named the way the form names it. */
export type SeededField = {
  label: string;
  /** What the uploaded resume says. Empty means the resume dropped this field. */
  value: string;
  /**
   * What was on file before, when this replaces or clears something rather than
   * filling a blank. The dialog shows it so a value can never be changed or
   * dropped unnoticed — that is the whole reason overwriting is safe here.
   */
  previous?: string;
};

const SCALAR_LABELS: Record<
  "fullName" | "headline" | "email" | "phone" | "location",
  string
> = {
  fullName: "Name",
  headline: "Headline",
  email: "Email",
  phone: "Phone",
  location: "Location",
};

/**
 * The profile this resume describes: what it says wins, field by field.
 *
 * This used to fill only the blanks, on the reasoning that a value corrected by
 * hand outranks a regex. That was right while the seeding was silent — an
 * invisible overwrite of a phone number someone had just fixed is indefensible.
 * It is wrong now that the result is confirmed: uploading a different person's
 * resume and being shown the previous person's name is not a cautious answer,
 * it is a wrong one, and it makes the dialog say the opposite of the truth.
 *
 * So the profile mirrors the resume: an uploaded value replaces what is on
 * file, and a field the resume drops is cleared. Every change carries the value
 * it displaces (`previous`) for the dialog to show. Nothing is written until
 * the user confirms, and declining leaves the profile untouched — which is the
 * protection the blanks-only rule was standing in for.
 *
 * Two things are exempt, on the same principle: this can only clear a field
 * whose absence it is qualified to read. `headline` is never extracted from any
 * resume, and neither is a bar number or a portfolio URL (see
 * DETECTABLE_LINK_KINDS) — for those, "the resume didn't mention it" is
 * guaranteed rather than informative, so clearing them would delete hand-typed
 * values that no later upload could restore.
 *
 * Reports two different things, because the caller asks two different
 * questions. `filled` is what this upload contributed, which the dialog names
 * specifically. `detected` is whether the resume had a contact block at all,
 * which decides whether there is anything to confirm: a resume it could read
 * nothing out of should not open a dialog to say so, but one whose details
 * simply match what is on file should still be confirmable.
 */
export function seedProfile(
  existing: ResumeProfile,
  resumeText: string
): { profile: ResumeProfile; filled: SeededField[]; detected: boolean } {
  const found = extractContactProfile(resumeText);
  const next = { ...existing };
  const filled: SeededField[] = [];
  const detected =
    Boolean(found.fullName || found.email || found.phone || found.location) ||
    found.links.length > 0;

  // A document this could read nothing out of is not a resume saying "I have no
  // name and no email" — it is a parse that failed, a scan, a cover page. Since
  // an unmentioned field is now cleared, that distinction has teeth: without
  // this the answer would be a proposal to erase the entire profile. Returned
  // untouched rather than left to the caller's `detected` check, so a future
  // caller cannot wipe a profile by forgetting one.
  if (!detected) return { profile: existing, filled: [], detected };

  // `headline` is absent from this list deliberately — see above.
  for (const key of ["fullName", "email", "phone", "location"] as const) {
    const value = found[key]?.trim() ?? "";
    const current = next[key]?.trim() ?? "";
    if (current === value) continue; // already agrees; not worth reporting
    next[key] = found[key];
    filled.push({
      label: SCALAR_LABELS[key],
      value: found[key],
      ...(current ? { previous: current } : {}),
    });
  }

  // A dismissed kind stays dismissed until a resume contradicts it. Removing the
  // NPI slot said "I have no NPI" about the profile on file, and a document
  // carrying the identifier is a newer answer to the same question — the same
  // reasoning that lets an uploaded name outrank a stored one above.
  //
  // Skipping hidden kinds outright was a deadlock with no way out through the UI:
  // the seed refused to set the value, and the form only offers a dismissed slot
  // back once it has one, so a resume's LinkedIn could never reappear. Worse,
  // silently — the extraction found it, and nothing said it had been dropped.
  //
  // Only a value un-hides. A hidden kind the resume says nothing about stays
  // hidden and stays empty, which is exactly what dismissing it asked for.
  const hidden = new Set(next.hiddenLinks);
  const byKind = new Map(found.links.map((l) => [l.kind, l.value.trim()]));
  for (const kind of DETECTABLE_LINK_KINDS) {
    const value = byKind.get(kind) ?? "";
    if (!value && hidden.has(kind)) continue;
    const current = getLink(next.links, kind).trim();
    if (current === value) continue;
    next.links = setLink(next.links, kind, value);
    if (value) next.hiddenLinks = next.hiddenLinks.filter((k) => k !== kind);
    filled.push({
      label: LINK_DEF[kind].label,
      value,
      ...(current ? { previous: current } : {}),
    });
  }

  return { profile: filled.length ? next : existing, filled, detected };
}
