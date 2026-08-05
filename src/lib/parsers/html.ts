import * as cheerio from "cheerio";
import { blockText } from "@/lib/parsers/blockText";
import { canonicalizeLinkedInUrl, isLinkedInHostname } from "@/lib/linkedinUrl";

const USER_AGENT =
  "Mozilla/5.0 (compatible; JobHuntBot/1.0; +https://github.com/jobhunt)";

// Indeed/Glassdoor gate their job postings behind a signed-in session for
// any automated request — an unauthenticated fetch just gets a sign-in page
// shell. Fail fast with a clear message instead of silently ingesting that.
const AUTH_WALLED_DOMAINS = ["indeed.com", "glassdoor.com"];

// LinkedIn is different: direct job permalinks (/jobs/view/<id>) are the one
// URL shape it intentionally renders for logged-out visitors and search
// engines (that's why they're the ones people share). Every other LinkedIn
// path — search results, the feed, messaging, profile pages — only resolves
// inside an active logged-in session; a URL like
// "/jobs/search-results/?currentJobId=..." is a snapshot of *your own*
// session's search UI, not a stable public page, and requesting it without
// your session cookies just returns LinkedIn's sign-in shell. So: allow an
// attempt at /jobs/view/, block everything else on the domain up front.
const LINKEDIN_PUBLIC_PATH = /^\/jobs\/view\//;

function blockedReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase();

  if (isLinkedInHostname(hostname) && !LINKEDIN_PUBLIC_PATH.test(parsed.pathname)) {
    return "This LinkedIn page requires you to be signed in — only direct job posting links (linkedin.com/jobs/view/...) are public. Copy the posting text and paste it instead.";
  }

  if (AUTH_WALLED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return "This site requires you to be signed in, so the job description can't be fetched automatically. Copy the posting text and paste it instead.";
  }

  return null;
}

// Even on an allowed URL shape, the fetch can still land on a sign-in wall —
// bot detection, a session-expired redirect, or (observed directly) LinkedIn
// serving an unrelated job's title plus the login-wall boilerplate padded out
// past any reasonable length cutoff. So this always runs, regardless of how
// long the page is — a real posting essentially never contains 2+ of these
// account-flow phrases, no matter its length.
function looksLikeLoginWall(text: string): boolean {
  const signals = [
    "sign in",
    "forgot password",
    "join now",
    "welcome back",
    "join linkedin",
    "new to linkedin",
    "create your free account",
  ];
  const lower = text.toLowerCase();
  return signals.filter((s) => lower.includes(s)).length >= 2;
}

export type FetchedJobDescription = {
  text: string;
  url: string;
};

/**
 * A user-facing message for a request that died below HTTP.
 *
 * `fetch` rejects with a bare `TypeError: fetch failed` for everything in that
 * class — DNS, TLS, a reset connection, wifi dropping for a second — and the
 * route hands `error.message` straight to the UI, so "fetch failed" is what the
 * user reads. As an error message it's a dead end: it names no cause and gives
 * no hint that the very same click would likely succeed on a retry. Timeouts
 * reject separately, as a DOMException with equally opaque wording. Both get
 * translated here; every other throw in this file already says exactly what
 * happened and is left alone.
 */
function networkErrorMessage(error: unknown, url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    host = "that site";
  }

  if (error instanceof Error && error.name === "TimeoutError") {
    return `${host} took longer than 15 seconds to respond. Try again, or paste the job description text instead.`;
  }

  return `Couldn't reach ${host} — the network request failed before the page finished loading. Check your connection and try again, or paste the job description text instead.`;
}

// LinkedIn's logged-out job pages DO serve the full posting — it lives in
// `.description__text--rich` (with the body copy inside
// `.show-more-less-html__markup`). The surrounding page is thick with
// sign-in nav/modals, so a generic "grab the body text" pass returns mostly
// login chrome and buries the real content. Target the posting elements
// directly instead, and assemble a clean title/company/criteria/body block.
function extractLinkedInJob($: cheerio.CheerioAPI): string | null {
  // `blockText`, not `.text()` — the posting body is the one part of the page
  // that is genuinely structured (headings, paragraphs, bulleted requirements),
  // and `.text()` is exactly the pass that discards all of it.
  const body = blockText(
    $(".show-more-less-html__markup, .description__text--rich, .description__text")
      .first()
      .toArray()
  );

  if (body.length < 200) return null;

  const title = $("h1").first().text().trim();
  const company = $("a.topcard__org-name-link, .topcard__flavor").first().text().replace(/\s+/g, " ").trim();
  // Each criteria item is a label above a value ("Seniority level" /
  // "Mid-Senior level"). Flattened together they read as one nonsense phrase —
  // "Seniority level Mid-Senior level" — so the pair is rejoined with a colon,
  // which is how the page itself presents it visually.
  const criteria = $(".description__job-criteria-item")
    .map((_, el) => {
      const label = $(el).find(".description__job-criteria-subheader").text().replace(/\s+/g, " ").trim();
      const value = $(el).find(".description__job-criteria-text").text().replace(/\s+/g, " ").trim();
      if (label && value) return `${label}: ${value}`;
      return $(el).text().replace(/\s+/g, " ").trim();
    })
    .get()
    .filter(Boolean);

  const parts = [
    title && company ? `${title} — ${company}` : title || company,
    criteria.length ? criteria.join(" · ") : "",
    body,
  ].filter(Boolean);

  return parts.join("\n\n");
}

