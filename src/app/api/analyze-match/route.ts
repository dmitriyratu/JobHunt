import { NextRequest, NextResponse } from "next/server";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { computeOverallScore, normaliseGates } from "@/lib/matchReport";
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
5. Mark exactly 1-2 requirements with "gating": true. A gate is what this team would actually screen on — fail it and the candidate is out regardless of how strong the rest looks. This is NOT the same as "critical". Postings label eight things as required; a recruiter working through a stack of applicants filters on one or two. Ask: if a resume were strong everywhere except here, would it still get forwarded? If no, that is the gate. Prefer the requirement that is hardest to fake or acquire — a specific domain, a scale of ownership, a license, a hard threshold — over the one that is merely repeated most often. Set "gating": false on everything else.
   Judge the requirement against the ROLE, not against this candidate. A gate the candidate fails is still the gate, and it is the most useful thing in this report.
6. Set "bridge" only where the candidate's evidence satisfies the requirement in a way a reader would NOT see unaided: a different industry with the same underlying problem, a different tool with the same primitives, a different title with the same scope of ownership. Write one sentence naming both sides of the equivalence and what makes them the same. Leave it as an empty string whenever the match is self-evident (posting wants Python, resume shows six years of Python — no bridge needed). Most items should have an empty bridge; it earns its place most often on "partial" items and on gates.
   A bridge asserts that two real things are equivalent. Never invent either side, and never overstate the equivalence — if the connection needs a qualifier to be true, write the qualifier.
7. Extract up to 4 "standouts": credentials in the resume that are genuinely rare or highly prized but that the job description never asked for. Good candidates are patents, founding or selling a company, widely used open-source work, notable awards or publications, unusually prestigious employers or programs, or a rare combination of domains. For each, set "credential" (the thing itself), "evidence" (support drawn from the resume), and "whyValuable" (one sentence on why a hiring team would care even though they didn't ask).
   Standouts must come from the resume. If nothing in it is genuinely exceptional, return an empty array — an empty list is the correct and common answer. Do NOT pad this with ordinary skills, restatements of requirements already covered above, or generic strengths like "strong communicator".
8. "evidence" quotes or closely paraphrases the supporting line from the resume. "note" is a short assessment written FOR THE CANDIDATE about how they stack up on that requirement.
   The note must never describe your own labelling. Do not mention the fields, the words "match", "partial", "gap", "meets", "exceeds" or "gating", the schema, or why you chose a value — a note like "exceeds the minimum but not by a wide enough margin to mark as exceeds" is internal reasoning leaking into the report. Write what the reader needs to know about the fit itself, or leave the note empty.
9. Write a 2-3 sentence overall summary of the candidate's fit.
10. If the hiring company's name is clearly stated in the job description, extract it into "company". Otherwise leave it as an empty string — do not guess.
11. Extract the job title exactly as written in the posting (e.g. "Senior Backend Engineer") into "jobTitle". If it is not stated, use an empty string — do not guess.
12. Set "companyDomain" to the company's primary website domain in lowercase, with no protocol and no "www." (e.g. "netflix.com", "stripe.com"). Use the real corporate domain you know for that company, not the job board it was posted on. If you are not confident of the exact domain, use an empty string — a wrong domain is worse than none.

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
    gating: { type: "boolean" },
    evidence: { type: "string" },
    bridge: { type: "string" },
    note: { type: "string" },
  },
  required: [
    "requirement",
    "importance",
    "status",
    "strength",
    "gating",
    "evidence",
    "bridge",
    "note",
  ],
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
  gating: boolean;
  evidence: string;
  bridge: string;
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
      // Headroom for `bridge`: up to 14 items can each carry a sentence, and
      // overrunning the cap truncates the JSON into a parse failure rather than
      // a short report.
      maxTokens: 3600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPromptParts.join("\n\n") },
      ],
    });

    const parsedItems: MatchReportItem[] = raw.items
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
          gating: item.gating === true,
          evidence: item.evidence?.trim() ?? "",
          bridge: item.bridge?.trim() ?? "",
          note: item.note?.trim() ?? "",
        };
      });

    if (parsedItems.length === 0) {
      return NextResponse.json(
        { error: "Could not extract any requirements from the job description." },
        { status: 502 }
      );
    }

    const items = normaliseGates(parsedItems);

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
