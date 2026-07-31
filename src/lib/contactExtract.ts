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

const LINKEDIN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?/i;

// GitHub first — for most engineering resumes it is the link that matters —
// then any other bare domain that isn't one we already handle.
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i;
const WEBSITE_RE =
  /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|dev|io|me|net|org|app|xyz|ca|co\.uk)(?:\/[\w./%-]*)?/i;

/**
 * "Toronto, ON" / "Toronto, Ontario" / "Austin, TX, USA".
 * Requires a comma — bare city names are indistinguishable from company names.
 */
const LOCATION_RE =
  /\b([A-Z][a-zA-Z.'-]+(?:[ -][A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2}|[A-Z][a-zA-Z]{2,})\b(?:,\s*(?:USA|United States|Canada|UK|United Kingdom))?/;

const URL_HOSTS_TO_SKIP = /linkedin\.com|github\.com/i;

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

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
  const linkedin = head.match(LINKEDIN_RE)?.[0] ?? "";

  const github = head.match(GITHUB_RE)?.[0] ?? "";
  let website = github;
  if (!website) {
    // Skip anything that's really the email's domain or a link handled above.
    for (const candidate of head.match(new RegExp(WEBSITE_RE, "gi")) ?? []) {
      if (URL_HOSTS_TO_SKIP.test(candidate)) continue;
      if (email && email.endsWith(candidate.replace(/^www\./i, ""))) continue;
      website = candidate;
      break;
    }
  }

  const fullName = lines.find(looksLikeName) ?? "";

  // Restricted to the first few lines: a "Toronto, ON" under an employer three
  // jobs down is that job's location, not where the candidate lives.
  const locationMatch = lines.slice(0, 6).join("\n").match(LOCATION_RE);

  return {
    ...EMPTY_PROFILE,
    fullName,
    email,
    phone,
    linkedin: linkedin ? stripProtocol(linkedin) : "",
    website: website ? stripProtocol(website) : "",
    location: locationMatch?.[0] ?? "",
  };
}

/**
 * Fills only the blanks. A value the user corrected by hand outranks anything
 * a regex finds, so re-uploading a resume can never clobber it.
 *
 * Returns `existing` by identity when nothing was filled, so callers can skip
 * a pointless state update and localStorage write on every re-upload.
 */
export function seedProfile(
  existing: ResumeProfile,
  resumeText: string
): ResumeProfile {
  const found = extractContactProfile(resumeText);
  const next = { ...existing };
  let filled = false;
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ResumeProfile)[]) {
    if (!next[key]?.trim() && found[key]) {
      next[key] = found[key];
      filled = true;
    }
  }
  return filled ? next : existing;
}
