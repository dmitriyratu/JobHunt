const STORAGE_KEY = "jobhunt-logo-cache";

/** company name (lowercased) -> logo URL, or null meaning "looked up, none exists". */
type LogoCache = Record<string, string | null>;

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
  // undefined = never looked up; null = looked up and there is no logo.
  return read()[name.trim().toLowerCase()];
}

export function setCachedLogo(name: string, url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const cache = read();
    cache[name.trim().toLowerCase()] = url;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* cache is best-effort */
  }
}
