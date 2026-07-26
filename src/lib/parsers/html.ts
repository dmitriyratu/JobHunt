import * as cheerio from "cheerio";
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

// LinkedIn's logged-out job pages DO serve the full posting — it lives in
// `.description__text--rich` (with the body copy inside
// `.show-more-less-html__markup`). The surrounding page is thick with
// sign-in nav/modals, so a generic "grab the body text" pass returns mostly
// login chrome and buries the real content. Target the posting elements
// directly instead, and assemble a clean title/company/criteria/body block.
function extractLinkedInJob($: cheerio.CheerioAPI): string | null {
  const body = $(".show-more-less-html__markup, .description__text--rich, .description__text")
    .first()
    .text()
    .replace(/[ \t]+/g, " ")
    .trim();

  if (body.length < 200) return null;

  const title = $("h1").first().text().trim();
  const company = $("a.topcard__org-name-link, .topcard__flavor").first().text().replace(/\s+/g, " ").trim();
  const criteria = $(".description__job-criteria-item")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  const parts = [
    title && company ? `${title} — ${company}` : title || company,
    criteria.length ? criteria.join(" · ") : "",
    body,
  ].filter(Boolean);

  return parts.join("\n\n");
}

export async function fetchAndExtractText(rawUrl: string): Promise<FetchedJobDescription> {
  const url = canonicalizeLinkedInUrl(rawUrl);

  const reason = blockedReason(url);
  if (reason) {
    throw new Error(reason);
  }

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}): ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();

  if (contentType.includes("application/pdf")) {
    throw new Error(
      "This URL points to a PDF. Download the file and upload it instead."
    );
  }

  if (contentType.includes("text/plain")) {
    return { text: body.trim(), url };
  }

  const $ = cheerio.load(body);

  // Site-specific extraction first — when we can target the posting element
  // precisely, the surrounding sign-in chrome is irrelevant, so the
  // login-wall heuristic (which only exists to catch the generic case
  // scraping a whole login page) doesn't apply.
  if (isLinkedInHostname(new URL(url).hostname.toLowerCase())) {
    const linkedInJob = extractLinkedInJob($);
    if (linkedInJob) {
      return { text: linkedInJob, url };
    }
  }

  $("script, style, nav, footer, header, noscript, iframe").remove();

  const main =
    $("main").text() ||
    $('[role="main"]').text() ||
    $("article").text() ||
    $(".job-description, .description, #job-description").text() ||
    $("body").text();

  const cleaned = main.replace(/\s+/g, " ").trim();
  if (cleaned.length < 50 || looksLikeLoginWall(cleaned)) {
    throw new Error(
      "Could not extract the posting from this page — it likely requires signing in to view. Try pasting the job description manually."
    );
  }

  return { text: cleaned, url };
}
