import releasesData from "@/data/releases.json";

/**
 * The release history shown in What's new.
 *
 * `src/data/releases.json` is written by `scripts/release-notes.mjs`, which the
 * post-commit hook runs on main — so this file is generated, not hand-edited.
 * Newest entry first; the generator prepends.
 */

/**
 * A screenshot of the change, taken from a fixture rather than a real session.
 *
 * Two files, because the app has two themes and a light screenshot in a dark
 * modal reads as a bug. Paths are under `public/releases/<version>/` and are
 * written per release, so an old note keeps showing the UI it described.
 *
 * Absent on most changes. A picture is only worth its space when the change is
 * visual and hard to picture from a sentence — see the rules in
 * `scripts/release-notes.mjs`.
 */
export type ReleaseMedia = {
  light: string;
  dark: string;
  /** Describes the screenshot for anyone who can't see it. Not a caption —
      nothing renders it visibly. */
  alt: string;
};

export type ReleaseChange = {
  title: string;
  detail: string;
  media?: ReleaseMedia;
};

export type Release = {
  version: string;
  date: string;
  headline: string;
  summary: string;
  changes: ReleaseChange[];
  /** The commit this release was cut from. Used by the generator to find the
      next range of commits, not by the UI. */
  commit?: string;
};

export const releases = releasesData as Release[];

export const latestRelease: Release | undefined = releases[0];

const SEEN_STORAGE_KEY = "jobhunt.releases.seen";

/**
 * Compared as an exact string rather than by semver order. A rollback should
 * also count as "something changed", and the only question this answers is
 * whether what you last read is what's on screen now.
 */
export function hasUnreadRelease(): boolean {
  if (typeof window === "undefined" || !latestRelease) return false;
  try {
    return localStorage.getItem(SEEN_STORAGE_KEY) !== latestRelease.version;
  } catch {
    // Private-mode Safari and friends. A missing dot is a better failure than
    // a crashed header.
    return false;
  }
}

export function markReleasesSeen(): void {
  if (typeof window === "undefined" || !latestRelease) return;
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, latestRelease.version);
  } catch {
    // Nothing to do — the dot simply stays.
  }
}

/** "2026-08-04" -> "4 August 2026". Kept out of the component so the modal
    doesn't carry an Intl dependency for one line. */
export function formatReleaseDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
