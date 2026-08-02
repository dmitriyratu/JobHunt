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
 * Wikidata only has an item — let alone a P154 logo on it — for companies
 * notable enough to have been written up. Most employers aren't: AvePoint has
 * an item (Q4827929) with no logo claim at all, so the wordmark path can never
 * succeed for it no matter how the name is spelled.
 *
 * DuckDuckGo's icon service fills the gap from the company's own site. It is a
 * favicon rather than a wordmark, so it stays a fallback — but a real mark
 * beats initials. Crucially it 404s on a domain it has nothing for, which
 * Google's equivalent does not: that one answers 200 with a generic globe, and
 * a globe on every card is worse than a letter. Clearbit, the usual third
 * option, no longer resolves at all.
 */
function iconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/** "https://www.AvePoint.com/careers" -> "avepoint.com"; "" when it isn't a host. */
function normalizeDomain(raw: string): string {
  const bare = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) && /\.[a-z]{2,}$/.test(bare) ? bare : "";
}

/**
 * The company's likely own domain, for postings analyzed before the domain
 * field existed — or never analyzed at all, which is every card until the match
 * report runs.
 *
 * Short slugs are skipped deliberately. "Apex" or "Meta" collapse onto domains
 * owned by someone else entirely, and a confidently wrong logo is worse than
 * the initials; anything that short is also the kind of name Wikidata already
 * covers. A guess that belongs to nobody just 404s and costs one request.
 */
function guessDomain(name: string): string {
  const slug = nameVariants(name).at(-1)!.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length >= 5 ? `${slug}.com` : "";
}

/** True when the icon service actually has a mark for this domain. */
async function hasIcon(domain: string): Promise<boolean> {
  try {
    const res = await fetch(iconUrl(domain), {
      method: "HEAD",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
  const params = request.nextUrl.searchParams;
  const name = params.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  // The domain the match report detected, when there is one. Authoritative
  // where it exists — it was read off the posting rather than guessed here.
  const known = normalizeDomain(params.get("domain") ?? "");

  // The answer depends on the domain too, so it is part of the key. Without
  // that, a card cached as "no logo" before its posting was analyzed would keep
  // answering "no logo" after the domain arrived.
  const key = `${name.toLowerCase()}|${known}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json({ logoUrl: hit.logoUrl, reliable: true });
  }

  const wikidata = await findLogoUrl(name);
  let { logoUrl } = wikidata;
  const { reliable } = wikidata;

  // Wordmark first, favicon second: Wikidata gives a wide brand lockup that
  // reads as the company, the icon service gives a 32px square.
  if (!logoUrl) {
    for (const domain of [known, guessDomain(name)]) {
      if (!domain) continue;
      if (await hasIcon(domain)) {
        logoUrl = iconUrl(domain);
        break;
      }
    }
  }

  if (logoUrl) {
    cache.set(key, { logoUrl, expires: Infinity });
  } else if (reliable) {
    cache.set(key, { logoUrl: null, expires: Date.now() + NEGATIVE_TTL_MS });
  }
  // An unreliable miss is not cached at all, so the next view retries.

  // `reliable` goes out with the answer: the client caches too, and it was
  // storing rate-limited misses for six hours because it could not tell them
  // apart from a company that genuinely has no logo.
  return NextResponse.json({ logoUrl, reliable });
}
