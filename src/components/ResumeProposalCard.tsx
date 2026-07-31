"use client";

import type { ResolvedResumeTexProposal } from "@/types";

/**
 * A chat-proposed edit to the LaTeX source, as an accept/reject diff.
 *
 * The diff lives here and only here. The editor shows the document as it
 * stands, with no review chrome in it; anything the assistant suggests is a
 * proposal until you say otherwise, and this is where you say so.
 *
 * Both sides are shown as the raw source rather than rendered text. The patch
 * is applied to the source, so the source is what you need to be able to check
 * — and a stray brace is the whole difference between a document that compiles
 * and one that doesn't.
 */

type Props = {
  proposal: ResolvedResumeTexProposal;
  /** True when the source moved on and `find` no longer matches. */
  unappliable: boolean;
  onAccept: () => void;
  onReject: () => void;
};

function Side({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "before" | "after";
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        tone === "after"
          ? "border-[var(--color-accent)]/40 bg-[var(--color-surface)]"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface)]"
      }`}
    >
      <p
        className={`mb-0.5 text-[10px] uppercase tracking-wide ${
          tone === "after" ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
        }`}
      >
        {label}
      </p>
      <pre
        className={`max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${
          tone === "after"
            ? "font-medium text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)]"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}

export default function ResumeProposalCard({
  proposal,
  unappliable,
  onAccept,
  onReject,
}: Props) {
  const { location, find, replace, rationale, resolution } = proposal;
  const removing = !replace.trim();

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          {removing ? "Remove" : "Rewrite"}
        </span>
        {resolution !== "pending" && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              resolution === "accepted"
                ? "bg-[var(--color-success-muted)] text-[var(--color-success)]"
                : "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]"
            }`}
          >
            {resolution === "accepted" ? "Accepted" : "Rejected"}
          </span>
        )}
      </div>

      {location && (
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {location}
        </p>
      )}

      <div className="space-y-1.5">
        <Side label={removing ? "Removing" : "Now"} text={find} tone="before" />
        {!removing && <Side label="Proposed" text={replace} tone="after" />}
      </div>

      {rationale && (
        <p className="mt-2 text-xs italic text-[var(--color-text-secondary)]">{rationale}</p>
      )}

      {resolution === "pending" &&
        (unappliable ? (
          <p className="mt-3 rounded-lg bg-[var(--color-surface-overlay)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
            You&apos;ve since edited this passage, so this no longer applies. Ask again to get a
            fresh suggestion against the current text.
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={onAccept} className="btn-primary flex-1 px-3 py-1.5 text-xs">
              Accept
            </button>
            <button onClick={onReject} className="btn-secondary flex-1 px-3 py-1.5 text-xs">
              Reject
            </button>
          </div>
        ))}
    </div>
  );
}
