import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Wikimedia asks for a descriptive User-Agent and rate-limits anonymous
// bursts (observed 429s while testing), so every lookup is memoized for the
// life of the server process on top of the client-side cache.
const USER_AGENT = "JobHunt/1.0 (personal job application assistant)";
const cache = new Map<string, string | null>();

async function wikimedia(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type SearchResponse = { search?: { id?: string }[] };
type ClaimsResponse = {
  claims?: { P154?: { mainsnak?: { datavalue?: { value?: string } } }[] };
};

/**
 * Resolves a company name to its logo via Wikidata property P154 ("logo
 * image"). Wikipedia's page-summary thumbnail is deliberately NOT used — for
 * companies it returns whatever lead image the article has, which in practice
 * is a photo of headquarters (Bloomberg, Stripe) or a product screenshot
 * (Netflix) rather than a logo.
 */
async function findLogoUrl(name: string): Promise<string | null> {
  const searchUrl =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json" +
    `&language=en&type=item&limit=1&search=${encodeURIComponent(name)}`;
  const search = (await wikimedia(searchUrl)) as SearchResponse | null;
  const qid = search?.search?.[0]?.id;
  if (!qid) return null;

  const claimsUrl =
    "https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json" +
    `&property=P154&entity=${encodeURIComponent(qid)}`;
  const claims = (await wikimedia(claimsUrl)) as ClaimsResponse | null;
  const filename = claims?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  if (!filename || typeof filename !== "string") return null;

  // Special:FilePath rasterizes SVG logos to transparent PNG.
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    filename
  )}?width=256`;
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const key = name.toLowerCase();
  if (cache.has(key)) {
    return NextResponse.json({ logoUrl: cache.get(key) ?? null });
  }

  const logoUrl = await findLogoUrl(name);
  cache.set(key, logoUrl);
  return NextResponse.json({ logoUrl });
}
