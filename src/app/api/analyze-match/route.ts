import { NextRequest, NextResponse } from "next/server";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { computeOverallScore } from "@/lib/matchReport";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type {
  MatchReport,
  MatchReportItem,
  MatchStatus,
  RequirementImportance,
  StandoutItem,
} from "@/types";

export const runtime = "nodejs";

const MAX_INPUT_CHARS = 12000;

const SYSTEM_PROMPT = `You are an expert recruiter and resume analyst. Compare a candidate's resume against a job description and produce a weighted match report.

Steps:
1. Extract the 8-14 most distinguishing requirements/qualifications from the job description (skills, years of experience, education, certifications, domain knowledge, tools). Prefer specific, checkable requirements over vague ones.
2. Classify each requirement's importance:
   - "critical": explicitly required/must-have, or repeatedly emphasized, or a hard quantified threshold (e.g. "5+ years")
   - "important": clearly expected but not framed as a hard requirement
   - "nice-to-have": listed as preferred/bonus/a plus
3. For each requirement, compare strictly against the resume text:
   - "match": the resume clearly demonstrates this
   - "partial": the resume shows related or weaker evidence
   - "gap": the resume shows no evidence of this
4. Set "strength" for each requirement:
   - "exceeds": the candidate clears this bar by a wide, defensible margin — roughly double a quantified threshold, or seniority/scale/ownership well beyond what was asked (e.g. posting wants "5+ years", resume shows 12 and leading the function; posting wants "familiarity with Kafka", resume shows designing the streaming platform).
   - "meets": everything else. Use "meets" whenever status is "partial" or "gap", and whenever the candidate simply satisfies the requirement.
   Be strict — "exceeds" is only useful if it is rare. If most items are "exceeds", you are applying it too loosely.
5. Extract up to 4 "standouts": credentials in the resume that are genuinely rare or highly prized but that the job description never asked for. Good candidates are patents, founding or selling a company, widely used open-source work, notable awards or publications, unusually prestigious employers or programs, or a rare combination of domains. For each, set "credential" (the thing itself), "evidence" (support drawn from the resume), and "whyValuable" (one sentence on why a hiring team would care even though they didn't ask).
   Standouts must come from the resume. If nothing in it is genuinely exceptional, return an empty array — an empty list is the correct and common answer. Do NOT pad this with ordinary skills, restatements of requirements already covered above, or generic strengths like "strong communicator".
6. "evidence" quotes or closely paraphrases the supporting line from the resume. "note" is a short assessment written FOR THE CANDIDATE about how they stack up on that requirement.
   The note must never describe your own labelling. Do not mention the fields, the words "match", "partial", "gap", "meets" or "exceeds", the schema, or why you chose a value — a note like "exceeds the minimum but not by a wide enough margin to mark as exceeds" is internal reasoning leaking into the report. Write what the reader needs to know about the fit itself, or leave the note empty.
7. Write a 2-3 sentence overall summary of the candidate's fit.
8. If the hiring company's name is clearly stated in the job description, extract it into "company". Otherwise leave it as an empty string — do not guess.
9. Extract the job title exactly as written in the posting (e.g. "Senior Backend Engineer") into "jobTitle". If it is not stated, use an empty string — do not guess.
10. Set "companyDomain" to the company's primary website domain in lowercase, with no protocol and no "www." (e.g. "netflix.com", "stripe.com"). Use the real corporate domain you know for that company, not the job board it was posted on. If you are not confident of the exact domain, use an empty string — a wrong domain is worse than none.

Output strictly matches the provided JSON schema.`;

const REQUIREMENT_ITEM_SCHEMA = {
  type: "object",
  properties: {
    requirement: { type: "string" },
    importance: {
      type: "string",
      enum: ["critical", "important", "nice-to-have"],
    },
    status: { type: "string", enum: ["match", "partial", "gap"] },
    strength: { type: "string", enum: ["meets", "exceeds"] },
    evidence: { type: "string" },
    note: { type: "string" },
  },
  required: ["requirement", "importance", "status", "strength", "evidence", "note"],
  additionalProperties: false,
} as const;

const STANDOUT_ITEM_SCHEMA = {
  type: "object",
  properties: {
    credential: { type: "string" },
    evidence: { type: "string" },
    whyValuable: { type: "string" },
  },
  required: ["credential", "evidence", "whyValuable"],
  additionalProperties: false,
} as const;

