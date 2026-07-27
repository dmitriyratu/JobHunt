import { NextRequest, NextResponse } from "next/server";
import { removeDashTells } from "@/lib/deAiText";
import { getTaskModel } from "@/lib/models";
import { IMPORTANCE_WEIGHT } from "@/lib/matchReport";
import { getOpenAIClient } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type { MatchReport, MatchReportItem } from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an expert career coach and professional writer. Draft a targeted outreach email from a job applicant to a hiring manager or recruiter.

WHO IS READING THIS. A recruiter or hiring manager spends about ten seconds deciding whether this email is worth a reply and whether to open the attached resume. They read this email BEFORE the resume, and often instead of it. Three consequences govern everything below:
- This email must stand on its own. Assume the resume may never be opened: anything the reader needs in order to take this candidate seriously has to be in these 200 words. Restating something the resume also says is not waste — it is the only copy of the argument the reader is guaranteed to see.
- Standing alone is not the same as being complete. Two hundred words cannot carry twelve requirements with any force. Prove the one thing that decides, then compress the rest into a single credible line. Compress, do not omit: a candidate who looks strong on one requirement and silent on the others reads as narrow when there is no resume open to say otherwise.
- The email is an invitation to read the resume, so it must leave the reader wanting the detail rather than feeling they already have it. State scope and outcome; leave the how in the attachment.

THE MATCH REPORT IS YOUR OUTLINE. It is a requirement-by-requirement analysis of how this specific candidate maps to this specific role. Build the email from it in this priority order, and never enumerate it or mention that it exists — it is your source material, not your subject.

1. THE GATE COMES FIRST. The report marks one or two requirements as THE GATE: what this team actually screens on. The email lives or dies on it.
   - If the gate is matched, prove it inside the first two sentences using the concrete evidence attached to it — company names, metrics, scale, dollar impact, years. Prove it; do not claim it.
   - If the gate is partial, lead with its bridge (see below). That is the whole email.
   - If the gate is a gap, do not mention it, do not hint at it, and never imply the candidate has it. Lead instead with the strongest matched critical requirement and let the reader draw their own conclusion.
   - Importance ranks everything else: critical > important > nice-to-have.

2. A BRIDGE IS YOUR HIGHEST-VALUE SENTENCE. Some requirements carry a "bridge": why experience that does not look like the requirement on paper actually satisfies it. Because this email is read before the resume, a candidate whose background looks off-target never gets a second chance to be understood — so when a bridge exists on the gate or on a critical requirement, it earns more space than anything else in the email. Write it as the equivalence it is: name the candidate's actual experience, name what the role needs, and say what makes them the same problem. Never assert an equivalence beyond what the bridge states.

3. THE BREADTH LINE. Once the gate is proved, spend exactly one sentence establishing that the candidate is credible across the rest of the role and not only on the gate. Compress two or three other matched requirements into a clause each, at the level of scope and outcome, with no evidence attached — evidence belongs to the gate alone. This line exists to close the "strong in one area, unknown everywhere else" doubt that a reader cannot resolve without opening the resume. One sentence, never two, and never a list of three adjectives.

4. MARGIN, BUT ONLY WHERE MARGIN MATTERS. Requirements marked EXCEEDS are ones this candidate is well beyond, not merely adequate at.
   - Margin is only worth words on the gate or on a critical requirement. Overshooting a nice-to-have is not an argument, it is trivia. Skip it.
   - Write the margin, not the label. "Twelve years, the last four leading the platform team" argues; "experienced backend engineer" does not. Let the number or the scope do the work — never add an adjective like "exceptional" or "world-class" to make the point.
   - Do not stack margins. One is confidence; three reads as overqualified, and a reader who decides the candidate will be bored or expensive deletes the email as fast as one who decides they are underqualified.

5. STANDOUTS are credentials this posting never asked for but a hiring team would prize anyway.
   - Use AT MOST ONE, and only if it is genuinely rare and you can tie it to this role in the same breath. Relevance is what earns the reply; a standout is a tiebreaker, not the argument.
   - Place it after the gate is established — one sentence, stated plainly, no build-up.
   - If none of them connect naturally to this role, leave them all out. Omitting is always better than reaching. Never open the email with one.

6. GAPS: never apologize for one, explain one, or draw attention to one. The reader has not asked. Say nothing.

