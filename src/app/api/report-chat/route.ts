import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { tierSupportsTemperature, type ModelTier } from "@/lib/models";
import { getOpenAIClient, resolveModel } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type {
  ChatMessage,
  MatchReport,
  MatchReportItem,
  MatchReportProposal,
  MatchStatus,
  ProposalAction,
  RequirementImportance,
} from "@/types";

export const runtime = "nodejs";

const MAX_CONTEXT_CHARS = 12000;

const SYSTEM_PROMPT = `You are helping a job applicant refine a match report that compares their resume against a job description. You already have the resume, the job description, and the current match report (a list of requirement items, each with importance, status, evidence, and a note).

Reply conversationally and briefly (2-4 sentences) to the user's message.

Only propose changes to the report when the user's message supplies new information or explicitly asks for a change (e.g. "actually I have 6 years of Python, not 3", "that Jira requirement isn't important", "add a line about my AWS cert"). If the message is just a question or doesn't warrant a report change, return an empty proposals array.

For each proposal:
- action "modify": change an existing item. Set targetItemId to that item's id. Fill requirement/importance/status/evidence/note with the FULL revised item (not just the changed field).
- action "remove": delete an existing item that no longer belongs (rare). Set targetItemId to that item's id. Other fields can be empty strings.
- action "add": propose a new requirement item the report missed. Set targetItemId to null. Fill requirement/importance/status/evidence/note for the new item.

Never invent evidence not supported by the resume. rationale is a single short sentence explaining why you're proposing the change.`;

const PROPOSAL_ITEM_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "modify", "remove"] },
    targetItemId: { type: ["string", "null"] },
    requirement: { type: "string" },
    importance: {
      type: "string",
      enum: ["critical", "important", "nice-to-have"],
    },
    status: { type: "string", enum: ["match", "partial", "gap"] },
    evidence: { type: "string" },
    note: { type: "string" },
    rationale: { type: "string" },
  },
  required: [
    "action",
    "targetItemId",
    "requirement",
    "importance",
    "status",
    "evidence",
    "note",
    "rationale",
  ],
  additionalProperties: false,
} as const;

const REPORT_CHAT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    proposals: {
      type: "array",
      items: PROPOSAL_ITEM_SCHEMA,
    },
  },
  required: ["reply", "proposals"],
  additionalProperties: false,
} as const;

type RawProposal = {
  action: string;
  targetItemId: string | null;
  requirement: string;
  importance: string;
  status: string;
  evidence: string;
  note: string;
  rationale: string;
};

type RawReportChatResponse = {
  reply: string;
  proposals: RawProposal[];
};

const VALID_ACTIONS: ProposalAction[] = ["add", "modify", "remove"];
const VALID_IMPORTANCE: RequirementImportance[] = [
  "critical",
  "important",
  "nice-to-have",
];
const VALID_STATUS: MatchStatus[] = ["match", "partial", "gap"];

function truncate(text: string): string {
  return text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) : text;
}

