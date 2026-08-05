import { deleteFile, PROFILE_RESUME_KEY } from "./fileStore";
import type { NameVariant, SpellingSuggestion } from "@/types";

/**
 * Your resume, held once and used by every application.
 *
 * It used to be step 1 of every submission, which asked the same question over
 * and over: a resume changes a few times a year, a job description changes
 * every time. The app already knew the answer too — each new application copied
 * the previous one's text forward — so the question was never really being
 * asked, only re-displayed.
 *
 * It lives beside the contact block instead, under Your Profile, because that
 * is what it is: a thing you own rather than a thing you submit. The contact
 * block is read out of it (see @/lib/contactExtract), so the two belong in the
 * same dialog, and uploading is the one action that fills both.
 *
 * Sessions still copy the text rather than pointing at it. A match report from
 * March was run against the resume you had in March, and repointing it at
 * today's upload would silently rewrite what an old report was an answer to.
 *
 * Stored beside settings rather than inside them: both outlive an application,
 * but this is kilobytes of document text, and a stale `settings` object saved
 * from some other component would take the resume down with it.
 */

export const BASE_RESUME_STORAGE_KEY = "jobhunt-base-resume";

/**
 * Fired whenever the saved resume is written or cleared.
 *
 * The dialog that owns it lives in AppHeader; the source page needs to know
 * when a resume appears so it can seed the application on screen. A window
 * event rather than lifting this into a provider — it fires about as often as
 * you change your resume, and hydration order makes a provider the more
 * delicate of the two.
 */
export const BASE_RESUME_EVENT = "jobhunt:base-resume-changed";

export type BaseResume = {
  /** Extracted text, after any accepted spelling and naming fixes. */
  text: string;
  filename: string;
  /** When the file was read, so the UI can say how old it is. */
  savedAt: string;
  /**
   * Findings from the upload that are still awaiting a decision.
   *
   * On the document rather than on a session, which is where they used to sit.
   * A typo belongs to the resume, and a list held per application meant being
   * offered the same correction on every one of them — the exact repetition
   * saving the resume exists to end.
   */
  spellingSuggestions: SpellingSuggestion[];
  nameVariants: NameVariant[];
};

export function loadBaseResume(): BaseResume | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BASE_RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BaseResume>;
    // The text is the whole point: an entry without it is a leftover.
    if (typeof parsed.text !== "string" || !parsed.text) return null;
    return {
      text: parsed.text,
      filename: typeof parsed.filename === "string" ? parsed.filename : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      // Absent on a resume saved before the findings moved here. An empty list
      // reads the same as "already reviewed", which it was.
      spellingSuggestions: Array.isArray(parsed.spellingSuggestions)
        ? parsed.spellingSuggestions
        : [],
      nameVariants: Array.isArray(parsed.nameVariants) ? parsed.nameVariants : [],
    };
  } catch {
    return null;
  }
}

export function saveBaseResume(next: BaseResume): BaseResume {
  try {
    localStorage.setItem(BASE_RESUME_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Quota. Nothing else to do — the caller's copy is still in memory. */
  }
  window.dispatchEvent(new Event(BASE_RESUME_EVENT));
  return next;
}

export function clearBaseResume(): void {
  localStorage.removeItem(BASE_RESUME_STORAGE_KEY);
  void deleteFile(PROFILE_RESUME_KEY);
  window.dispatchEvent(new Event(BASE_RESUME_EVENT));
}

/** Whether anything from the upload is still waiting on a yes or no. */
export function hasOpenFindings(resume: BaseResume | null): boolean {
  if (!resume) return false;
  return resume.spellingSuggestions.length > 0 || resume.nameVariants.length > 0;
}
