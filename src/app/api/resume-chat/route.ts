import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { removeDashTells } from "@/lib/deAiText";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";

import type { ChatMessage, ResumeTexProposal, TailoredResume } from "@/types";

export const runtime = "nodejs";

const MAX_CONTEXT_CHARS = 12000;
const MAX_TEX_CHARS = 24000;

const SYSTEM_PROMPT = `You are helping a job applicant refine a resume that has already been tailored to a specific job posting. The document is a LaTeX file. You have their original uploaded resume, the job description, the current LaTeX source, and a provenance list showing which line of the original each rewritten bullet came from.

Reply conversationally and briefly (2-4 sentences) to their message.

Only propose changes when the user asks for one or gives you new information. If the message is just a question, answer it and return an empty proposals array.

HOW YOU PROPOSE A CHANGE. Every proposal is a find-and-replace against the LaTeX source:
- "find": text copied EXACTLY from the source, character for character, including its LaTeX markup and spacing. It must appear EXACTLY ONCE in the whole document. If the text you want to change is not unique on its own, extend it — include the preceding \\item, the surrounding braces, or a neighbouring line — until it is.
- "replace": what it becomes. Empty string deletes the matched text.
- Keep "find" as small as it can be while still unique. Replacing a whole section when you meant to change four words makes the diff unreadable.
- To ADD a line, "find" a neighbouring line and "replace" it with itself plus the new one. This is how a bullet marked CUT FOR SPACE gets reinstated: find the \\item it should follow, and replace it with that \\item and then the restored one.

A proposal whose "find" does not appear exactly once is discarded before the user sees it, so copy carefully rather than reconstructing from memory.

LATEX RULES. The source must still compile after your change:
- Escape these characters in body text: & % $ # _ and write backslash as \\textbackslash{}.
- Never remove or alter \\documentclass, \\usepackage, \\newcommand, \\begin{document} or \\end{document}.
- Never rename or reorder \\section headings. The section list is fixed.
- Keep \\item inside a bullets environment, and keep every \\begin paired with its \\end.
- \\entry takes exactly four arguments, in this order: the dates, the job title, one pre-joined line of "Employer · Location", and a note that is almost always empty. Any of them may be empty, but all four braces must be present. \\entryflat is the same without the dates argument, and \\labeled takes a label and a value.

THE GROUNDING RULE OUTRANKS THE USER'S REQUEST. Every bullet traces to a line in the original resume.
- A rewrite may compress, reorder clauses, front-load a metric, or adopt the posting's vocabulary. It may NOT add a fact absent from the original: no invented numbers, technologies, team sizes, scopes or outcomes.
- Do not upgrade the candidate's role. "contributed to" does not become "led"; "used" does not become "built".
- A CLAIM CARRIES ITS ATTACHMENTS. A fact is not only its content, it is what that content was attached to: whose work, which system, which population, which category. A rewrite can keep every fact and break the attachment, which is how a line assembled from true statements comes out false. Pooled: "built platforms delivering $2B in volume and $3M in new revenue" gives two jobs one subject. Re-related: a system that monitors 400K users does not have 400K users. Re-categorised: "reduced detection latency" is not "low-latency inference". Every figure being the candidate's clears none of these, and this is the Summary's characteristic failure because the Summary draws on the whole document. Do not do it even when asked to tighten, merge or punch up.
- If the user asks for something the original does not support ("say I led the migration" when it says they helped), do not propose it. Say plainly in your reply that their resume does not support that claim, and offer the strongest version it does support.
- You may never change an employer, job title, date, degree, licence, award, or a publication or presentation citation. If asked, decline in your reply and propose nothing.

HOW BULLETS READ: past-tense verb first, no first person, not a full sentence, no trailing period, lead with the number or outcome where there is one.

HOW THE SUMMARY READS: its job is to be impressive and relevant enough that the reader carries on into the entries below. 40 to 80 words, no first person. Lead with the most impressive thing the candidate has done that this posting cares about — restating what an entry below also says is fine, because a reader who never reaches that entry is who this section is for. What wastes it is what the page gives away free: a run of employers or titles is navigation, not a claim. Roughly: the posting's job title where the original supports it, years of experience with the domains they were spent in, the two or three capabilities the posting asks for most, and ONE quantified result named for the work that produced it, landing by the second sentence. The test on every clause is differentiation, not accuracy: could another candidate with a similar background have written this exact sentence? "Detail-oriented engineer with a track record of success" is true of thousands and argues for none of them. Where the original supports nothing specific, propose the shortest honest version rather than padding to length.

NEVER use em dashes or en dashes in prose you write. Avoid: delve, leverage, robust, seamless, spearheaded, pivotal, passionate, honed, adept, streamlined, "instrumental in", "played a key role".

"rationale" is one short sentence saying why. "location" is a human-readable label for where the change lands, e.g. "Summary" or "Shopify, second bullet".`;

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    location: { type: "string" },
    find: {
      type: "string",
      description: "Exact text from the LaTeX source. Must occur exactly once.",
    },
    replace: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["location", "find", "replace", "rationale"],
  additionalProperties: false,
} as const;

const RESUME_CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    proposals: { type: "array", items: PROPOSAL_SCHEMA },
  },
  required: ["reply", "proposals"],
  additionalProperties: false,
} as const;

type RawProposal = {
  location: string;
  find: string;
  replace: string;
  rationale: string;
};

type RawResponse = { reply: string; proposals: RawProposal[] };

