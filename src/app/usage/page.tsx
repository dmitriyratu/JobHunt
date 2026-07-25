"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { loadSettings, type AppSettings } from "@/lib/settings";
import { clearUsageLog, loadUsageLog, type UsageEntry } from "@/lib/usage";
import { useJobHuntState } from "@/lib/useAppState";

function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

const ENDPOINT_LABEL: Record<UsageEntry["endpoint"], string> = {
  "analyze-match": "Analyze match",
  "report-chat": "Refine chat",
  "generate-email": "Generate letter",
};

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-panel p-4">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

export default function UsagePage() {
  const { state, hydrated: stateHydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setEntries(loadUsageLog());
  }, []);

  const handleClear = useCallback(() => {
    clearUsageLog();
    setEntries([]);
    setConfirmingClear(false);
  }, []);

  const now = useMemo(() => new Date(), []);
  const thisMonthEntries = useMemo(
    () => entries.filter((e) => isSameMonth(e.timestamp, now)),
    [entries, now]
  );
  const spentThisMonth = thisMonthEntries.reduce((sum, e) => sum + e.costUsd, 0);
  const spentAllTime = entries.reduce((sum, e) => sum + e.costUsd, 0);
  const budget = settings?.monthlyBudgetUsd ?? 0;
  const remaining = budget - spentThisMonth;
  const ratio = budget > 0 ? spentThisMonth / budget : 0;

  const severity = ratio > 1 ? "danger" : ratio >= 0.75 ? "warning" : "success";
  const meterFill = `var(--color-${severity})`;
  const meterTrack = `var(--color-${severity}-muted)`;

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50),
    [entries]
  );

  if (!stateHydrated || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const canReachMatch = Boolean(state.resumeText && state.jobDescription);
  const canReachLetter = Boolean(state.resumeText && state.jobDescription && state.matchReport);

  return (
    <div className="min-h-screen">
      <AppHeader
        subtitle="LLM usage & spend"
        canReachMatch={canReachMatch}
        canReachLetter={canReachLetter}
      />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Spent this month" value={formatUsd(spentThisMonth)} />
          <StatTile
            label="Remaining this month"
            value={budget > 0 ? formatUsd(remaining) : "—"}
            hint={budget > 0 ? `of ${formatUsd(budget)} budget` : "No budget set"}
          />
          <StatTile label="Total spent all-time" value={formatUsd(spentAllTime)} />
          <StatTile label="Calls this month" value={String(thisMonthEntries.length)} />
        </div>

        {budget > 0 && (
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Monthly budget</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                {formatUsd(spentThisMonth)} / {formatUsd(budget)} ({Math.round(ratio * 100)}%)
              </p>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: meterTrack }}
              role="progressbar"
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(ratio, 1) * 100}%`, background: meterFill }}
              />
            </div>
            {ratio > 1 && (
              <p className="text-xs text-[var(--color-danger)] mt-2">
                Over budget by {formatUsd(spentThisMonth - budget)} this month.
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Adjust your budget and per-model pricing in AI settings on any page. Costs are
              estimates based on token usage — verify current rates at platform.openai.com/pricing.
            </p>
          </div>
        )}

        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-sm">Recent calls</h3>
            {entries.length > 0 &&
              (confirmingClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--color-text-muted)]">Clear all history?</span>
                  <button onClick={handleClear} className="btn-secondary text-xs py-1.5 px-3 text-[var(--color-danger)]">
                    Confirm clear
                  </button>
                  <button onClick={() => setConfirmingClear(false)} className="btn-secondary text-xs py-1.5 px-3">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmingClear(true)} className="btn-secondary text-xs py-1.5 px-3">
                  Clear log
                </button>
              ))}
          </div>

          {sortedEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                No usage recorded yet — analyze a match, refine it, or generate a letter to see
                spend show up here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                    <th className="font-medium py-2 pr-4">Date</th>
                    <th className="font-medium py-2 pr-4">Action</th>
                    <th className="font-medium py-2 pr-4">Model</th>
                    <th className="font-medium py-2 pr-4 text-right">Tokens</th>
                    <th className="font-medium py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="[font-variant-numeric:tabular-nums]">
                  {sortedEntries.map((entry) => (
                    <tr key={entry.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)] whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 pr-4">{ENDPOINT_LABEL[entry.endpoint]}</td>
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)] font-mono text-xs">
                        {entry.model}
                      </td>
                      <td className="py-2 pr-4 text-right text-[var(--color-text-secondary)]">
                        {entry.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-2 text-right font-medium">{formatUsd(entry.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
