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

export default function SessionCard({ session, expanded, onSelect, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  const title = sessionTitle(session);
  const company = resolveCompany(session);
  const stage = sessionStage(session);
  const score = session.matchReport?.overallScore;
  // The company already has its own row above, so don't repeat it in the
  // title line — show just the role there when we know it.
  const roleLabel = session.detectedJobTitle.trim() || title;

  // Delete is a sibling of the card button, never a child — nested buttons are
  // invalid HTML and make click handling unpredictable.
  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        className={`w-full text-left rounded-lg border p-3 transition-colors ${
          expanded
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
            : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:border-[var(--color-text-muted)]"
        }`}
      >
        {/* Wide wordmark logos get their own row so they read at full width
            instead of being crushed into a square. */}
        {company && (
          <div className="flex items-center h-5 mb-2 pr-5">
            <CompanyLogo company={company} />
          </div>
        )}

        {/* Wraps — never truncated, so the full role is always readable. */}
        <p className={`text-sm font-medium break-words ${company ? "" : "pr-5"}`}>
          {roleLabel}
        </p>

        <div className="flex items-center flex-wrap gap-2 mt-2 text-[10px]">
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

      {confirming ? (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={onDelete}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-danger-muted)] text-[var(--color-danger)]"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${title}`}
          title="Delete application"
          className="absolute top-2 right-2 p-1 rounded text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)] transition-opacity"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      )}
    </div>
  );
}
