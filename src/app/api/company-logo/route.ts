import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Wikimedia asks for a descriptive User-Agent and rate-limits anonymous
// bursts (observed 429s while testing), so every lookup is memoized for the
// life of the server process on top of the client-side cache.
const USER_AGENT = "JobHunt/1.0 (personal job application assistant)";

/**
 * Successful answers are kept for the life of the process. "No logo" answers
 * expire, because the two ways of getting one are indistinguishable to the
 * caller: the company genuinely has no logo on Wikidata, or a request was
 * rate-limited. Caching the second forever means one unlucky burst deletes a
 * company's logo until the server restarts.
 */
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { logoUrl: string | null; expires: number }>();

type Fetched = { ok: true; data: unknown } | { ok: false };

async function wikimedia(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

type SearchResponse = { search?: { id?: string }[] };
type ClaimsResponse = {
  claims?: { P154?: { mainsnak?: { datavalue?: { value?: string } } }[] };
};

/**
 * Name spellings to try, most faithful first.
 *
 * Wikidata's search is unforgiving about how a company styles itself.
 * "NewYork-Presbyterian" — the hospital's own branding, and what the posting
 * says — returns nothing, while "New York-Presbyterian" resolves immediately.
 */
function nameVariants(name: string): string[] {
  const out = [name];

  // Split run-together capitals: "NewYork-Presbyterian" -> "New York-Presbyterian".
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (spaced !== name) out.push(spaced);

  // Drop a corporate suffix: "Acme Health, Inc." -> "Acme Health".
  const desuffixed = spaced
    .replace(/[,‑–—-]?\s*\b(inc|llc|ltd|corp|corporation|co|plc|gmbh|holdings|group)\b\.?\s*$/i, "")
    .trim();
  if (desuffixed && !out.includes(desuffixed)) out.push(desuffixed);

  return out.slice(0, 3);
}

/** Total claim lookups per resolution, to keep well clear of the rate limit. */
const MAX_CLAIM_LOOKUPS = 3;

type Resolution = { logoUrl: string | null; reliable: boolean };

/**
 * Resolves a company name to its logo via Wikidata property P154 ("logo
 * image"). Wikipedia's page-summary thumbnail is deliberately NOT used — for
 * companies it returns whatever lead image the article has, which in practice
 * is a photo of headquarters (Bloomberg, Stripe) or a product screenshot
 * (Netflix) rather than a logo.
 *
 * `reliable` is false when any request failed, so the caller can decline to
 * remember a "no logo" that was really a network blip.
 */
async function findLogoUrl(name: string): Promise<Resolution> {
  let reliable = true;
  let lookups = 0;

  for (const variant of nameVariants(name)) {
    const searchUrl =
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json" +
      `&language=en&type=item&limit=3&search=${encodeURIComponent(variant)}`;
    const search = await wikimedia(searchUrl);
    if (!search.ok) {
      reliable = false;
      continue;
    }

    const ids = ((search.data as SearchResponse).search ?? [])
      .map((s) => s.id)
      .filter((id): id is string => Boolean(id));
    if (!ids.length) continue; // unknown spelling — try the next one

    // The top hit is often a related entity with no logo (a subsidiary, a film
    // about the company), so walk a couple rather than giving up on the first.
    for (const qid of ids) {
      if (lookups >= MAX_CLAIM_LOOKUPS) return { logoUrl: null, reliable };
      lookups += 1;

      const claims = await wikimedia(
        "https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json" +
          `&property=P154&entity=${encodeURIComponent(qid)}`
      );
      if (!claims.ok) {
        reliable = false;
        continue;
      }
      const filename = (claims.data as ClaimsResponse).claims?.P154?.[0]?.mainsnak?.datavalue
        ?.value;
      if (typeof filename === "string" && filename) {
        // Special:FilePath rasterizes SVG logos to transparent PNG.
        return {
          logoUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
            filename
          )}?width=256`,
          reliable,
        };
      }
    }
  }

  return { logoUrl: null, reliable };
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json({ logoUrl: hit.logoUrl });
  }

  const { logoUrl, reliable } = await findLogoUrl(name);

  if (logoUrl) {
    cache.set(key, { logoUrl, expires: Infinity });
  } else if (reliable) {
    cache.set(key, { logoUrl: null, expires: Date.now() + NEGATIVE_TTL_MS });
  }
  // An unreliable miss is not cached at all, so the next view retries.

  return NextResponse.json({ logoUrl });
}
