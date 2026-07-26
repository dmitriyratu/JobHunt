// Shared by both the server-side fetch (src/lib/parsers/html.ts) and the
// client-side URL input (JobDescriptionInput) — kept dependency-free (no
// cheerio) so it's safe to import from a client component.

export function isLinkedInHostname(hostname: string): boolean {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

// LinkedIn job-view links carry a long tail of session/tracking query params
// (eBP, refId, trackingId, alternateChannel, ...) that aren't needed to load
// the posting and just clutter the input/stored source — reduce to the
// stable permalink shape, e.g. https://www.linkedin.com/jobs/view/4421177835/
export function canonicalizeLinkedInUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isLinkedInHostname(parsed.hostname)) return url;

  const match = parsed.pathname.match(/^\/jobs\/view\/(\d+)/);
  if (!match) return url;

  return `https://www.linkedin.com/jobs/view/${match[1]}/`;
}