function truncate(text: string, max = MAX_CONTEXT_CHARS): string {
  return text.length > max ? text.slice(0, max) : text;
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

/**
 * The provenance the LaTeX source no longer carries.
 *
 * The .tex holds only the finished words. Without this the model would be
 * grading its own rewrites against nothing, and the grounding rule would have
 * no evidence behind it — so every bullet whose wording moved is listed here
 * beside the line it came from.
 */
function formatProvenance(resume: TailoredResume | null): string {
  if (!resume) return "";
  const lines: string[] = [];

  for (const section of resume.sections) {
    for (const entry of section.entries ?? []) {
      const where = [entry.heading, entry.organization].filter(Boolean).join(", ");

      for (const bullet of entry.bullets) {
        // Bullets cut to hit the page target are absent from the .tex
        // entirely. Listing them is the only way back: without this the user
        // could ask to restore one and the model would have nothing to restore.
        if (bullet.dropped) {
          lines.push(
            `- ${where} [CUT FOR SPACE, not currently in the document]\n  text: ${
              bullet.sources[0] || bullet.value
            }`
          );
          continue;
        }

        // Every line it was built from, so a bullet that combined two facts is
        // held to both when the chat rewrites it again.
        const cited = bullet.sources.filter((c) => c && c !== bullet.value);
        if (!cited.length) continue;
        lines.push(
          `- ${where}\n  now:      ${bullet.value}\n` +
            cited.map((c) => `  from:     ${c}`).join("\n")
        );
      }
    }

    const prose = section.prose;
    const proseCited = prose?.sources.filter((c) => c && c !== prose.value) ?? [];
    if (prose?.value.trim() && proseCited.length) {
      lines.push(
        `- ${section.key}\n  now:      ${prose.value}\n` +
          proseCited.map((c) => `  from:     ${c}`).join("\n")
      );
    }
  }

  // Roles reduced to a single "Earlier:" line, so a request to bring one back
  // has something to bring back.
  for (const role of resume.collapsed ?? []) {
    const when = [role.startDate, role.endDate].filter(Boolean).join(" - ");
    lines.push(
      `- ${role.heading}, ${role.organization}${when ? ` (${when})` : ""}` +
        ` [COLLAPSED TO FIT, printed as one line with no bullets]`
    );
  }

  // Material from the uploaded document that nothing on the page draws on,
  // derived by diffing the source against every citation. This is what makes
  // "what did you leave out?" and "put the Kafka work back" answerable — the
  // .tex holds only what survived, and the model that wrote it is long gone.
  const omitted = (resume.omitted ?? []).filter((l) => l.trim());
  if (omitted.length) {
    lines.push(
      `\n[NOT IN THE DOCUMENT — lines from the uploaded resume that nothing on ` +
        `the page uses. Available to add back on request; still subject to the ` +
        `grounding rule, so anything drawn from one must cite it.]`
    );
    // Capped: a nine-page source leaves dozens behind, and the whole point of
    // this block is to be readable next to the document itself.
    for (const line of omitted.slice(0, 40)) lines.push(`- ${line}`);
    if (omitted.length > 40) lines.push(`- …and ${omitted.length - 40} more`);
  }

  return lines.join("\n");
}

type ResumeChatRequest = {
  message: string;
  resumeText: string;
  jobDescription: string;
  tex: string;
  /** Provenance only — the source of truth for what the document says is `tex`. */
  resume: TailoredResume | null;
  chatHistory: ChatMessage[];
  apiKey?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ResumeChatRequest;
    const { message, resumeText, jobDescription, tex, resume, chatHistory, apiKey } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!tex?.trim()) {
      return NextResponse.json(
        { error: "A tailored resume is required. Generate one first." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient(apiKey);
    const taskModel = getTaskModel("resume-chat");

    const provenance = formatProvenance(resume);
    const contextMessage = [
      `[Original resume — the only source of truth for facts]\n${truncate(resumeText?.trim() ?? "")}`,
      `[Job description]\n${truncate(jobDescription?.trim() ?? "")}`,
      provenance ? `[What was rewritten, and from what]\n${provenance}` : "",
      `[Current LaTeX source]\n${truncate(tex, MAX_TEX_CHARS)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contextMessage },
      {
        role: "assistant",
        content:
          "Got it — I have your original resume, the posting, and the LaTeX source. What would you like to change?",
      },
    ];

    for (const msg of chatHistory ?? []) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: "user", content: message.trim() });

    const { result: raw, usage } = await createStructuredCompletion<RawResponse>(client, {
      model: taskModel.id,
      schemaName: "resume_chat_response",
      schema: RESUME_CHAT_SCHEMA,
      temperature: 0.4,
      supportsTemperature: taskModel.supportsTemperature,
      reasoning: taskModel.reasoning,
      maxTokens: 2000,
      messages,
    });

    const proposals: ResumeTexProposal[] = [];

    (raw.proposals ?? []).forEach((p, i) => {
      const find = p.find ?? "";
      const replace = removeDashTells(p.replace ?? "");

      // Exactly once, or it doesn't get shown. Zero means the model
      // reconstructed the source instead of copying it, and the patch would
      // apply as a silent no-op. More than one means accepting it would also
      // rewrite a passage the user never reviewed.
      if (occurrences(tex, find) !== 1) return;
      if (find === replace) return;

      // The preamble is machinery, not content. A patch that lands there can
      // break compilation in ways the chat can't see, and nothing the user
      // asks for in words needs it.
      const bodyStart = tex.indexOf("\\begin{document}");
      if (bodyStart !== -1 && tex.indexOf(find) < bodyStart) return;

      proposals.push({
        id: `rp${i + 1}`,
        location: p.location?.trim() || "Resume",
        find,
        replace,
        rationale: p.rationale?.trim() ?? "",
      });
    });

    const reply = removeDashTells(raw.reply ?? "").trim();
    if (!reply) {
      return NextResponse.json({ error: "Model returned an empty response." }, { status: 502 });
    }

    return NextResponse.json({
      reply,
      proposals,
      usage: { model: taskModel.id, ...usage },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process chat message";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
