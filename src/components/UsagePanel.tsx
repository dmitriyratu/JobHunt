"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TASK_MODELS, type TaskId, type TaskModel } from "@/lib/models";
import { clearUsageLog, loadUsageLog, type UsageEntry } from "@/lib/usage";

/**
 * Lives inside the settings dialog, which returns null while closed — so
 * this remounts on every open and its effects double as "refresh on open".
 */
type Props = {
  /** Saved Admin key; enables OpenAI's own spend figures. */
  adminApiKey: string;
};

const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

const STEP_LABEL: Record<UsageEntry["endpoint"], string> = {
  "triage-document": "Document type",
  "analyze-match": "Match report",
  "report-chat": "Refine chat",
  "tailor-resume": "Resume",
  "verify-grounding": "Grounding check",
  "repair-grounding": "Grounding repair",
  "resume-chat": "Resume chat",
  "generate-email": "Letter",
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

function Disclosure({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
        <svg
          className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {label}
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

type Reported = { monthToDate: number; currency: string; periodStart: string };

export default function UsagePanel({ adminApiKey }: Props) {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [reported, setReported] = useState<Reported | null>(null);
  const [reportError, setReportError] = useState("");
  const [loadingReported, setLoadingReported] = useState(false);

  useEffect(() => {
    setEntries(loadUsageLog());
  }, []);

  // OpenAI's own figures, when an Admin key is configured.
  useEffect(() => {
    if (!adminApiKey) {
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
        if (!r.ok) setReportError(data.error ?? "Could not read your OpenAI spend.");
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
  }, [adminApiKey]);

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

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Nothing spent yet.</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Costs appear here once you run a match report or write a letter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* One number, stated plainly. The four-tile grid made the reader do the
          work of deciding which figure mattered. */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center">
        <p className="text-xs text-[var(--color-text-muted)]">Spent this month</p>
        <p className="mt-1 text-4xl font-semibold [font-variant-numeric:tabular-nums]">
          {formatUsd(estMonth)}
        </p>
        <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
          {thisMonth.length} {thisMonth.length === 1 ? "request" : "requests"} this month ·{" "}
          {formatUsd(estAll)} since you started
        </p>
      </div>

      {adminApiKey && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-3">
          {loadingReported ? (
            <p className="text-xs text-[var(--color-text-secondary)]">
              Checking your OpenAI account…
            </p>
          ) : reportError ? (
            <p className="text-xs text-[var(--color-danger)]">{reportError}</p>
          ) : reported ? (
            <p className="text-xs text-[var(--color-text-secondary)]">
              OpenAI reports{" "}
              <strong className="text-[var(--color-text-primary)]">
                {formatUsd(reported.monthToDate)}
              </strong>{" "}
              across your whole account this month
              {reported.monthToDate > 0 && (
                <> — JobHunt is about {Math.round((estMonth / reported.monthToDate) * 100)}% of it</>
              )}
              .
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-3">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Your remaining balance lives on OpenAI&rsquo;s site — they don&rsquo;t share it with apps.
        </p>
        <a
          href={BILLING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
        >
          Check balance ↗
        </a>
      </div>

      <Disclosure label="Recent activity">
        <div className="max-h-[280px] overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface)]">
              <tr className="border-b border-[var(--color-border-subtle)] text-left text-xs text-[var(--color-text-muted)]">
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Step</th>
                <th className="py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="[font-variant-numeric:tabular-nums]">
              {recent.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[var(--color-border-subtle)] last:border-0"
                >
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-[var(--color-text-secondary)]">
                    {new Date(entry.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-4 text-xs">{STEP_LABEL[entry.endpoint]}</td>
                  <td className="py-2 text-right text-xs font-medium">
                    {formatUsd(entry.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end">
          {confirmingClear ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">Clear this history?</span>
              <button
                onClick={handleClear}
                className="btn-secondary px-3 py-1.5 text-xs text-[var(--color-danger)]"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setConfirmingClear(false)}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingClear(true)}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Clear history
            </button>
          )}
        </div>
      </Disclosure>

      <Disclosure label="Why does it cost this?">
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          Each step uses the model best suited to it, so you aren&rsquo;t paying top rates for
          simple work. Nothing here is adjustable.
        </p>
        <ul className="space-y-2">
          {(Object.entries(TASK_MODELS) as [TaskId, TaskModel][]).map(([task, meta]) => (
            <li
              key={task}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{meta.task}</span>
                <span className="shrink-0 font-mono text-xs text-[var(--color-text-secondary)]">
                  {meta.label}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{meta.why}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          These figures are close estimates based on OpenAI&rsquo;s published rates.
        </p>
      </Disclosure>
    </div>
  );
}