function nextItemId(items: MatchReportItem[], mintedSoFar: Set<string>): string {
  let max = 0;
  for (const item of items) {
    const match = /^r(\d+)$/.exec(item.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let candidate = `r${max + 1}`;
  while (mintedSoFar.has(candidate)) {
    max += 1;
    candidate = `r${max + 1}`;
  }
  mintedSoFar.add(candidate);
  return candidate;
}

type ReportChatRequest = {
  message: string;
  resumeText: string;
  jobDescription: string;
  report: MatchReport;
  chatHistory: ChatMessage[];
  /** Requirement the user clicked in the report to scope this question. */
  attachedItemId?: string;
  apiKey?: string;
  modelTier?: ModelTier;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ReportChatRequest;
    const {
      message,
      resumeText,
      jobDescription,
      report,
      chatHistory,
      attachedItemId,
      apiKey,
      modelTier,
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (!report) {
      return NextResponse.json(
        { error: "A match report is required. Analyze the match first." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient(apiKey);
    const model = resolveModel(modelTier);

    const contextMessage = [
      `[Resume]\n${truncate(resumeText?.trim() ?? "")}`,
      `[Job description]\n${truncate(jobDescription?.trim() ?? "")}`,
      `[Current match report]\n${JSON.stringify(report)}`,
    ].join("\n\n");

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contextMessage },
      {
        role: "assistant",
        content:
          "Got it — I have the resume, job description, and current match report. What would you like to change?",
      },
    ];

    for (const msg of chatHistory ?? []) {
      messages.push({ role: msg.role, content: msg.content });
    }
    // When the user clicked a specific requirement, name it explicitly so the
    // model resolves pronouns ("make that a match") against the right item
    // instead of guessing from the wording.
    const attached = attachedItemId
      ? report.items.find((item) => item.id === attachedItemId)
      : undefined;
    const userContent = attached
      ? [
          `The user is referring to this specific requirement (id "${attached.id}"):`,
          JSON.stringify(attached),
          "",
          `Their message: ${message.trim()}`,
        ].join("\n")
      : message.trim();
    messages.push({ role: "user", content: userContent });

    const { result: raw, usage } = await createStructuredCompletion<RawReportChatResponse>(client, {
      model,
      schemaName: "report_chat_response",
      schema: REPORT_CHAT_SCHEMA,
      temperature: 0.4,
      supportsTemperature: tierSupportsTemperature(modelTier),
      maxTokens: 1200,
      messages,
    });

    const mintedSoFar = new Set<string>();
    const proposals: MatchReportProposal[] = [];

    (raw.proposals ?? []).forEach((rawProposal, i) => {
      if (!VALID_ACTIONS.includes(rawProposal.action as ProposalAction)) return;
      const action = rawProposal.action as ProposalAction;

      if (action === "add") {
        if (
          !VALID_IMPORTANCE.includes(rawProposal.importance as RequirementImportance) ||
          !VALID_STATUS.includes(rawProposal.status as MatchStatus) ||
          !rawProposal.requirement?.trim()
        ) {
          return;
        }
        const after: MatchReportItem = {
          id: nextItemId(report.items, mintedSoFar),
          requirement: rawProposal.requirement.trim(),
          importance: rawProposal.importance as RequirementImportance,
          status: rawProposal.status as MatchStatus,
          evidence: rawProposal.evidence?.trim() ?? "",
          note: rawProposal.note?.trim() ?? "",
        };
        proposals.push({
          id: `p${i + 1}`,
          action,
          targetItemId: null,
          before: null,
          after,
          rationale: rawProposal.rationale?.trim() ?? "",
        });
        return;
      }

      const existing = report.items.find((item) => item.id === rawProposal.targetItemId);
      if (!existing) return;

      if (action === "remove") {
        proposals.push({
          id: `p${i + 1}`,
          action,
          targetItemId: existing.id,
          before: existing,
          after: null,
          rationale: rawProposal.rationale?.trim() ?? "",
        });
        return;
      }

      // modify
      if (
        !VALID_IMPORTANCE.includes(rawProposal.importance as RequirementImportance) ||
        !VALID_STATUS.includes(rawProposal.status as MatchStatus) ||
        !rawProposal.requirement?.trim()
      ) {
        return;
      }
      const after: MatchReportItem = {
        id: existing.id,
        requirement: rawProposal.requirement.trim(),
        importance: rawProposal.importance as RequirementImportance,
        status: rawProposal.status as MatchStatus,
        evidence: rawProposal.evidence?.trim() ?? "",
        note: rawProposal.note?.trim() ?? "",
      };
      proposals.push({
        id: `p${i + 1}`,
        action,
        targetItemId: existing.id,
        before: existing,
        after,
        rationale: rawProposal.rationale?.trim() ?? "",
      });
    });

    const reply = raw.reply?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply, proposals, usage: { model, ...usage } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process chat message";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
