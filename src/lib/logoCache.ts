/**
 * v2 key: v1 stored "no logo" permanently, so any company that failed a lookup
 * once — including every name that missed before the resolver learned to try
 * alternative spellings — could never recover without the user clearing site
 * data. Changing the key discards those entries outright.
 */
const STORAGE_KEY = "jobhunt-logo-cache-v2";
const LEGACY_KEY = "jobhunt-logo-cache";

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

export function getCachedLogo(name: string): string | null | undefined {
  const entry = read()[name.trim().toLowerCase()];
  // undefined = never looked up (or expired); null = looked up, no logo exists.
  if (!entry) return undefined;
  if (entry.url === null && entry.expires < Date.now()) return undefined;
  return entry.url;
}

export function setCachedLogo(name: string, url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const cache = read();
    cache[name.trim().toLowerCase()] = {
      url,
      expires: url ? NEVER : Date.now() + NEGATIVE_TTL_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* cache is best-effort */
  }
}
