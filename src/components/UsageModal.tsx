"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clearUsageLog, loadUsageLog, type UsageEntry } from "@/lib/usage";

type Props = {
  open: boolean;
  onClose: () => void;
  adminApiKey: string;
};

const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

const ENDPOINT_LABEL: Record<UsageEntry["endpoint"], string> = {
  "analyze-match": "Analyze match",
  "report-chat": "Refine chat",
  "generate-email": "Generate letter",
};

function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{value}</p>
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

type Reported = { monthToDate: number; currency: string; periodStart: string };

export default function UsageModal({ open, onClose, adminApiKey }: Props) {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);
  const [reportError, setReportError] = useState("");
  const [loadingReported, setLoadingReported] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEntries(loadUsageLog());
    setConfirmingClear(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // OpenAI's own figures, when an Admin key is configured.
  useEffect(() => {
    if (!open || !adminApiKey) {
      setReported(null);
      setReportError("");
      return;
    }
    let cancelled = false;
    setLoadingReported(true);
    setReportError("");
    fetch("/api/openai-costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminApiKey }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) setReportError(data.error ?? "Could not read OpenAI costs.");
        else setReported(data);
      })
      .catch(() => {
        if (!cancelled) setReportError("Could not reach OpenAI.");
      })
      .finally(() => {
        if (!cancelled) setLoadingReported(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, adminApiKey]);

  const handleClear = useCallback(() => {
    clearUsageLog();
    setEntries([]);
    setConfirmingClear(false);
  }, []);

  const now = useMemo(() => new Date(), []);
  const thisMonth = useMemo(
    () => entries.filter((e) => isSameMonth(e.timestamp, now)),
    [entries, now]
  );
  const estMonth = thisMonth.reduce((s, e) => s + e.costUsd, 0);
  const estAll = entries.reduce((s, e) => s + e.costUsd, 0);
  const recent = useMemo(
    () => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50),
    [entries]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-4xl my-8 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="LLM usage and spend"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <h2 className="font-medium text-sm">Usage &amp; spend</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              What this app has cost you
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary text-xs py-1.5 px-3">
            Close
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Remaining credit is not exposed by any API key — see the route
              comment in /api/openai-costs. Be explicit rather than guessing. */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">
                  Remaining account credit
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  OpenAI doesn&rsquo;t expose your balance to any API key — the only endpoint that
                  did is browser-session-only. It has to be checked on their dashboard.
                </p>
              </div>
              <a
                href={BILLING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs py-1.5 px-3 shrink-0"
              >
                Open OpenAI billing ↗
              </a>
            </div>
          </div>

          {adminApiKey ? (
            <div>
              <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
                Reported by OpenAI (authoritative)
              </p>
              {loadingReported ? (
                <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Reading your OpenAI costs…
                  </p>
                </div>
              ) : reportError ? (
                <div className="rounded-lg bg-[var(--color-danger-muted)] border border-[var(--color-danger)]/20 px-4 py-3">
                  <p className="text-[var(--color-danger)] text-xs">{reportError}</p>
                </div>
              ) : reported ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatTile
                    label="Spent this month (all OpenAI usage)"
                    value={formatUsd(reported.monthToDate)}
                    hint={`Since ${reported.periodStart} · ${reported.currency.toUpperCase()}`}
                  />
                  <StatTile
                    label="This app's share (estimated)"
                    value={formatUsd(estMonth)}
                    hint={
                      reported.monthToDate > 0
                        ? `${Math.round((estMonth / reported.monthToDate) * 100)}% of your OpenAI spend`
                        : "No OpenAI spend recorded yet"
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)]">
                Add an OpenAI <strong>Admin key</strong> in AI settings to show OpenAI&rsquo;s own
                spend figures here instead of the local estimates below.
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">
              Estimated from this app&rsquo;s own token counts
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile label="This month" value={formatUsd(estMonth)} />
              <StatTile label="All time" value={formatUsd(estAll)} />
              <StatTile label="Calls this month" value={String(thisMonth.length)} />
              <StatTile label="Calls all time" value={String(entries.length)} />
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Token counts are exact; the dollar figures use the per-model rates in this app, so
              treat them as close estimates.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">Recent calls</p>
              {entries.length > 0 &&
                (confirmingClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Clear all history?</span>
                    <button
                      onClick={handleClear}
                      className="btn-secondary text-xs py-1.5 px-3 text-[var(--color-danger)]"
                    >
                      Confirm clear
                    </button>
                    <button
                      onClick={() => setConfirmingClear(false)}
                      className="btn-secondary text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingClear(true)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Clear log
                  </button>
                ))}
            </div>

            {recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
                <p className="text-sm text-[var(--color-text-muted)]">
                  No usage recorded yet — analyze a match, refine it, or generate a letter.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--color-surface-raised)]">
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                      <th className="font-medium py-2 pr-4">Date</th>
                      <th className="font-medium py-2 pr-4">Action</th>
                      <th className="font-medium py-2 pr-4">Model</th>
                      <th className="font-medium py-2 pr-4 text-right">Tokens</th>
                      <th className="font-medium py-2 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="[font-variant-numeric:tabular-nums]">
                    {recent.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[var(--color-border-subtle)] last:border-0"
                      >
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
        </div>
      </div>
    </div>
  );
}