Also:
- Name the role and company in the first sentence, and reference something concrete about what the team/company does when the job description supports it.
- Keep the body to roughly 150-250 words: greeting, the gate, the breadth line, an optional standout, the close. Short paragraphs (1-3 sentences). A recruiter should be able to forward it untouched.
- Close with both asks in one or two sentences: a brief call, and the attached resume for the detail. Make opening the resume feel like the natural next step rather than an afterthought.
- Never assert the conclusion. No "I am the perfect candidate", "ideal fit", "exactly what you are looking for", or "I am confident I would excel". A claim the reader cannot check reads as filler, and it costs the same words that would have proved the point. Build the case so the conclusion is obvious and let them reach it themselves.
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
- Do NOT invent experience, skills, employers, metrics, or credentials that are not supported by the resume, match report evidence, or additional context. This applies with full force to EXCEEDS margins, bridges, and standouts: state exactly what the evidence supports and not one degree more. Do not upgrade "contributed to" into "led", "used" into "built", or a bridge's qualified equivalence into a direct claim.
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
};

/**
 * One requirement as the model sees it.
 *
 * `includeStatus` is for gate lines: a gate is pulled out of its status group,
 * so it has to carry its own verdict or a gated gap would read like a win.
 */
function formatItem(item: MatchReportItem, includeStatus: boolean): string {
  const tags: string[] = [item.importance];
  if (includeStatus) tags.push(`status: ${item.status}`);
  // Reports saved before `strength` existed have no value here.
  if (item.strength === "exceeds") tags.push("EXCEEDS");
  const evidence = item.evidence ? `\n    evidence: ${item.evidence}` : "";
  const bridge = item.bridge ? `\n    bridge: ${item.bridge}` : "";
  const note = item.note ? `\n    note: ${item.note}` : "";
  return `- [${tags.join(", ")}] ${item.requirement}${evidence}${bridge}${note}`;
}

function formatMatchReport(report: MatchReport): string {
  const gates: string[] = [];
  const byStatus = { match: [], partial: [], gap: [] } as Record<
    MatchReport["items"][number]["status"],
    string[]
  >;

  // Order each group by importance so the model reads the critical overlaps
  // first — the prompt asks it to build the letter on the highest-importance
  // matches, so those need to be at the top of what it sees. Within equal
  // importance, overshoot outranks a bare match: those are the lines that
  // actually argue, so they should be the first thing considered.
  const sorted = [...report.items].sort(
    (a, b) =>
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] ||
      Number(b.strength === "exceeds") - Number(a.strength === "exceeds")
  );

  for (const item of sorted) {
    // Gates leave their status group rather than appearing twice. Reports saved
    // before gating existed have no value here, so nothing lands in `gates` and
    // the sections below degrade to the old importance-ordered layout.
    if (item.gating) gates.push(formatItem(item, true));
    else byStatus[item.status].push(formatItem(item, false));
  }

  const sections = [`Overall fit score: ${report.overallScore}/100`, report.summary];
  if (gates.length)
    sections.push(
      "THE GATE (what this team actually screens on — the email lives or dies " +
        "here; check the status before building on it, and if it is a gap or a " +
        "partial, read the rules for that case again):\n" + gates.join("\n")
    );
  if (byStatus.match.length)
    sections.push(
      "OTHER STRONG MATCHES (supporting points and breadth-line material, " +
        "highest importance first; EXCEEDS means the candidate is well past the " +
        "bar, not merely adequate):\n" +
        byStatus.match.join("\n")
    );
  if (byStatus.partial.length)
    sections.push("PARTIAL MATCHES (usable as supporting points):\n" + byStatus.partial.join("\n"));
  if (byStatus.gap.length)
    sections.push("GAPS (do not raise these unless unavoidable):\n" + byStatus.gap.join("\n"));

  const standouts = report.standouts ?? [];
  if (standouts.length) {
    sections.push(
      "STANDOUTS (not asked for by this posting; use AT MOST ONE, only if it ties " +
        "naturally to this role, and never as the opening):\n" +
        standouts
          .map((s) => {
            const evidence = s.evidence ? `\n    evidence: ${s.evidence}` : "";
            const why = s.whyValuable ? `\n    why it's prized: ${s.whyValuable}` : "";
            return `- ${s.credential}${evidence}${why}`;
          })
          .join("\n")
    );
  }

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
