import { readAssertedFacts } from "./assertedFacts";
import {
  isLinkKind,
  migrateLegacyLinks,
  type LinkKind,
  type ProfileLink,
} from "./profileLinks";
import type { AssertedFact } from "@/types";

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
  location: string;
  /**
   * Everything else in the contact line, as a typed list.
   *
   * Replaced fixed `linkedin` and `website` fields. One list rather than a
   * column per kind because the set is open — see @/lib/profileLinks — and
   * because it keeps one identity for a person across every document shape:
   * a physician who also writes code keeps both, and only fills in what they
   * want on the page.
   */
  links: ProfileLink[];
  /**
   * Kinds the user has dismissed from the form.
   *
   * Only ever affects which empty slots are offered. A suggestion is a guess
   * about the profession, and a guess you cannot wave away stops being a
   * suggestion and starts being nagging — an academic with no ORCID would be
   * asked for one on every visit forever. Persisted rather than held in
   * component state for exactly that reason: dismissing something that returns
   * the moment you close the dialog is not dismissing it.
   *
   * Never hides a kind that has a value. A field holding text you can see on
   * the page but cannot edit would be the worst of both.
   */
  hiddenLinks: LinkKind[];
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
  /**
   * Things you told the app that your uploaded document doesn't say.
   *
   * Beside the profile rather than inside it: the profile is the contact block
   * printed on a document, these are content the document is written from. They
   * share a home only because both outlive any one application — see
   * AssertedFact in @/types.
   */
  assertedFacts: AssertedFact[];
};

export const EMPTY_PROFILE: ResumeProfile = {
  fullName: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: [],
  hiddenLinks: [],
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  adminApiKey: "",
  profile: EMPTY_PROFILE,
  assertedFacts: [],
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

/**
 * A stored profile, brought up to the current shape.
 *
 * Field-by-field so settings saved before the profile existed — and any future
 * field — read back as empty rather than undefined. `links` is the one that
 * needs real work: profiles saved before the catalogue existed carry `linkedin`
 * and `website` strings instead, and a stored kind may have come from a build
 * with a longer catalogue than this one, so both are filtered through the
 * catalogue rather than trusted.
 */
function readProfile(stored: unknown): ResumeProfile {
  if (!stored || typeof stored !== "object") return EMPTY_PROFILE;
  const raw = stored as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");

  const links: ProfileLink[] = Array.isArray(raw.links)
    ? (raw.links as unknown[]).flatMap((l) => {
        if (!l || typeof l !== "object") return [];
        const { kind, value } = l as { kind?: unknown; value?: unknown };
        if (!isLinkKind(kind) || typeof value !== "string" || !value.trim()) return [];
        return [{ kind, value }];
      })
    : migrateLegacyLinks(raw);

  const hiddenLinks: LinkKind[] = Array.isArray(raw.hiddenLinks)
    ? (raw.hiddenLinks as unknown[]).filter(isLinkKind)
    : [];

  return {
    fullName: str("fullName"),
    headline: str("headline"),
    email: str("email"),
    phone: str("phone"),
    location: str("location"),
    links,
    hiddenLinks,
  };
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
      profile: readProfile(parsed.profile),
      assertedFacts: readAssertedFacts(parsed.assertedFacts),
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
