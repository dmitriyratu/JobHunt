import { NextRequest, NextResponse } from "next/server";
import { tierSupportsTemperature, type ModelTier } from "@/lib/models";
import { IMPORTANCE_WEIGHT } from "@/lib/matchReport";
import { getOpenAIClient, resolveModel } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type { MatchReport } from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an expert career coach and professional writer. Draft a targeted outreach email from a job applicant to a hiring manager or recruiter.

THE MATCH REPORT IS YOUR OUTLINE. It is a requirement-by-requirement analysis of how this specific candidate maps to this specific role, already weighted by importance. Build the email around it:
- Pick the 2-4 strongest matches with the HIGHEST importance (critical > important > nice-to-have) and make those the spine of the email. Those overlaps are the entire argument for this candidate.
- Use the concrete evidence attached to each matched requirement — company names, metrics, scale, dollar impact, years. Specificity is what makes this land; vague competence claims are worthless.
- Explicitly connect each strength back to what the role/company needs. The reader should feel the email was written for THIS posting, not mass-mailed.
- Do not enumerate the report or mention it exists. It is your source material, not the subject.
- Gaps: never apologize for or draw attention to them. If a gap is critical and unavoidable, offset it once with adjacent strength; otherwise ignore it entirely.

Also:
- Name the role and company early, and reference something concrete about what the team/company does when the job description supports it.
- Lead with the single strongest, most relevant fit in the first 2 sentences.
- Keep the body to roughly 150-250 words. Short paragraphs (1-3 sentences).
- Sound human, direct, and confident — not eager, formal, or generic.
- End with a clear, low-friction call to action (e.g. open to a brief call).
- Do NOT invent experience, skills, employers, metrics, or credentials that are not supported by the resume, match report evidence, or additional context.
- If the recipient name is unknown, use a neutral greeting like "Hi there" or "Hello".

Return two separate fields:
- "subject": the subject line only. One line. Do NOT prefix it with "Subject:".
- "body": the email body only — greeting through sign-off. It must NOT contain the subject line.
  Separate paragraphs with a blank line.`;

const EMAIL_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

type GenerateRequest = {
  resumeText: string;
  jobDescription: string;
  matchReport?: MatchReport | null;
  letterContext?: string;
  recipientName?: string;
  companyName?: string;
  apiKey?: string;
  modelTier?: ModelTier;
};

function formatMatchReport(report: MatchReport): string {
  const byStatus = { match: [], partial: [], gap: [] } as Record<
    MatchReport["items"][number]["status"],
    string[]
  >;

  // Order each group by importance so the model reads the critical overlaps
  // first — the prompt asks it to build the letter on the highest-importance
  // matches, so those need to be at the top of what it sees.
  const sorted = [...report.items].sort(
    (a, b) => IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]
  );

  for (const item of sorted) {
    const evidence = item.evidence ? `\n    evidence: ${item.evidence}` : "";
    const note = item.note ? `\n    note: ${item.note}` : "";
    byStatus[item.status].push(`- [${item.importance}] ${item.requirement}${evidence}${note}`);
  }

  const sections = [`Overall fit score: ${report.overallScore}/100`, report.summary];
  if (byStatus.match.length)
    sections.push(
      "STRONG MATCHES (build the email on these — highest importance first):\n" +
        byStatus.match.join("\n")
    );
  if (byStatus.partial.length)
    sections.push("PARTIAL MATCHES (usable as supporting points):\n" + byStatus.partial.join("\n"));
  if (byStatus.gap.length)
    sections.push("GAPS (do not raise these unless unavoidable):\n" + byStatus.gap.join("\n"));
  return sections.join("\n\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;
    const {
      resumeText,
      jobDescription,
      matchReport,
      letterContext,
      recipientName,
      companyName,
      apiKey,
      modelTier,
    } = body;

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

    const contextParts = [
      "## Candidate Resume\n" + resumeText.trim(),
      "## Job Description\n" + jobDescription.trim(),
    ];

    if (recipientName?.trim()) {
      contextParts.push("## Recipient Name\n" + recipientName.trim());
    }
    if (companyName?.trim()) {
      contextParts.push("## Company\n" + companyName.trim());
    }

    if (matchReport) {
      contextParts.push("## Match Report\n" + formatMatchReport(matchReport));
    }

    if (letterContext?.trim()) {
      contextParts.push("## Additional Context from Applicant\n" + letterContext.trim());
    }

    const userPrompt = `${contextParts.join("\n\n")}\n\nDraft the outreach email now.`;

    const { result, usage } = await createStructuredCompletion<{
      subject: string;
      body: string;
    }>(client, {
      model,
      schemaName: "outreach_email",
      schema: EMAIL_SCHEMA,
      temperature: 0.7,
      supportsTemperature: tierSupportsTemperature(modelTier),
      maxTokens: 1000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    // Belt and braces: the schema asks for them separated, but strip a stray
    // "Subject:" prefix or a leading subject line if the model adds one anyway.
    const subject = (result.subject ?? "").trim().replace(/^subject:\s*/i, "");
    const emailBody = (result.body ?? "").trim().replace(/^subject:.*(\r?\n)+/i, "");

    if (!emailBody) {
      return NextResponse.json(
        { error: "Model returned an empty response. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      subject,
      body: emailBody,
      usage: {
        model,
        ...usage,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate email";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
