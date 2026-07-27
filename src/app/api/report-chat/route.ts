import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type {
  ChatMessage,
  MatchReport,
  MatchReportItem,
  MatchReportProposal,
  MatchStatus,
  ProposalAction,
  RequirementImportance,
  StandoutItem,
} from "@/types";

export const runtime = "nodejs";

const MAX_CONTEXT_CHARS = 12000;

const SYSTEM_PROMPT = `You are helping a job applicant refine a match report that compares their resume against a job description. You already have the resume, the job description, and the current match report.

The report has two parts:
- "items": requirements drawn from the job description. Each has importance, status (match/partial/gap), strength (meets/exceeds), gating, evidence, a bridge, and a note. "exceeds" means the candidate clears that bar by a wide margin, not merely satisfies it; it only applies when status is "match". "gating" marks the one or two requirements this team would actually screen on. "bridge" is the non-obvious reason experience that does not look like the requirement still satisfies it — usually empty, because most matches are self-evident.
- "standouts": credentials that are rare or highly prized but that this posting never asked for (patents, founding a company, widely used open-source work, notable awards). Each has a credential, evidence, and whyValuable.

Reply conversationally and briefly (2-4 sentences) to the user's message.

Only propose changes when the user's message supplies new information or explicitly asks for one (e.g. "actually I have 6 years of Python, not 3", "that Jira requirement isn't important", "I also hold a patent on this"). If the message is just a question, return an empty proposals array.

Set "target" on every proposal to say which part of the report it touches:

target "requirement":
- action "modify": Set targetItemId to that item's id. Fill requirement/importance/status/strength/evidence/note with the FULL revised item, not just the changed field.
- action "remove": Set targetItemId to that item's id. Other fields can be empty strings.
- action "add": Set targetItemId to null. Fill requirement/importance/status/strength/evidence/note for the new item.
- Leave credential and whyValuable as empty strings.
- "bridge": leave it as an empty string unless the user has just explained a non-obvious reason their experience satisfies the requirement (a different industry with the same underlying problem, a different tool with the same primitives, a different title with the same scope). Then write that equivalence in one sentence, naming both sides. An empty bridge on a modify keeps whatever bridge the item already had, so you never need to repeat one back.
- You cannot change "gating". It is assigned across the whole posting during analysis and stays put. If the user argues a different requirement is the real dealbreaker, say so in your reply and tell them to re-analyze — do not propose a change for it.

target "standout":
- action "modify": Set targetItemId to that standout's id. Fill credential/evidence/whyValuable with the FULL revised standout.
- action "remove": Set targetItemId to that standout's id. Other fields can be empty strings.
- action "add": Set targetItemId to null. Fill credential/evidence/whyValuable. Only do this for something genuinely rare and prized that the posting did not ask for — an ordinary skill belongs in items, not here.
- Leave requirement/importance/status/strength as empty strings or defaults.

If the user tells you they clear a requirement by a wide margin, prefer modifying that item to strength "exceeds" over adding a standout — standouts are only for things the posting never asked about at all.

Never invent evidence not supported by the resume or by what the user just told you. rationale is a single short sentence explaining why you're proposing the change.`;