/**
 * The identifying segment of a job URL — the numeric id or uuid that names one
 * specific posting, e.g. "8450776002" in /remesh/jobs/8450776002.
 */
function postingId(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (/^\d{4,}$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return s;
  }
  return null;
}

/**
 * True when a link to one specific posting ended up somewhere else.
 *
 * Job boards quietly 302 expired or filled postings to a board index or the
 * company's careers marketing page. `fetch` follows that without complaint, so
 * without this check the app extracts whatever it landed on and analyses the
 * candidate against the wrong document — a silently wrong report, which is far
 * worse than an error. Only fires when the original URL actually named a
 * posting, so ordinary redirects (http→https, trailing slash, canonical host)
 * pass through untouched.
 */
function redirectedAwayFromPosting(requested: string, final: string): boolean {
  let a: URL, b: URL;
  try {
    a = new URL(requested);
    b = new URL(final);
  } catch {
    return false;
  }
  const id = postingId(a.pathname);
  if (!id) return false;
  return !b.pathname.includes(id);
}

export async function fetchAndExtractText(rawUrl: string): Promise<FetchedJobDescription> {
  const url = canonicalizeLinkedInUrl(rawUrl);

  const reason = blockedReason(url);
  if (reason) {
    throw new Error(reason);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    // Keep the original as `cause` — the underlying code (ENOTFOUND,
    // ECONNRESET, ...) is what makes this diagnosable in the server log, and
    // only the `message` is sent to the browser.
    throw new Error(networkErrorMessage(error, url), { cause: error });
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }

  // Track where we actually ended up, not where we aimed.
  const finalUrl = response.url || url;
  if (redirectedAwayFromPosting(url, finalUrl)) {
    throw new Error(
      "That link redirected away from the job posting — the listing has probably been filled or removed. Open the link to check, or paste the job description text instead."
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  // The headers arriving doesn't mean the body will. A connection dropped
  // mid-stream rejects here instead, with its own unhelpful wording
  // ("terminated"), so it needs the same translation.
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new Error(networkErrorMessage(error, finalUrl), { cause: error });
  }

  if (contentType.includes("application/pdf")) {
    throw new Error(
      "This URL points to a PDF. Download the file and upload it instead."
    );
  }

  if (contentType.includes("text/plain")) {
    return { text: body.trim(), url: finalUrl };
  }

  const $ = cheerio.load(body);

  // Site-specific extraction first — when we can target the posting element
  // precisely, the surrounding sign-in chrome is irrelevant, so the
  // login-wall heuristic (which only exists to catch the generic case
  // scraping a whole login page) doesn't apply.
  if (isLinkedInHostname(new URL(url).hostname.toLowerCase())) {
    const linkedInJob = extractLinkedInJob($);
    if (linkedInJob) {
      return { text: linkedInJob, url: finalUrl };
    }
  }

  $("script, style, nav, footer, header, noscript, iframe").remove();

  // Selected as elements rather than as text, so the winner can be serialized
  // with its block structure intact. The old chain collapsed every page to a
  // single unbroken line — whatever structure the site had, the app threw away.
  const candidates = ["main", '[role="main"]', "article", ".job-description, .description, #job-description", "body"];
  const selector = candidates.find((s) => $(s).first().text().trim().length > 0);
  const cleaned = selector ? blockText($(selector).first().toArray()) : "";
  if (cleaned.length < 50 || looksLikeLoginWall(cleaned)) {
    throw new Error(
      "Could not extract the posting from this page — it likely requires signing in to view. Try pasting the job description manually."
    );
  }

  return { text: cleaned, url: finalUrl };
}
