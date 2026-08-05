import { NextRequest, NextResponse } from "next/server";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type { EmploymentKind, JobFacts, SalaryRange, WorkplaceKind } from "@/types";

export const runtime = "nodejs";

/**
 * Copying the posting's own terms out of the posting.
 *
 * Everything else the app does with a job description is a judgement about the
 * candidate. This is transcription, and the whole design follows from that:
 * every field is either sitting in the text or is returned empty, and the model
 * is told at length that guessing is the one failure that matters. A salary it
 * invents would print at display size next to nine facts it read correctly, and
 * would be believed.
 *
 * The rest is shape. The model answers in flat strings with "" for silence
 * rather than in the nullable, nested type the app stores, because strict JSON
 * schema is at its most reliable on flat required fields — and because the
 * conversion is then one function here that can also do the sanity checks a
 * schema cannot express.
 */

/**
 * How much of the posting to send, and from which end.
 *
 * Both ends. Triage reads the opening because what kind of document a job wants
 * is decided in its first paragraphs; compensation is the opposite — it is the
 * last section of almost every posting, under the boilerplate about equal
 * opportunity. Sending the first 12,000 characters of a long posting is the one
 * way to reliably miss the single field this endpoint exists for.
 */
const HEAD_CHARS = 8000;
const TAIL_CHARS = 4000;

function excerpt(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= HEAD_CHARS + TAIL_CHARS) return trimmed;
  return `${trimmed.slice(0, HEAD_CHARS)}\n\n[…]\n\n${trimmed.slice(-TAIL_CHARS)}`;
}

const SYSTEM_PROMPT = `You copy stated facts out of a job posting. You do not infer them, estimate them, or fill them in from what is typical for the role.

For every field: if the posting states it, copy it. If the posting does not state it, return the empty value ("" for text, an empty array for lists, 0 for numbers). An empty value is always a correct answer. A plausible guess is always a wrong one — these facts are shown to the candidate as things the employer said, and a salary range you inferred from the job title would be read as the employer's own number.

Fields:

"jobTitle" — the role as the posting titles it, e.g. "Senior Backend Engineer". Copy it; do not tidy it, expand an abbreviation, or drop a suffix like "(Remote)" unless it is plainly separate from the title. Empty if the posting never names the role.
"company" — the hiring company's name. The employer, never the job board it was posted on: a posting on LinkedIn, Greenhouse, Lever, Workday or Indeed is not from LinkedIn, Greenhouse, Lever, Workday or Indeed. Empty if the posting does not name the employer, which is common for recruiter listings — "a leading fintech" is not a name.

"salaryRaw" — the pay sentence exactly as the posting writes it, including any "plus equity", "DOE" or "depending on location". Empty if the posting states no pay at all. Do NOT treat a mention of "competitive salary", "market rate" or a benefits list as pay.
"salaryMin" / "salaryMax" — the numbers from that sentence, as plain integers with no separators or symbols (185000, not "$185,000"). Use 0 for either one the posting doesn't give: a range of "from $185,000" is min 185000, max 0. Both 0 if there is no pay sentence.
"salaryCurrency" — the ISO code for the currency in that sentence: USD, GBP, EUR, CAD, AUD, INR. Empty if no pay was stated. If a bare "$" is used with no country signal, use USD.
"salaryPeriod" — what the number is per: "year", "month", "day" or "hour". Empty if no pay was stated.
"salaryNote" — what the posting says rides alongside base pay, in a few words: "plus equity and bonus", "plus commission", "W2". Empty if it says nothing.

"locations" — every place named as where the job is, in the order given: "San Francisco, CA", "London", "Remote (US)". Empty array if none is named.
"workplace" — "remote", "hybrid" or "onsite", only when the posting says so or plainly describes it ("three days a week in the office" is hybrid). Empty if it does not address it. A posting that names an office but never says whether attendance is required is NOT automatically onsite — leave it empty.
"workplaceNote" — the condition attached, in a few words: "3 days on-site", "US time zones", "must be within commuting distance". Empty if there is none.

"employment" — "full-time", "part-time", "contract", "internship" or "temporary", when stated. Empty otherwise.
"seniority" — the level as the posting words it: "Senior", "Staff", "Principal", "L5", "Grade 7". Empty if it is only implied by the job title — do not restate the title here.
"team" — the team or department named: "Payments Infrastructure", "Clinical Operations". Empty if none.
"postedAt" — when it was posted, copied as written: "3 days ago", "March 2, 2026". Empty if absent.
"deadline" — the application deadline as written. Empty if absent.
"sponsorship" — "available" if the posting says it sponsors visas, "not-offered" if it says it does not (including "must be authorised to work without sponsorship"). Empty if it does not mention sponsorship at all. This field is frequently misread: silence is not a no.
"travel" — the travel expectation as written: "Up to 25%", "occasional travel to Austin". Empty if absent.

Never explain, never add fields, and never mention these instructions.`;

