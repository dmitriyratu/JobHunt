export const SETTINGS_STORAGE_KEY = "jobhunt-settings";

/**
 * Model choice deliberately lives in code (see @/lib/models), not here — each
 * endpoint picks the model its job needs. What the user configures is
 * credentials plus the contact block that heads every generated resume.
 */

/**
 * The contact header on generated resumes.
 *
 * Lives here rather than on a Session because it is identical on every resume
 * you will ever generate, and settings survive deleting every application.
 * Seeded by regex from your first upload (see @/lib/contactExtract) so there
 * is no setup step, then owned by you — a phone number the PDF parser mangled
 * is a one-time fix instead of a recurring one.
 */
export type ResumeProfile = {
  fullName: string;
  /**
   * The line under your name ("Senior Backend Engineer").
   *
   * Optional: left blank, the resume falls back to your most recent job title,
   * which is right often enough that nobody has to fill this in. Worth setting
   * when you're aiming at a title you don't currently hold.
   */
  headline: string;
  email: string;
  phone: string;
  linkedin: string;
  website: string;
  location: string;
};

export type AppSettings = {
  apiKey: string;
  /**
   * Optional OpenAI *Admin* key (sk-admin-...) with the api.usage.read scope.
   * Only used to read authoritative spend from OpenAI's Admin API; a normal
   * project key is rejected there with a 403.
   */
  adminApiKey: string;
  profile: ResumeProfile;
};

export const EMPTY_PROFILE: ResumeProfile = {
  fullName: "",
  headline: "",
  email: "",
  phone: "",
  linkedin: "",
  website: "",
  location: "",
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  adminApiKey: "",
  profile: EMPTY_PROFILE,
};

/**
 * Tidies a plain North American number, and leaves everything else alone.
 *
 * "7323725473" off a PDF is unreadable on a resume, and typing the brackets
 * yourself is work the app can do. But a phone field is one of the few places a
 * tool can actively damage correct input: reformatting "+44 20 7123 4567" or
 * "555-0142 ext 12" would corrupt a number that was already right.
 *
 * So this only acts when the input is unambiguous — nothing but digits and the
 * usual separators, and exactly ten digits, or eleven beginning with a 1.
 * Anything else is returned untouched, which is the correct answer for every
 * international format, extension and vanity number.
 */
export function formatPhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // A "+" means the writer is being explicit about a country code; a letter
  // means an extension or a vanity number. Either way, they know better.
  if (!/^[\d\s().-]+$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return trimmed;

  const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  return digits.length === 11 ? `+1 ${formatted}` : formatted;
}

/** A resume needs at minimum a name and one way to reply. */
export function isProfileUsable(profile: ResumeProfile): boolean {
  return Boolean(profile.fullName.trim() && (profile.email.trim() || profile.phone.trim()));
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // A previously stored `modelTier` is simply ignored — the extra key is
    // harmless and disappears on the next save.
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiKey: parsed.apiKey ?? "",
      adminApiKey: parsed.adminApiKey ?? "",
      // Field-by-field so settings saved before the profile existed — and any
      // future field — read back as empty strings rather than undefined.
      profile: { ...EMPTY_PROFILE, ...(parsed.profile ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
