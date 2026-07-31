"use client";

import { useEffect, useRef, useState } from "react";
import { entryLabel } from "@/lib/matchReport";
import { appendUsageEntry } from "@/lib/usage";
import type {
  MatchReport,
  MatchReportProposal,
  MatchStatus,
  ReportChatMessage,
  ReportEntry,
  RequirementImportance,
} from "@/types";
import ProposalDiffCard from "./ProposalDiffCard";

type Props = {
  report: MatchReport | null;
  messages: ReportChatMessage[];
  resumeText: string;
  jobDescription: string;
  apiKey: string;
  /** Application this chat belongs to, so its spend is attributed correctly. */
  sessionId: string;
  /** Requirement or standout the user clicked in the report, to scope the next question. */
  attachedItem: ReportEntry | null;
  onClearAttachment: () => void;
  onNewMessage: (userMsg: ReportChatMessage, assistantMsg: ReportChatMessage) => void;
  onAcceptProposal: (messageIndex: number, proposalId: string) => void;
  onRejectProposal: (messageIndex: number, proposalId: string) => void;
};

export default function ReportChat({
  report,
  messages,
  resumeText,
  jobDescription,
  apiKey,
  sessionId,
  attachedItem,
  onClearAttachment,
  onNewMessage,
  onAcceptProposal,
  onRejectProposal,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll the transcript's own container rather than using scrollIntoView —
  // that walks up and scrolls every ancestor including the window, which
  // yanked the whole page down to the chat on mount.
  useEffect(() => {
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading || !report) return;

    setError("");
    setInput("");
    setLoading(true);

    // Keep the attachment visible in the transcript so the conversation still
    // reads correctly later — otherwise "make that a match" loses its referent.
    const attachedAtSend = attachedItem;
    const userMsg: ReportChatMessage = {
      role: "user",
      content: attachedAtSend ? `Re: “${entryLabel(attachedAtSend)}”\n${trimmed}` : trimmed,
    };
    onClearAttachment();

    try {
      const res = await fetch("/api/report-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          resumeText,
          jobDescription,
          report,
          attachedItemId: attachedAtSend?.id,
          chatHistory: messages.map((m) => ({ role: m.role, content: m.content })),
          apiKey: apiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");

      const proposals: MatchReportProposal[] = data.proposals ?? [];
      const assistantMsg: ReportChatMessage = {
        role: "assistant",
        content: data.reply,
        proposals: proposals.map((p) => ({ ...p, resolution: "pending" as const })),
      };
      onNewMessage(userMsg, assistantMsg);
      if (data.usage) {
        appendUsageEntry({
          endpoint: "report-chat",
          model: data.usage.model,
          sessionId,
          usage: data.usage,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  }

  const disabled = !report;

  // No frame or heading of its own: ChatPanel supplies both, and this renders
  // only the transcript and composer that fill it.
  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {disabled && (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-text-muted)]">
              Analyze the match first to start refining it.
            </p>
          </div>
        )}

        {!disabled && messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--color-text-secondary)]">
              No messages yet. Point out anything the report got wrong.
            </p>
            {/* Hidden the moment you start typing — once you have your own
                wording, prompts to copy are just noise in the way. They come
                back if you clear the box. */}
            {!input.trim() && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {buildSuggestions(report).map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          const pending = msg.proposals?.filter((p) => p.resolution === "pending") ?? [];
          return (
            <div key={i}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {msg.proposals && msg.proposals.length > 0 && (
                <div className="mt-2">
                  {pending.length > 1 && (
                    <div className="flex gap-2 mb-2 justify-end">
                      <button
                        onClick={() =>
                          pending.forEach((p) => onAcceptProposal(i, p.id))
                        }
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Accept all
                      </button>
                      <button
                        onClick={() =>
                          pending.forEach((p) => onRejectProposal(i, p.id))
                        }
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        Reject all
                      </button>
                    </div>
                  )}
                  {msg.proposals.map((p) => (
                    <ProposalDiffCard
                      key={p.id}
                      proposal={p}
                      onAccept={() => onAcceptProposal(i, p.id)}
                      onReject={() => onRejectProposal(i, p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-surface-overlay)] rounded-xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-[var(--color-border-subtle)]">
        {attachedItem && (
          <div className="flex items-start gap-2 mb-2 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-muted)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]">
                Asking about
              </p>
              <p className="text-xs text-[var(--color-text-primary)] break-words">
                {entryLabel(attachedItem)}
              </p>
            </div>
            <button
              onClick={onClearAttachment}
              aria-label="Remove attachment"
              className="shrink-0 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-overlay)]"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {error && <p className="text-[var(--color-danger)] text-xs mb-2">{error}</p>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="e.g. I actually have 6 years of Python, not 3…"
            className="input-base flex-1"
            disabled={loading || disabled}
          />
          <button
            onClick={send}
            disabled={loading || disabled || !input.trim()}
            className="btn-primary px-4"
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}

const STATUS_RANK: Record<MatchStatus, number> = { gap: 0, partial: 1, match: 2 };
const IMPORTANCE_RANK: Record<RequirementImportance, number> = {
  critical: 0,
  important: 1,
  "nice-to-have": 2,
};

function shorten(text: string, max = 42): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Openers built from this report rather than a fixed list.
 *
 * The hardcoded set talked about Python and patents, which is nonsense in front
 * of a pediatrician — and a prompt you can't act on is worse than none, because
 * it suggests the tool hasn't read your report. Quoting the user's own
 * requirements costs nothing extra: it all comes from the report already loaded.
 */
function buildSuggestions(report: MatchReport | null): string[] {
  if (!report?.items.length) return [];
  const out: string[] = [];

  const byNeed = [...report.items].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance]
  );

  const weakest = byNeed[0];
  if (weakest && weakest.status !== "match") {
    out.push(`I've actually done "${shorten(weakest.requirement)}"`);
  }

  const understated = report.items.find(
    (i) => i.status === "match" && i.strength !== "exceeds" && i.importance !== "nice-to-have"
  );
  if (understated) {
    // Phrased to fit a credential as readily as a skill: "I led it" reads as
    // nonsense next to "MD or equivalent medical degree".
    out.push(`I more than meet "${shorten(understated.requirement)}"`);
  }

  const secondWeak = byNeed.find((i) => i !== weakest && i.status !== "match");
  if (secondWeak) {
    out.push(`"${shorten(secondWeak.requirement)}" isn't a fair gap`);
  }

  out.push("You missed something important on my resume");
  return out.slice(0, 4);
}