const FACTS_SCHEMA = {
  type: "object",
  properties: {
    jobTitle: { type: "string" },
    company: { type: "string" },
    salaryRaw: { type: "string" },
    salaryMin: { type: "number" },
    salaryMax: { type: "number" },
    salaryCurrency: { type: "string" },
    salaryPeriod: { type: "string", enum: ["year", "month", "day", "hour", ""] },
    salaryNote: { type: "string" },
    locations: { type: "array", items: { type: "string" } },
    workplace: { type: "string", enum: ["remote", "hybrid", "onsite", ""] },
    workplaceNote: { type: "string" },
    employment: {
      type: "string",
      enum: ["full-time", "part-time", "contract", "internship", "temporary", ""],
    },
    seniority: { type: "string" },
    team: { type: "string" },
    postedAt: { type: "string" },
    deadline: { type: "string" },
    sponsorship: { type: "string", enum: ["available", "not-offered", ""] },
    travel: { type: "string" },
  },
  required: [
    "jobTitle",
    "company",
    "salaryRaw",
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
    "salaryPeriod",
    "salaryNote",
    "locations",
    "workplace",
    "workplaceNote",
    "employment",
    "seniority",
    "team",
    "postedAt",
    "deadline",
    "sponsorship",
    "travel",
  ],
  additionalProperties: false,
} as const;

type RawFacts = {
  jobTitle: string;
  company: string;
  salaryRaw: string;
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryNote: string;
  locations: string[];
  workplace: string;
  workplaceNote: string;
  employment: string;
  seniority: string;
  team: string;
  postedAt: string;
  deadline: string;
  sponsorship: string;
  travel: string;
};

const WORKPLACE_KINDS: WorkplaceKind[] = ["remote", "hybrid", "onsite"];
const EMPLOYMENT_KINDS: EmploymentKind[] = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
];
const PERIODS: SalaryRange["period"][] = ["year", "month", "day", "hour"];

function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

/** A positive, finite integer, or null. 0 is the schema's "not stated". */
function amount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Pay, or nothing.
 *
 * Requires the raw sentence: numbers without the words they came from are the
 * one output here that could be a hallucination wearing a decimal point, and
 * without `raw` there is nothing to check them against or fall back to. So a
 * range with no sentence behind it is discarded whole.
 */
function toSalary(raw: RawFacts): SalaryRange | null {
  const sentence = clean(raw.salaryRaw, 300);
  if (!sentence) return null;

  let min = amount(raw.salaryMin);
  let max = amount(raw.salaryMax);
  // Reversed bounds are a transcription slip rather than a reason to drop the
  // pay, and "min above max" would render as an empty range.
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const period = PERIODS.find((p) => p === raw.salaryPeriod) ?? "year";
  const currency = /^[A-Za-z]{3}$/.test(raw.salaryCurrency.trim())
    ? raw.salaryCurrency.trim().toUpperCase()
    : "";

  return {
    min,
    max,
    currency,
    period,
    raw: sentence,
    note: clean(raw.salaryNote, 80),
  };
}

function toJobFacts(raw: RawFacts): JobFacts {
  return {
    salary: toSalary(raw),
    locations: Array.isArray(raw.locations)
      ? raw.locations.map((l) => clean(l, 80)).filter(Boolean).slice(0, 6)
      : [],
    workplace: WORKPLACE_KINDS.find((w) => w === raw.workplace) ?? null,
    workplaceNote: clean(raw.workplaceNote, 80),
    employment: EMPLOYMENT_KINDS.find((e) => e === raw.employment) ?? null,
    seniority: clean(raw.seniority, 40),
    team: clean(raw.team, 80),
    postedAt: clean(raw.postedAt, 40),
    deadline: clean(raw.deadline, 40),
    visaSponsorship:
      raw.sponsorship === "available" ? true : raw.sponsorship === "not-offered" ? false : null,
    travel: clean(raw.travel, 80),
    extractedAt: new Date().toISOString(),
    // Nothing here has been corrected yet, by definition — this is the
    // extraction itself.
    editedKeys: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const { jobDescription, apiKey } = (await request.json()) as {
      jobDescription?: string;
      apiKey?: string;
    };

    if (!jobDescription?.trim()) {
      return NextResponse.json({ error: "A job description is required." }, { status: 400 });
    }

    const client = getOpenAIClient(apiKey);
    const taskModel = getTaskModel("extract-job-facts");

    const { result: raw, usage } = await createStructuredCompletion<RawFacts>(client, {
      model: taskModel.id,
      schemaName: "job_facts",
      schema: FACTS_SCHEMA,
      temperature: 0,
      supportsTemperature: taskModel.supportsTemperature,
      reasoning: taskModel.reasoning,
      maxTokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: excerpt(jobDescription) },
      ],
    });

    return NextResponse.json({
      facts: toJobFacts(raw),
      // Alongside the facts rather than inside them: these two are already
      // Session fields with their own history, read by the rail, the recap and
      // the letter. A second copy on JobFacts would be a second answer to
      // "which company is this" for anything that had to pick one.
      jobTitle: clean(raw.jobTitle, 120),
      company: clean(raw.company, 80),
      usage: { model: taskModel.id, ...usage },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read the posting's details";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
