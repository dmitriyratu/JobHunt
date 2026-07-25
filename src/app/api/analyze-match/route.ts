import { NextRequest, NextResponse } from "next/server";
import type { ModelTier } from "@/lib/models";
import { getOpenAIClient, resolveModel } from "@/lib/openai";
import { computeOverallScore } from "@/lib/matchReport";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type {
  MatchReport,
  MatchReportItem,
  MatchStatus,
  RequirementImportance,
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
4. Do NOT invent experience, skills, or credentials not present in the resume. If there is no evidence, use status "gap" and leave evidence empty.
5. Write a 2-3 sentence overall summary of the candidate's fit.
6. If the hiring company's name is clearly stated in the job description, extract it. Otherwise leave it as an empty string — do not guess.

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
    evidence: { type: "string" },
    note: { type: "string" },
  },
  required: ["requirement", "importance", "status", "evidence", "note"],
  additionalProperties: false,
} as const;

const MATCH_REPORT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    company: { type: "string" },
    items: {
      type: "array",
      items: REQUIREMENT_ITEM_SCHEMA,
    },
  },
  required: ["summary", "company", "items"],
  additionalProperties: false,
} as const;

type RawReportItem = {
  requirement: string;
  importance: string;
  status: string;
  evidence: string;
  note: string;
};

type RawReport = {
  summary: string;
  company: string;
  items: RawReportItem[];
};

const VALID_IMPORTANCE: RequirementImportance[] = [
  "critical",
  "important",
  "nice-to-have",
];
const VALID_STATUS: MatchStatus[] = ["match", "partial", "gap"];

function truncate(text: string): { text: string; wasTruncated: boolean } {
  if (text.length <= MAX_INPUT_CHARS) return { text, wasTruncated: false };
  return { text: text.slice(0, MAX_INPUT_CHARS), wasTruncated: true };
}

type AnalyzeRequest = {
  resumeText: string;
  jobDescription: string;
  apiKey?: string;
  modelTier?: ModelTier;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const { resumeText, jobDescription, apiKey, modelTier } = body;

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
    const model = resolveModel(modelTier);

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
      model,
      schemaName: "match_report",
      schema: MATCH_REPORT_SCHEMA,
      temperature: 0.3,
      maxTokens: 2500,
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
      .map((item, i) => ({
        id: `r${i + 1}`,
        requirement: item.requirement.trim(),
        importance: item.importance as RequirementImportance,
        status: item.status as MatchStatus,
        evidence: item.evidence?.trim() ?? "",
        note: item.note?.trim() ?? "",
      }));

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any requirements from the job description." },
        { status: 502 }
      );
    }

    const report: MatchReport = {
      items,
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
      usage: { model, ...usage },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze match";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
