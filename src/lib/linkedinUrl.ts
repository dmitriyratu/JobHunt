// Shared by both the server-side fetch (src/lib/parsers/html.ts) and the
// client-side URL input (JobDescriptionInput) — kept dependency-free (no
// cheerio) so it's safe to import from a client component.

export function isLinkedInHostname(hostname: string): boolean {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

/**
 * The posting id a LinkedIn URL is pointing at, whatever shape it arrived in.
 *
 * Three of them turn up in practice:
 *
 *   /jobs/view/4421177835/                      the permalink
 *   /jobs/view/senior-x-at-acme-4421177835      the same, with a slug
 *   /jobs/search-results/?currentJobId=4421177835&eBP=…&refId=…
 *
 * The last is what you get from copying the address bar while browsing search
 * results, which is how anyone actually finds a job — and it is the one that
 * doesn't work, because the page is a snapshot of your own signed-in session
 * rather than a public document. The id inside it, though, is the same id, and
 * the permalink built from it is public.
 *
 * The path wins over the query parameter. On a search page currentJobId is the
 * posting you have selected; on a view page the path is the posting and any
 * currentJobId is left over from wherever you clicked in from.
 */
function postingIdFrom(parsed: URL): string | null {
  // Also matches /comm/jobs/view/… , which is the shape LinkedIn's own emails
  // use.
  const segment = parsed.pathname.match(/\/jobs\/view\/([^/?#]+)/)?.[1];
  const fromPath = segment?.match(/(\d+)$/)?.[1];
  if (fromPath) return fromPath;

  const fromQuery = parsed.searchParams.get("currentJobId");
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  return null;
}

// LinkedIn job links carry a long tail of session/tracking query params (eBP,
// refId, trackingId, alternateChannel, ...) that aren't needed to load the
// posting and just clutter the input/stored source — reduce to the stable
// permalink shape, e.g. https://www.linkedin.com/jobs/view/4421177835/
//
// Called before the sign-in-wall check in parsers/html.ts, so recovering an id
// here is also what turns a search-results URL from an error into a fetch.
export function canonicalizeLinkedInUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isLinkedInHostname(parsed.hostname)) return url;

  const id = postingIdFrom(parsed);
  if (!id) return url;

  return `https://www.linkedin.com/jobs/view/${id}/`;
}
