import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (compatible; JobHuntBot/1.0; +https://github.com/jobhunt)";

// These sites require a signed-in session and/or JS rendering to show the
// actual posting — an unauthenticated fetch just gets the sign-in page shell,
// which silently pollutes the job description with login-wall boilerplate
// instead of failing loudly. Fail fast with a clear message instead.
const AUTH_WALLED_DOMAINS = ["linkedin.com", "indeed.com", "glassdoor.com"];

function isAuthWalledUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return AUTH_WALLED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

export async function fetchAndExtractText(url: string): Promise<string> {
  if (isAuthWalledUrl(url)) {
    throw new Error(
      "This site requires you to be signed in, so the job description can't be fetched automatically. Copy the posting text and paste it instead."
    );
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
    return body.trim();
  }

  const $ = cheerio.load(body);
  $("script, style, nav, footer, header, noscript, iframe").remove();

  const main =
    $("main").text() ||
    $('[role="main"]').text() ||
    $("article").text() ||
    $(".job-description, .description, #job-description").text() ||
    $("body").text();

  const cleaned = main.replace(/\s+/g, " ").trim();
  if (cleaned.length < 50) {
    throw new Error(
      "Could not extract enough text from this page. Try pasting the job description manually."
    );
  }

  return cleaned;
}
