import { NextRequest, NextResponse } from "next/server";
import type { ModelTier } from "@/lib/models";
import { getOpenAIClient, resolveModel } from "@/lib/openai";
import type { MatchReport } from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an expert career coach and professional writer. Your task is to draft a concise, compelling outreach email from a job applicant to a hiring manager or recruiter.

The reader is busy and will skim this email in under 30 seconds. Write accordingly:
- Lead with the strongest, most relevant fit in the first 2 sentences
- Keep the entire email under 200 words (excluding subject line)
- Use short paragraphs (1-2 sentences max)
- Be specific: reference concrete skills/experiences from the resume that match the job
- If a match report is provided, lean into the strong matches (especially critical/important ones) and address or gracefully sidestep the gaps — don't dwell on weaknesses
- Sound human and confident, not generic or desperate
- Include a clear, low-friction call to action (e.g., open to a brief call)
- Do NOT invent experience, skills, or credentials not supported by the resume or additional context
- If the recipient name is unknown, use a neutral greeting like "Hi there" or "Hello"

Output format:
Subject: [compelling subject line]

[email body]`;

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
  for (const item of report.items) {
    byStatus[item.status].push(
      `- (${item.importance}) ${item.requirement}${item.evidence ? ` — ${item.evidence}` : ""}`
    );
  }

  const sections = [`Overall fit score: ${report.overallScore}/100`, report.summary];
  if (byStatus.match.length) sections.push("Strong matches:\n" + byStatus.match.join("\n"));
  if (byStatus.partial.length) sections.push("Partial matches:\n" + byStatus.partial.join("\n"));
  if (byStatus.gap.length) sections.push("Gaps:\n" + byStatus.gap.join("\n"));
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

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const email = completion.choices[0]?.message?.content?.trim();
    if (!email) {
      return NextResponse.json(
        { error: "Model returned an empty response. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      email,
      usage: {
        model,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate email";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
