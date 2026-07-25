"use client";

import type { MatchReport, MatchReportItem, MatchStatus, RequirementImportance } from "@/types";

type Props = {
  report: MatchReport | null;
  canAnalyze: boolean;
  loading: boolean;
  error: string;
  onAnalyze: () => void;
};

const IMPORTANCE_ORDER: Record<RequirementImportance, number> = {
  critical: 0,
  important: 1,
  "nice-to-have": 2,
};

const STATUS_ORDER: Record<MatchStatus, number> = {
  gap: 0,
  partial: 1,
  match: 2,
};

const IMPORTANCE_LABEL: Record<RequirementImportance, string> = {
  critical: "Critical",
  important: "Important",
  "nice-to-have": "Nice to have",
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  match: "Match",
  partial: "Partial",
  gap: "Gap",
};

function sortItems(items: MatchReportItem[]): MatchReportItem[] {
  return [...items].sort(
    (a, b) =>
      IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  );
}

export function StatusPill({ status }: { status: MatchStatus }) {
  const classes: Record<MatchStatus, string> = {
    match: "bg-[var(--color-success-muted)] text-[var(--color-success)]",
    partial: "bg-[var(--color-warning)]/20 text-[var(--color-warning)]",
    gap: "bg-[var(--color-danger-muted)] text-[var(--color-danger)]",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${classes[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ImportancePill({ importance }: { importance: RequirementImportance }) {
  const classes: Record<RequirementImportance, string> = {
    critical: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
    important: "bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]",
    "nice-to-have": "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${classes[importance]}`}>
      {IMPORTANCE_LABEL[importance]}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 75 ? "var(--color-success)" : score >= 45 ? "var(--color-warning)" : "var(--color-danger)";
  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold"
        style={{
          border: `3px solid ${color}`,
          color,
        }}
      >
        {score}
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)] mt-1 uppercase tracking-wide">
        Fit score
      </p>
    </div>
  );
}

export default function MatchReportView({ report, canAnalyze, loading, error, onAnalyze }: Props) {
  if (!report) {
    return (
      <div className="glass-panel p-5">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Once your resume and the job description are both loaded, analyze them to see a
          weighted match report — what matches, what&rsquo;s partial, and what&rsquo;s missing.
        </p>
        {error && <p className="text-[var(--color-danger)] text-xs mb-3">{error}</p>}
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze || loading}
          className="btn-primary w-full"
        >
          {loading ? "Analyzing…" : "Analyze match"}
        </button>
      </div>
    );
  }

  const sorted = sortItems(report.items);

  return (
    <div className="glass-panel p-5">
      <div className="flex items-start gap-4 mb-4">
        <ScoreRing score={report.overallScore} />
        <div className="min-w-0">
          <h3 className="font-medium text-sm mb-1">Match report</h3>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            {report.summary}
          </p>
        </div>
      </div>

      {error && <p className="text-[var(--color-danger)] text-xs mb-3">{error}</p>}

      <div className="space-y-2 mb-4">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-sm font-medium min-w-0 truncate">{item.requirement}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <ImportancePill importance={item.importance} />
                <StatusPill status={item.status} />
              </div>
            </div>
            {item.evidence && (
              <p className="text-xs text-[var(--color-text-secondary)]">{item.evidence}</p>
            )}
            {item.note && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{item.note}</p>
            )}
          </div>
        ))}
      </div>

      <button onClick={onAnalyze} disabled={loading} className="btn-secondary w-full text-xs">
        {loading ? "Re-analyzing…" : "Re-analyze match"}
      </button>
      <p className="text-[10px] text-[var(--color-text-muted)] mt-2 text-center">
        Re-analyzing replaces this report, including any accepted chat edits.
      </p>
    </div>
  );
}