const PROPOSAL_ITEM_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "modify", "remove"] },
    target: { type: "string", enum: ["requirement", "standout"] },
    targetItemId: { type: ["string", "null"] },
    // Requirement fields
    requirement: { type: "string" },
    importance: {
      type: "string",
      enum: ["critical", "important", "nice-to-have"],
    },
    status: { type: "string", enum: ["match", "partial", "gap"] },
    strength: { type: "string", enum: ["meets", "exceeds"] },
    bridge: { type: "string" },
    note: { type: "string" },
    // Standout fields
    credential: { type: "string" },
    whyValuable: { type: "string" },
    // Shared
    evidence: { type: "string" },
    rationale: { type: "string" },
  },
  // Strict mode requires every property to be listed, so both variants' fields
  // are always present; the unused side comes back as empty strings.
  required: [
    "action",
    "target",
    "targetItemId",
    "requirement",
    "importance",
    "status",
    "strength",
    "bridge",
    "note",
    "credential",
    "whyValuable",
    "evidence",
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
  target: string;
  targetItemId: string | null;
  requirement: string;
  importance: string;
  status: string;
  strength: string;
  bridge: string;
  note: string;
  credential: string;
  whyValuable: string;
  evidence: string;
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

function nextId(
  prefix: string,
  existing: { id: string }[],
  mintedSoFar: Set<string>
): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const entry of existing) {
    const match = pattern.exec(entry.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  let candidate = `${prefix}${max + 1}`;
  while (mintedSoFar.has(candidate)) {
    max += 1;
    candidate = `${prefix}${max + 1}`;
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
    const taskModel = getTaskModel("report-chat");

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
    // When the user clicked a specific entry, name it explicitly so the model
    // resolves pronouns ("make that a match") against the right one instead of
    // guessing from the wording. Standouts are clickable too, so search both.
    const attached = attachedItemId
      ? report.items.find((item) => item.id === attachedItemId) ??
        (report.standouts ?? []).find((s) => s.id === attachedItemId)
      : undefined;
    const attachedKind =
      attached && "credential" in attached ? "standout" : "requirement";
    const userContent = attached
      ? [
          `The user is referring to this specific ${attachedKind} (id "${attached.id}"):`,
          JSON.stringify(attached),
          "",
          `Their message: ${message.trim()}`,
        ].join("\n")
      : message.trim();
    messages.push({ role: "user", content: userContent });

    const { result: raw, usage } = await createStructuredCompletion<RawReportChatResponse>(client, {
      model: taskModel.id,
      schemaName: "report_chat_response",
      schema: REPORT_CHAT_SCHEMA,
      temperature: 0.4,
      supportsTemperature: taskModel.supportsTemperature,
      maxTokens: 1200,
      messages,
    });

    const mintedSoFar = new Set<string>();
    const proposals: MatchReportProposal[] = [];
    // Reports saved before standouts existed have no array here.
    const standouts = report.standouts ?? [];

    /**
     * Builds a requirement item, normalising overshoot the same way analyze-match does.
     *
     * `existing` is the item being modified, and it is what protects fields this
     * chat does not manage. Accepting a proposal replaces the item wholesale on
     * the client, so anything missing from `after` is destroyed rather than
     * merged — `gating` in particular is assigned once, under a scarcity cap
     * this route cannot re-check, and a wording fix must not silently move it.
     */
    function buildItem(
      id: string,
      rawProposal: RawProposal,
      existing?: MatchReportItem
    ): MatchReportItem {
      const status = rawProposal.status as MatchStatus;
      return {
        id,
        requirement: rawProposal.requirement.trim(),
        importance: rawProposal.importance as RequirementImportance,
        status,
        strength: status === "match" && rawProposal.strength === "exceeds" ? "exceeds" : "meets",
        // A requirement the user raises in chat is new information, not a new
        // gate: the gate is judged against the whole posting at analysis time.
        gating: existing?.gating === true,
        evidence: rawProposal.evidence?.trim() ?? "",
        // Strict mode forces every field into the response, so the model returns
        // "" for anything it isn't changing. Treat empty as "leave it alone" —
        // dropping a bridge on an unrelated wording fix costs the letter its
        // strongest sentence. Re-analysis is the way to clear one.
        bridge: rawProposal.bridge?.trim() || existing?.bridge || "",
        note: rawProposal.note?.trim() ?? "",
      };
    }

    function requirementFieldsValid(rawProposal: RawProposal): boolean {
      return (
        VALID_IMPORTANCE.includes(rawProposal.importance as RequirementImportance) &&
        VALID_STATUS.includes(rawProposal.status as MatchStatus) &&
        Boolean(rawProposal.requirement?.trim())
      );
    }

    (raw.proposals ?? []).forEach((rawProposal, i) => {
      if (!VALID_ACTIONS.includes(rawProposal.action as ProposalAction)) return;
      const action = rawProposal.action as ProposalAction;
      const id = `p${i + 1}`;
      const rationale = rawProposal.rationale?.trim() ?? "";

      if (rawProposal.target === "standout") {
        if (action === "add") {
          if (!rawProposal.credential?.trim()) return;
          const after: StandoutItem = {
            id: nextId("s", standouts, mintedSoFar),
            credential: rawProposal.credential.trim(),
            evidence: rawProposal.evidence?.trim() ?? "",
            whyValuable: rawProposal.whyValuable?.trim() ?? "",
          };
          proposals.push({
            id,
            target: "standout",
            action,
            targetItemId: null,
            before: null,
            after,
            rationale,
          });
          return;
        }

        const existing = standouts.find((s) => s.id === rawProposal.targetItemId);
        if (!existing) return;

        if (action === "remove") {
          proposals.push({
            id,
            target: "standout",
            action,
            targetItemId: existing.id,
            before: existing,
            after: null,
            rationale,
          });
          return;
        }

        if (!rawProposal.credential?.trim()) return;
        proposals.push({
          id,
          target: "standout",
          action,
          targetItemId: existing.id,
          before: existing,
          after: {
            id: existing.id,
            credential: rawProposal.credential.trim(),
            evidence: rawProposal.evidence?.trim() ?? "",
            whyValuable: rawProposal.whyValuable?.trim() ?? "",
          },
          rationale,
        });
        return;
      }

      if (action === "add") {
        if (!requirementFieldsValid(rawProposal)) return;
        proposals.push({
          id,
          target: "requirement",
          action,
          targetItemId: null,
          before: null,
          after: buildItem(nextId("r", report.items, mintedSoFar), rawProposal),
          rationale,
        });
        return;
      }

      const existing = report.items.find((item) => item.id === rawProposal.targetItemId);
      if (!existing) return;

      if (action === "remove") {
        proposals.push({
          id,
          target: "requirement",
          action,
          targetItemId: existing.id,
          before: existing,
          after: null,
          rationale,
        });
        return;
      }

      // modify
      if (!requirementFieldsValid(rawProposal)) return;
      proposals.push({
        id,
        target: "requirement",
        action,
        targetItemId: existing.id,
        before: existing,
        after: buildItem(existing.id, rawProposal, existing),
        rationale,
      });
    });

    const reply = raw.reply?.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 502 }
      );
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
