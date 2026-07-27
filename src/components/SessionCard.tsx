"use client";

import { useState } from "react";
import {
  formatRelativeTime,
  resolveCompany,
  sessionStage,
  sessionTitle,
  STAGE_LABEL,
} from "@/lib/session";
import CompanyLogo from "./CompanyLogo";
import type { Session } from "@/types";

type Props = {
  session: Session;
  /** This is the application currently loaded in the workspace. */
  active: boolean;
  /**
   * Details are showing. Kept separate from `active` so clicking away can
   * collapse a card back to its compact form without switching applications.
   */
  expanded: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

function scoreClass(score: number): string {
  if (score >= 75) return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
  if (score >= 45) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-danger-muted)] text-[var(--color-danger)]";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="text-xs text-[var(--color-text-secondary)] break-words">{value}</p>
    </div>
  );
}

export default function SessionCard({
  session,
  active,
  expanded,
  onSelect,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  const title = sessionTitle(session);
  const company = resolveCompany(session);
  const stage = sessionStage(session);
  const score = session.matchReport?.overallScore;
  // The company reads from the logo tile and its own line, so the headline
  // shows just the role when we know it.
  const roleLabel = session.detectedJobTitle.trim() || title;

  // Delete is a sibling of the card button, never a child — nested buttons are
  // invalid HTML and make click handling unpredictable.
  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        aria-expanded={expanded}
        className={`w-full text-left rounded-lg border p-3 transition-colors ${
          active
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
            : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:border-[var(--color-text-muted)]"
        }`}
      >
        {/* Brand mark leads, role reads beside it — the two things you scan a
            list of applications for. The tile keeps a constant footprint
            whether it holds a wordmark or the initials fallback, so the
            headlines stay aligned down the rail. */}
        <div className="flex items-start gap-3 pr-5">
          {company && (
            <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-1.5">
              <CompanyLogo company={company} variant="tile" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {/* Wraps — never truncated, so the full role is always readable. */}
            <p className="text-sm font-medium break-words leading-snug">{roleLabel}</p>
            {company && (
              <p className="text-xs text-[var(--color-text-muted)] break-words mt-0.5">
                {company}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-2.5 text-[10px]">
          {typeof score === "number" ? (
            <span className={`px-1.5 py-0.5 rounded-full font-medium ${scoreClass(score)}`}>
              {score}/100
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full font-medium bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]">
              Not analyzed
            </span>
          )}
          <span className="text-[var(--color-text-muted)]">{STAGE_LABEL[stage]}</span>
          <span className="text-[var(--color-text-muted)] ml-auto">
            {formatRelativeTime(session.updatedAt)}
          </span>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
            <DetailRow label="Resume" value={session.resumeFilename || "Not uploaded"} />
            <DetailRow
              label="Job description"
              value={session.jobSource || "Not loaded"}
            />
            {session.matchReport && (
              <DetailRow
                label="Requirements"
                value={`${session.matchReport.items.length} analyzed · ${session.matchReport.items.filter((i) => i.status === "match").length} matched`}
              />
            )}
            {session.generatedSubject && (
              <DetailRow label="Subject" value={session.generatedSubject} />
            )}
            <DetailRow
              label="Created"
              value={new Date(session.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            />
          </div>
        )}
      </button>

      {!confirming && (
        <button
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${title}`}
          title="Delete application"
          // Revealed on hover on a mouse, but always present on a touch screen —
          // there is no hover there, so hiding it made deleting impossible on a
          // phone.
          className="absolute top-2 right-2 p-1 rounded text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100 hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)] transition-opacity"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      )}

      {/* In normal flow beneath the card, not floating over it. Absolutely
          positioned, the Delete/Cancel pair sat on top of the job title — the
          card only reserves enough right padding for the small trash icon. */}
      {confirming && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-muted)] px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-[var(--color-text-secondary)]">
            Delete this application?
          </p>
          <button
            onClick={onDelete}
            className="shrink-0 rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-xs font-medium text-white [@media(pointer:coarse)]:min-h-[40px]"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] [@media(pointer:coarse)]:min-h-[40px]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
