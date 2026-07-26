"use client";

import type { MatchReport, MatchReportItem, MatchStatus, RequirementImportance } from "@/types";

type Props = {
  report: MatchReport | null;
  canAnalyze: boolean;
  loading: boolean;
  error: string;
  onAnalyze: () => void;
  /** Requirement currently attached to the chat question, if any. */
  attachedItemId: string | null;
  onAttachItem: (id: string) => void;
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
  const severity = score >= 75 ? "success" : score >= 45 ? "warning" : "danger";
  const color = `var(--color-${severity})`;
  // Unfilled track is a lighter step of the same hue, so the arc reads as a
  // proportion of the whole rather than a floating fragment.
  const track = `var(--color-${severity}-muted)`;

  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={track}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            // Start the arc at 12 o'clock instead of 3 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 500ms ease-out" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-lg font-semibold"
          style={{ color }}
          role="img"
          aria-label={`Fit score ${score} out of 100`}
        >
          {score}
        </span>
      </div>
      <p className="text-[10px] text-[var(--color-text-muted)] mt-1 uppercase tracking-wide">
        Fit score
      </p>
    </div>
  );
}

export default function MatchReportView({
  report,
  canAnalyze,
  loading,
  error,
  onAnalyze,
  attachedItemId,
  onAttachItem,
}: Props) {
  if (!report) {
    // Analysis auto-runs on arrival, so the normal state here is "working".
    if (loading) {
      return (
        <div className="glass-panel p-8 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--color-text-secondary)]">Analyzing your match…</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Comparing your resume against every requirement in the posting.
          </p>
        </div>
      );
    }

    return (
      <div className="glass-panel p-5">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          {error
            ? "The analysis didn't complete."
            : "Once your resume and the job description are both loaded, analyze them to see a weighted match report — what matches, what's partial, and what's missing."}
        </p>
        {error && <p className="text-[var(--color-danger)] text-xs mb-3">{error}</p>}
        <button onClick={onAnalyze} disabled={!canAnalyze} className="btn-primary w-full">
          {error ? "Try again" : "Analyze match"}
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

      <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
        Click a requirement to ask the chat about it
      </p>

      <div className="space-y-2 mb-4">
        {sorted.map((item) => {
          const attached = item.id === attachedItemId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onAttachItem(item.id)}
              aria-pressed={attached}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                attached
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                  : "border-[var(--color-border-subtle)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-medium min-w-0">{item.requirement}</p>
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
              {attached && (
                <p className="text-[10px] font-medium text-[var(--color-accent)] mt-2">
                  Attached to your next chat message
                </p>
              )}
            </button>
          );
        })}
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
