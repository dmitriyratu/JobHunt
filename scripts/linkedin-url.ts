/**
 * Turns LinkedIn job URLs into the public permalink the app can actually fetch.
 *
 *   npm run linkedin -- "<url>" ["<url>" ...]   convert the arguments
 *   ... | npm run linkedin                      convert a list on stdin
 *   npm run check:linkedin                      run the table of known shapes
 *
 * You mostly won't need this: canonicalizeLinkedInUrl runs inside the app, both
 * as you type into the URL box and again server-side before the fetch, so
 * pasting a search-results URL now just works. This is here for converting a
 * list in bulk, and for the self-test — the URL shapes are LinkedIn's to change
 * and nothing else in the repo would notice if they did.
 */

import { canonicalizeLinkedInUrl } from "@/lib/linkedinUrl";

/** Shape in, expected permalink out. */
const CASES: Array<[string, string]> = [
  // The one that sent us here: copied from the address bar while browsing
  // search results, with a session-length tail of tracking parameters.
  [
    "https://www.linkedin.com/jobs/search-results/?currentJobId=4282107574&eBP=CwEAAAGfxhi5QjC&refId=5Rqth%3D%3D&keywords=senior%20data%20scientist&origin=PREFERENCES_LANDING&geoId=102571732",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // The other panes that use currentJobId the same way.
  [
    "https://www.linkedin.com/jobs/search/?currentJobId=4282107574&geoId=103644278",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  [
    "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4282107574",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // Already a permalink, with and without the tracking tail.
  ["https://www.linkedin.com/jobs/view/4282107574/", "https://www.linkedin.com/jobs/view/4282107574/"],
  [
    "https://www.linkedin.com/jobs/view/4282107574/?refId=abc&trackingId=xyz%3D%3D",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // The slug form, which the old path-anchored regex did not match.
  [
    "https://www.linkedin.com/jobs/view/senior-data-scientist-at-acme-4282107574",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // LinkedIn's own notification emails.
  [
    "https://www.linkedin.com/comm/jobs/view/4282107574/?trk=eml-jobs_alert",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // Regional and bare hosts.
  ["https://uk.linkedin.com/jobs/view/4282107574/", "https://www.linkedin.com/jobs/view/4282107574/"],
  // A path wins over a leftover currentJobId from wherever you clicked in from.
  [
    "https://www.linkedin.com/jobs/view/4282107574/?currentJobId=9999999999",
    "https://www.linkedin.com/jobs/view/4282107574/",
  ],
  // Left alone: no posting id to recover, and not LinkedIn at all.
  [
    "https://www.linkedin.com/company/acme/jobs/",
    "https://www.linkedin.com/company/acme/jobs/",
  ],
  ["https://boards.greenhouse.io/acme/jobs/12345", "https://boards.greenhouse.io/acme/jobs/12345"],
  ["not a url at all", "not a url at all"],
];

function selfTest(): number {
  let failed = 0;
  for (const [input, expected] of CASES) {
    const actual = canonicalizeLinkedInUrl(input);
    if (actual === expected) continue;
    failed++;
    console.error(`FAIL  ${input}\n  expected ${expected}\n  got      ${actual}`);
  }
  console.log(`${CASES.length - failed}/${CASES.length} LinkedIn URL shapes canonicalize correctly`);
  return failed;
}

async function readStdin(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--test")) {
    process.exit(selfTest() > 0 ? 1 : 0);
  }

  const inputs = (args.length ? args : await readStdin()).map((l) => l.trim()).filter(Boolean);

  if (!inputs.length) {
    console.error('Usage: npm run linkedin -- "<linkedin url>" [...]   (or pipe a list on stdin)');
    process.exit(2);
  }

  for (const input of inputs) {
    const canonical = canonicalizeLinkedInUrl(input);
    console.log(canonical);
    // Nothing was recovered and it is a LinkedIn URL — worth saying so, because
    // the app will refuse this one too.
    if (canonical === input && /linkedin\.com/i.test(input) && !/\/jobs\/view\//.test(input)) {
      console.error("  ^ no posting id in that URL; open the job itself and copy the address again");
    }
  }
}

void main();
