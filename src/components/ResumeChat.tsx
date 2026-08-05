"use client";

import { useEffect, useRef, useState } from "react";
import { allEntries, flattenSkills, visibleBullets } from "@/lib/tailoredResume";
import { appendUsageEntry } from "@/lib/usage";
import type { ResumeChatMessage, ResumeTexProposal, TailoredResume } from "@/types";
import ResumeProposalCard from "./ResumeProposalCard";

type Props = {
  /** The document itself — what patches are proposed against. */
  tex: string;
  /** Provenance for the grounding check, not the document's content. */
  resume: TailoredResume | null;
  messages: ResumeChatMessage[];
  resumeText: string;
  jobDescription: string;
  apiKey: string;
  /** Application this chat belongs to, so its spend is attributed correctly. */
  sessionId: string;
  onNewMessage: (userMsg: ResumeChatMessage, assistantMsg: ResumeChatMessage) => void;
  onAcceptProposal: (messageIndex: number, proposalId: string) => void;
  onRejectProposal: (messageIndex: number, proposalId: string) => void;
};

export default function ResumeChat({
  tex,
  resume,
  messages,
  resumeText,
  jobDescription,
  apiKey,
  sessionId,
  onNewMessage,
  onAcceptProposal,
  onRejectProposal,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll this container rather than using scrollIntoView, which walks up and
  // scrolls every ancestor including the window.
  useEffect(() => {
    if (messages.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || loading || !tex.trim()) return;

    setError("");
    setInput("");
    setLoading(true);

    const userMsg: ResumeChatMessage = { role: "user", content: trimmed };

    try {
      const res = await fetch("/api/resume-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          resumeText,
          jobDescription,
          tex,
          resume,
          chatHistory: messages.map((m) => ({ role: m.role, content: m.content })),
          apiKey: apiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");

      const proposals: ResumeTexProposal[] = data.proposals ?? [];
      onNewMessage(userMsg, {
        role: "assistant",
        content: data.reply,
        proposals: proposals.map((p) => ({ ...p, resolution: "pending" as const })),
      });

      if (data.usage) {
        appendUsageEntry({
          endpoint: "resume-chat",
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

  const disabled = !tex.trim();

  // No frame or heading of its own: ChatPanel supplies both, and this renders
  // only the transcript and composer that fill it.
  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {disabled && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              Generate a resume first to start refining it.
            </p>
          </div>
        )}

        {!disabled && messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              No messages yet. Tell it what to lead with or cut.
            </p>
            {!input.trim() && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {buildSuggestions(resume).map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          // "Accept All" must only offer what would actually apply.
          const pending =
            msg.proposals?.filter(
              (p) => p.resolution === "pending" && tex.includes(p.find)
            ) ?? [];
          return (
            <div key={i}>
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  // break-words: the assistant quotes LaTeX and file paths, and
                  // one `\section{Professional Experience}` with no space in it
                  // pushed the bubble past the 366px chat panel.
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                      : "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]"
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {msg.proposals && msg.proposals.length > 0 && (
                <div className="mt-2">
                  {pending.length > 1 && (
                    <div className="mb-2 flex justify-end gap-2">
                      <button
                        onClick={() => pending.forEach((p) => onAcceptProposal(i, p.id))}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        Accept All
                      </button>
                      <button
                        onClick={() => pending.forEach((p) => onRejectProposal(i, p.id))}
                        className="btn-secondary px-3 py-1.5 text-xs"
                      >
                        Reject All
                      </button>
                    </div>
                  )}
                  {msg.proposals.map((p) => (
                    <ResumeProposalCard
                      key={p.id}
                      proposal={p}
                      // Checked against the source as it stands, not as it was
                      // when the model saw it — an edit in between makes the
                      // patch unapplicable, and the card has to say so rather
                      // than offer a button that does nothing.
                      unappliable={!tex.includes(p.find)}
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
            <div className="rounded-xl bg-[var(--color-surface-overlay)] px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-text-muted)]"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--color-border-subtle)] px-4 py-3">
        {error && <p className="mb-2 text-xs text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="e.g. lead Shopify with the ledger work…"
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

function shorten(text: string, max = 34): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Openers built from this document rather than a fixed list — a suggestion
 * naming a company the candidate never worked at reads as if the tool hasn't
 * looked at their document.
 */
function buildSuggestions(resume: TailoredResume | null): string[] {
  if (!resume) return [];
  const out: string[] = [];
  const entries = allEntries(resume);

  const first = entries.find((e) => e.organization.trim());
  if (first) out.push(`Make ${shorten(first.organization, 20)} the strongest section`);

  // Only offer these when there is actually something to bring back.
  const hasDropped = entries.some((e) => e.bullets.some((b) => b.dropped));
  if (hasDropped) out.push("Put the cut bullets back");

  // Material from the uploaded document that never made the page at all —
  // different from a bullet trimmed for space, and worth its own prompt.
  if ((resume.omitted ?? []).length) out.push("What did you leave out?");
  if ((resume.collapsed ?? []).length) out.push("Expand the earlier roles");

  const longest = entries
    .flatMap((e) => visibleBullets(e.bullets))
    .sort((a, b) => b.value.length - a.value.length)[0];
  if (longest) out.push(`Tighten "${shorten(longest.value)}"`);

  // Regroup, not trim: the route only accepts a permutation of the skills the
  // document already claims, so a "cut these skills" prompt would go nowhere.
  const keywords = resume.sections.flatMap((s) => flattenSkills(s.keywords?.value ?? []));
  if (keywords.length > 6) out.push("Put this job's must-haves first in skills");

  return out.slice(0, 4);
}
