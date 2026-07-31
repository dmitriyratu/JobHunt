import { NextRequest, NextResponse } from "next/server";
import { removeDashTells } from "@/lib/deAiText";
import { getTaskModel } from "@/lib/models";
import { formatMatchReport } from "@/lib/matchReportPrompt";
import { getOpenAIClient } from "@/lib/openai";
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

MEETING THE BAR IS NOT THE SAME AS CLEARING IT. Requirements marked EXCEEDS are ones this candidate is well beyond, not merely adequate at:
- Prefer an EXCEEDS requirement over a plain match when choosing the spine, and lead with the highest-importance one.
- Write the margin, not just the fact. "Twelve years, the last four leading the platform team" argues; "experienced backend engineer" does not. Let the number or the scope do the work — never add an adjective like "exceptional" or "world-class" to make the point.

STANDOUTS are credentials this posting never asked for but a hiring team would prize anyway:
- Use AT MOST ONE, and only if it is genuinely rare and you can tie it to this role in the same breath. Relevance is what earns the reply; a standout is a tiebreaker, not the argument.
- Place it after the spine is established — one sentence, stated plainly, no build-up.
- If none of them connect naturally to this role, leave them all out. Omitting is always better than reaching. Never open the email with one.

Also:
- Name the role and company early, and reference something concrete about what the team/company does when the job description supports it.
- Lead with the single strongest, most relevant fit in the first 2 sentences.
- Keep the body to roughly 150-250 words. Short paragraphs (1-3 sentences).
- Sound human, direct, and confident — not eager, formal, or generic.

WRITE LIKE A PERSON, NOT LIKE AN LLM. This email is read by someone who sees AI-written outreach every day, and the tells below get it deleted:
- NEVER use em dashes (—) or en dashes (–). Use a comma, a colon, or two sentences. Plain hyphens in words are fine.
- Do not use these words and phrases at all: delve, leverage, robust, seamless, holistic, spearheaded, pivotal, testament to, landscape, realm, resonate, align with my values, passionate about, deeply passionate, thrilled, excited to, honed, adept at, "in today's fast-paced", "I couldn't help but notice", "it's worth noting", "that said".
- No "not only … but also", no "isn't just X, it's Y", and no rule-of-three adjective lists ("fast, reliable, and scalable").
- Do not open with "I hope this finds you well" or any variation.
- Do not compliment the company in generic terms ("impressive work", "cutting-edge", "industry leader"). If you reference the company, reference something specific from the posting.
- No markdown, no bold, no bullet points, no headings. Plain prose only.
- Vary sentence length. Do not start consecutive sentences the same way, and do not begin more than one sentence with "With".
- End with a clear, low-friction call to action (e.g. open to a brief call).
- Do NOT invent experience, skills, employers, metrics, or credentials that are not supported by the resume, match report evidence, or additional context. This applies with full force to EXCEEDS margins and standouts: state exactly what the evidence supports and not one degree more. Do not upgrade "contributed to" into "led", or "used" into "built".
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
  /** The resolved tailored resume, when one has been generated for this role. */
  tailoredResumeText?: string;
  apiKey?: string;
};

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
      tailoredResumeText,
      apiKey,
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
    const taskModel = getTaskModel("generate-email");

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

    // The resume the reader will open alongside this email. Keeping the two on
    // the same wins is the point: an email arguing one case over an attachment
    // arguing another reads as mass-mailed.
    if (tailoredResumeText?.trim()) {
      contextParts.push(
        "## Tailored Resume Attached To This Application\n" +
          tailoredResumeText.trim() +
          "\n\nThis is what the reader will see attached. Draw your specifics from " +
          "here so the two agree, and do not contradict or repeat it wholesale."
      );
    }

    if (letterContext?.trim()) {
      contextParts.push("## Additional Context from Applicant\n" + letterContext.trim());
    }

    const userPrompt = `${contextParts.join("\n\n")}\n\nDraft the outreach email now.`;

    const { result, usage } = await createStructuredCompletion<{
      subject: string;
      body: string;
    }>(client, {
      model: taskModel.id,
      schemaName: "outreach_email",
      schema: EMAIL_SCHEMA,
      temperature: 0.7,
      supportsTemperature: taskModel.supportsTemperature,
      reasoning: taskModel.reasoning,
      maxTokens: 1000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    // Belt and braces: the schema asks for them separated, but strip a stray
    // "Subject:" prefix or a leading subject line if the model adds one anyway.
    const subject = removeDashTells(
      (result.subject ?? "").trim().replace(/^subject:\s*/i, "")
    ).trim();
    const emailBody = removeDashTells(
      (result.body ?? "").trim().replace(/^subject:.*(\r?\n)+/i, "")
    ).trim();

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
        model: taskModel.id,
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
