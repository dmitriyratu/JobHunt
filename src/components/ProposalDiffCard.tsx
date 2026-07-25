"use client";

import type { MatchReportItem, ResolvedProposal } from "@/types";
import { ImportancePill, StatusPill } from "./MatchReportView";

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

function fieldChanged<K extends keyof MatchReportItem>(
  before: MatchReportItem | null | undefined,
  after: MatchReportItem,
  field: K
): boolean {
  if (!before) return false;
  return before[field] !== after[field];
}

function ItemPreview({
  item,
  compareTo,
}: {
  item: MatchReportItem;
  compareTo?: MatchReportItem | null;
}) {
  const changed = <K extends keyof MatchReportItem>(field: K) => fieldChanged(compareTo, item, field);

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
      <p className={`text-sm mb-1.5 ${changed("requirement") ? "font-semibold" : "font-medium"}`}>
        {item.requirement}
      </p>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={changed("importance") ? "ring-1 ring-[var(--color-accent)] rounded-full" : ""}>
          <ImportancePill importance={item.importance} />
        </span>
        <span className={changed("status") ? "ring-1 ring-[var(--color-accent)] rounded-full" : ""}>
          <StatusPill status={item.status} />
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

export default function ProposalDiffCard({ proposal, onAccept, onReject }: Props) {
  const { action, before, after, rationale, resolution } = proposal;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--color-accent)] uppercase tracking-wide">
          {ACTION_LABEL[action]}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        {before && (
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              Before
            </p>
            <ItemPreview item={before} />
          </div>
        )}
        {after && (
          <div>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
              After
            </p>
            <ItemPreview item={after} compareTo={before} />
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
