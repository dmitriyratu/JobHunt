"use client";

import type { MatchReportItem, ResolvedProposal, StandoutItem } from "@/types";
import { ImportancePill, ResultPill } from "./MatchReportView";

type Props = {
  proposal: ResolvedProposal;
  onAccept: () => void;
  onReject: () => void;
};

const ACTION_LABEL: Record<ResolvedProposal["action"], string> = {
  add: "Added",
  modify: "Modified",
  remove: "Removed",
};

function fieldChanged<T, K extends keyof T>(
  before: T | null | undefined,
  after: T,
  field: K
): boolean {
  if (!before) return false;
  return before[field] !== after[field];
}

const PREVIEW_CLASS =
  "rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3";

function ItemPreview({
  item,
  compareTo,
}: {
  item: MatchReportItem;
  compareTo?: MatchReportItem | null;
}) {
  const changed = <K extends keyof MatchReportItem>(field: K) =>
    fieldChanged(compareTo, item, field);

  return (
    <div className={PREVIEW_CLASS}>
      <p className={`text-sm mb-1.5 ${changed("requirement") ? "font-semibold" : "font-medium"}`}>
        {item.requirement}
      </p>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={changed("importance") ? "ring-1 ring-[var(--color-accent)] rounded-full" : ""}>
          <ImportancePill importance={item.importance} />
        </span>
        <span
          className={
            changed("status") || changed("strength")
              ? "ring-1 ring-[var(--color-accent)] rounded-full"
              : ""
          }
        >
          <ResultPill status={item.status} strength={item.strength} />
        </span>
      </div>
      {item.evidence && (
        <p
          className={`text-xs text-[var(--color-text-secondary)] ${
            changed("evidence") ? "font-semibold" : ""
          }`}
        >
          {item.evidence}
        </p>
      )}
      {item.note && (
        <p
          className={`text-xs text-[var(--color-text-muted)] mt-1 ${
            changed("note") ? "font-semibold" : ""
          }`}
        >
          {item.note}
        </p>
      )}
    </div>
  );
}

function StandoutPreview({
  item,
  compareTo,
}: {
  item: StandoutItem;
  compareTo?: StandoutItem | null;
}) {
  const changed = <K extends keyof StandoutItem>(field: K) =>
    fieldChanged(compareTo, item, field);

  return (
    <div className={PREVIEW_CLASS}>
      <p className={`text-sm mb-1.5 ${changed("credential") ? "font-semibold" : "font-medium"}`}>
        {item.credential}
      </p>
      {item.evidence && (
        <p
          className={`text-xs text-[var(--color-text-secondary)] ${
            changed("evidence") ? "font-semibold" : ""
          }`}
        >
          {item.evidence}
        </p>
      )}
      {item.whyValuable && (
        <p
          className={`text-xs text-[var(--color-text-muted)] mt-1 ${
            changed("whyValuable") ? "font-semibold" : ""
          }`}
        >
          {item.whyValuable}
        </p>
      )}
    </div>
  );
}

/**
 * A fact has no before and no after — it is one claim, appearing for the first
 * time — so it gets a single panel rather than the two-column diff.
 *
 * The second line is the part worth reading: unlike every other proposal here,
 * accepting this one reaches past the application you are looking at. Said once,
 * plainly, and not repeated on the card.
 */
function FactPreview({ text }: { text: string }) {
  return (
    <div className={PREVIEW_CLASS}>
      <p className="text-sm font-medium">{text}</p>
      <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
        Added to what your resume says about you, for this application and every one after
        it. Remove it any time under Your Profile.
      </p>
    </div>
  );
}

export default function ProposalDiffCard({ proposal, onAccept, onReject }: Props) {
  const { action, rationale, resolution } = proposal;

  // Narrow on `target` rather than destructuring before/after up front, so the
  // union keeps the correlation between the target and the payload type.
  const before =
    proposal.target === "fact"
      ? null
      : proposal.target === "standout"
        ? proposal.before && <StandoutPreview item={proposal.before} />
        : proposal.before && <ItemPreview item={proposal.before} />;
  const after =
    proposal.target === "fact"
      ? proposal.after && <FactPreview text={proposal.after.text} />
      : proposal.target === "standout"
        ? proposal.after && (
            <StandoutPreview item={proposal.after} compareTo={proposal.before} />
          )
        : proposal.after && <ItemPreview item={proposal.after} compareTo={proposal.before} />;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wide">
          {/* "Added" alone would read as another edit to this report, which is
              the one thing this proposal is not. */}
          {proposal.target === "fact" ? "Remember about you" : ACTION_LABEL[action]}
          {proposal.target === "standout" ? " standout" : ""}
        </span>
        {resolution !== "pending" && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              resolution === "accepted"
                ? "bg-[var(--color-success-muted)] text-[var(--color-success)]"
                : "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]"
            }`}
          >
            {resolution === "accepted" ? "Accepted" : "Rejected"}
          </span>
        )}
      </div>

      {/* A fact has nothing to compare against, so it takes the full width and
          drops the Before/After captions — "After" over a lone panel describes
          a change that never had a before. */}
      {/* Stacked, always. Before/after side by side needs about 340px, and this
          card lives inside a 380px chat panel at every window size — so `sm:`
          was reading a viewport the card has no relationship to, and on any
          tablet it split the two previews into 165px columns. */}
      <div className="mb-2 grid grid-cols-1 gap-2">
        {before && (
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Before
            </p>
            {before}
          </div>
        )}
        {after && (
          <div>
            {proposal.target !== "fact" && (
              <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                After
              </p>
            )}
            {after}
          </div>
        )}
      </div>

      {rationale && (
        <p className="text-xs text-[var(--color-text-secondary)] italic mb-3">{rationale}</p>
      )}

      {resolution === "pending" && (
        <div className="flex gap-2">
          <button onClick={onAccept} className="btn-primary text-xs py-1.5 px-3 flex-1">
            Accept
          </button>
          <button onClick={onReject} className="btn-secondary text-xs py-1.5 px-3 flex-1">
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
