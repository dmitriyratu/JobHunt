/**
 * The key carries a version because every entry here is an answer from a
 * resolver that has since learned something new, and a stored "no logo" would
 * outlive the reason for it. v2 discarded v1's permanent misses, recorded
 * before the resolver tried alternative spellings; v3 discards v2's, recorded
 * before it fell back to the company's own favicon — every employer Wikidata
 * has never heard of was sitting in there as a miss.
 *
 * Bumping the version is the whole migration: the old key is simply never read
 * again. Sweeping it out of localStorage as well was tried and removed — it ran
 * on every single write, for the life of the app, to reclaim a few kilobytes
 * once on machines that had visited before August 2026.
 */
const STORAGE_KEY = "jobhunt-logo-cache-v3";

/**
 * A found logo is kept indefinitely; "no logo" expires.
 *
 * The two ways of getting a null are indistinguishable here: the company really
 * has no logo on Wikidata, or the lookup was rate-limited. Remembering the
 * second forever means a transient blip permanently blanks a company's logo.
 */
const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

/** JSON.stringify turns Infinity into null, so "never expires" needs a real number. */
const NEVER = Number.MAX_SAFE_INTEGER;

type Entry = { url: string | null; expires: number };
type LogoCache = Record<string, Entry>;

function read(): LogoCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as LogoCache) : {};
  } catch {
    return {};
  }
}

/**
 * The domain is part of the key, not just the name.
 *
 * A card is drawn long before its posting is analyzed, so the same company is
 * looked up first with no domain and later with one. Keyed on the name alone,
 * the "no logo" stored by the first lookup answers the second and the domain
 * never gets its chance.
 */
function cacheKey(name: string, domain: string): string {
  return `${name.trim().toLowerCase()}|${domain.trim().toLowerCase()}`;
}

export function getCachedLogo(name: string, domain = ""): string | null | undefined {
  const entry = read()[cacheKey(name, domain)];
  // undefined = never looked up (or expired); null = looked up, no logo exists.
  if (!entry) return undefined;
  if (entry.url === null && entry.expires < Date.now()) return undefined;
  return entry.url;
}

export function setCachedLogo(name: string, url: string | null, domain = ""): void {
  if (typeof window === "undefined") return;
  try {
    const cache = read();
    cache[cacheKey(name, domain)] = {
      url,
      expires: url ? NEVER : Date.now() + NEGATIVE_TTL_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* cache is best-effort */
  }
}