const MATCH_REPORT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    company: { type: "string" },
    jobTitle: { type: "string" },
    companyDomain: { type: "string" },
    items: {
      type: "array",
      items: REQUIREMENT_ITEM_SCHEMA,
    },
    standouts: {
      type: "array",
      items: STANDOUT_ITEM_SCHEMA,
    },
  },
  required: [
    "summary",
    "company",
    "jobTitle",
    "companyDomain",
    "items",
    "standouts",
  ],
  additionalProperties: false,
} as const;

type RawReportItem = {
  requirement: string;
  importance: string;
  status: string;
  strength: string;
  evidence: string;
  note: string;
};

type RawStandout = {
  credential: string;
  evidence: string;
  whyValuable: string;
};

type RawReport = {
  summary: string;
  company: string;
  jobTitle: string;
  companyDomain: string;
  items: RawReportItem[];
  standouts: RawStandout[];
};

const VALID_IMPORTANCE: RequirementImportance[] = [
  "critical",
  "important",
  "nice-to-have",
];
const VALID_STATUS: MatchStatus[] = ["match", "partial", "gap"];

/** Standouts are persuasion material, not a checklist — keep the list short. */
const MAX_STANDOUTS = 4;

function truncate(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= MAX_INPUT_CHARS) return { text, wasTruncated: false };
  return { text: text.slice(0, MAX_INPUT_CHARS), wasTruncated: true };
}

type AnalyzeRequest = {
  resumeText: string;
  jobDescription: string;
  apiKey?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const { resumeText, jobDescription, apiKey } = body;

    if (!resumeText?.trim()) {
      return NextResponse.json(
        { error: "Resume is required. Upload your resume first." },
        { status: 400 }
      );
    }
    if (!jobDescription?.trim()) {
      return NextResponse.json(
        { error: "Job description is required." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient(apiKey);
    const taskModel = getTaskModel("analyze-match");

    const resume = truncate(resumeText.trim());
    const jobDesc = truncate(jobDescription.trim());

    const userPromptParts = [
      "## Candidate Resume" +
        (resume.wasTruncated ? " (truncated)" : "") +
        "\n" +
        resume.text,
      "## Job Description" +
        (jobDesc.wasTruncated ? " (truncated)" : "") +
        "\n" +
        jobDesc.text,
    ];

    const { result: raw, usage } = await createStructuredCompletion<RawReport>(client, {
      model: taskModel.id,
      schemaName: "match_report",
      schema: MATCH_REPORT_SCHEMA,
      temperature: 0.3,
      supportsTemperature: taskModel.supportsTemperature,
      maxTokens: 3000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPromptParts.join("\n\n") },
      ],
    });

    const items: MatchReportItem[] = raw.items
      .filter(
        (item) =>
          item.requirement?.trim() &&
          VALID_IMPORTANCE.includes(item.importance as RequirementImportance) &&
          VALID_STATUS.includes(item.status as MatchStatus)
      )
      .map((item, i) => {
        const status = item.status as MatchStatus;
        return {
          id: `r${i + 1}`,
          requirement: item.requirement.trim(),
          importance: item.importance as RequirementImportance,
          status,
          // Overshoot is only meaningful on something you actually match —
          // "exceeds" on a partial or a gap is a contradiction, so normalise.
          strength: status === "match" && item.strength === "exceeds" ? "exceeds" : "meets",
          evidence: item.evidence?.trim() ?? "",
          note: item.note?.trim() ?? "",
        };
      });

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any requirements from the job description." },
        { status: 502 }
      );
    }

    // An empty standouts list is a legitimate, common result — most résumés
    // hold nothing genuinely rare, and padding it would be worse than silence.
    const standouts: StandoutItem[] = (raw.standouts ?? [])
      .filter((s) => s.credential?.trim())
      .slice(0, MAX_STANDOUTS)
      .map((s, i) => ({
        id: `s${i + 1}`,
        credential: s.credential.trim(),
        evidence: s.evidence?.trim() ?? "",
        whyValuable: s.whyValuable?.trim() ?? "",
      }));

    const report: MatchReport = {
      items,
      standouts,
      overallScore: computeOverallScore(items),
      summary: raw.summary?.trim() ?? "",
      generatedAt: new Date().toISOString(),
      sourceSnapshot: {
        resumeLength: resumeText.trim().length,
        jobDescLength: jobDescription.trim().length,
      },
    };

    return NextResponse.json({
      report,
      company: raw.company?.trim() ?? "",
      jobTitle: raw.jobTitle?.trim() ?? "",
      companyDomain: (raw.companyDomain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""),
      usage: { model: taskModel.id, ...usage },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze match";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
