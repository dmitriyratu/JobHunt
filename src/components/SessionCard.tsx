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
import SourceLink from "./SourceLink";
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <div className="text-xs text-[var(--color-text-secondary)] break-words">{children}</div>
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
  // invalid HTML and make click handling unpredictable. The detail panel is a
  // sibling for the same reason: it holds a link to the posting, and an anchor
  // inside a button is both invalid and unclickable — the button swallows it.
  // The border therefore sits on the wrapper, so the two still read as one card.
  return (
    <div className="group relative">
      <div
        className={`rounded-lg border transition-colors ${
          active
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
            : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] hover:border-[var(--color-text-muted)]"
        }`}
      >
        <button onClick={onSelect} aria-expanded={expanded} className="w-full p-3 text-left">
          {/* Brand mark leads, role reads beside it — the two things you scan a
              list of applications for. The tile keeps a constant footprint
              whether it holds a wordmark or the initials fallback, so the
              headlines stay aligned down the rail. */}
          <div className="flex items-start gap-3 pr-5">
            {company && (
              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-1.5">
                <CompanyLogo
                  company={company}
                  domain={session.detectedCompanyDomain}
                  variant="tile"
                />
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
        </button>

        {expanded && (
          <div className="mx-3 mb-3 space-y-2 border-t border-[var(--color-border-subtle)] pt-3">
            <DetailRow label="Resume">{session.resumeFilename || "Not uploaded"}</DetailRow>
            <DetailRow label="Job description">
              <SourceLink
                source={session.jobSource}
                fallback="Not loaded"
                className="inline-block max-w-full truncate align-bottom"
              />
            </DetailRow>
            {session.matchReport && (
              <DetailRow label="Requirements">
                {session.matchReport.items.length} analyzed ·{" "}
                {session.matchReport.items.filter((i) => i.status === "match").length} matched
              </DetailRow>
            )}
            {session.generatedSubject && (
              <DetailRow label="Subject">{session.generatedSubject}</DetailRow>
            )}
            <DetailRow label="Created">
              {new Date(session.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </DetailRow>
          </div>
        )}
      </div>

      {!confirming && (
        <button
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${title}`}
          title="Delete application"
          // Revealed on hover on a mouse, but always present on a touch screen —
          // there is no hover there, so hiding it made deleting impossible on a
          // phone.
          // `tap-area`, not `tap`: the card only reserves 20px of right padding
          // for this, so a button that actually grew to 44px would sit on the
          // job title. The mark stays 28px and the touch target around it is
          // 44 — it was 22px, permanently visible on touch, which made the one
          // destructive control here the smallest target in the app.
          className="tap-area absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)] [@media(pointer:coarse)]:opacity-100"
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
          {/* Same corner and the same touch minimum on both. They had drifted
              to 8px against 6px, and to a 40px coarse target where every .btn-*
              in the app uses 44. */}
          <button
            onClick={onDelete}
            className="tap shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-danger)] px-3 py-1.5 text-xs font-medium text-[var(--color-on-danger)]"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="tap shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)]"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
