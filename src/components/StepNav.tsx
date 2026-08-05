"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getJourneySteps, type StepId } from "@/lib/journey";
import { useJobHuntState } from "@/lib/useAppState";
import { loadUsageLog, USAGE_CHANGED_EVENT, type UsageEndpoint } from "@/lib/usage";

/**
 * Which step of the journey each call belongs to.
 *
 * Spend is recorded per endpoint, but it is read per step — "what did the
 * resume cost me" is the question, not "what did resume-chat cost me". Several
 * endpoints roll up into one step.
 */
const STEP_OF: Record<UsageEndpoint, StepId> = {
  "analyze-match": "match",
  "report-chat": "match",
  // The spelling and name-variant pass over a newly uploaded file. Filed under
  // "resume" it was the reason the first stage never showed a figure while
  // quietly inflating the third.
  //
  // Now that uploading happens under Your Profile rather than on a page, this
  // isn't really a cost of any one application: it lands on whichever was open
  // at the time, and the twenty applications that follow off the same upload
  // pay nothing. "First step" is still the closest true thing to say about it.
  "proofread-resume": "source",
  // Fires on the posting as it loads, which is the first step and is also the
  // only place its output is shown at full size.
  "extract-job-facts": "source",
  "triage-document": "resume",
  "tailor-resume": "resume",
  "verify-grounding": "resume",
  "repair-grounding": "resume",
  "review-facts": "resume",
  "resume-chat": "resume",
  "generate-email": "letter",
};

/**
 * What this application has cost so far, broken down by step, live.
 *
 * In the step bar rather than a panel of its own: spend accrues a step at a
 * time as you move through the journey, and this is the one piece of chrome
 * that's on screen at every step. Reads the log on mount and whenever a call is
 * recorded — see USAGE_CHANGED_EVENT — so it ticks up as you go.
 */
function useSessionCosts(sessionId: string): { byStep: Map<StepId, number>; total: number } {
  const [state, setState] = useState<{ byStep: Map<StepId, number>; total: number }>(() => ({
    byStep: new Map(),
    total: 0,
  }));

  useEffect(() => {
    const read = () => {
      const byStep = new Map<StepId, number>();
      let total = 0;
      for (const entry of loadUsageLog()) {
        if (entry.sessionId !== sessionId) continue;
        const step = STEP_OF[entry.endpoint];
        if (!step) continue;
        byStep.set(step, (byStep.get(step) ?? 0) + entry.costUsd);
        total += entry.costUsd;
      }
      setState({ byStep, total });
    };
    read();
    window.addEventListener(USAGE_CHANGED_EVENT, read);
    // Another tab working on the same application.
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(USAGE_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [sessionId]);

  return state;
}

/** Sub-cent spend is the norm here, so two decimals would read as "$0.00". */
function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/**
 * Prev/next footer for moving through the journey. Navigation is purely
 * navigation — it never clears downstream work (only submitting new material
 * on a page does that), so both directions are always safe.
 *
 * Pinned to the bottom of the viewport so it stays reachable on pages that run
 * long (a twelve-requirement match report is taller than a screen). It is a
 * child of the page's padded container, so `.app-bleed` stretches its surface
 * across that padding — reading the live `--app-pad` rather than a hardcoded
 * 6, so it stays aligned when the padding shrinks on a phone — and `-mb-8`
 * cancels the container's bottom padding, which keeps the bar flush with the
 * viewport edge instead of detaching once scrolled all the way down.
 */
export default function StepNav({ hint }: { hint?: string }) {
  const { state } = useJobHuntState();
  const pathname = usePathname();
  const costs = useSessionCosts(state.id);
  const steps = getJourneySteps(state);
  const i = steps.findIndex((s) => s.href === pathname);
  if (i === -1) return null;

  const prev = i > 0 ? steps[i - 1] : null;
  const next = i < steps.length - 1 ? steps[i + 1] : null;
  const current = steps[i];

  return (
    // h-16 rather than padding: the applications rail's own footer is 64px
    // (p-3 + a 40px button), and the two top borders sit side by side at the
    // bottom of the screen — a few pixels apart reads as a mistake.
    <nav className="app-bleed sticky bottom-0 z-30 mt-8 -mb-8 h-16 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center justify-between gap-3">
      <div className="min-w-0">
        {prev ? (
          // The whole two-line block is the target, and it is padded out to 44px
          // on a touch screen — as a bare inline link the tappable area was the
          // text itself, about 30px of it, at the very bottom of the window.
          <Link
            href={prev.href}
            className="-my-2 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] py-2 pr-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <span aria-hidden>←</span>
            <span className="min-w-0 text-left">
              <span className="eyebrow block">Back</span>
              <span className="block truncate">{prev.label}</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* The running total, which is the one number worth carrying at every
          width — anything narrow gets it alone, and the per-step breakdown
          behind it appears from lg.

          It used to appear from md, back when the breakdown only rendered the
          stages that had spend and so was usually two or three columns wide.
          Now that it is always five, md is about 8px short of holding the row
          and the back link starts truncating to pay for it. */}
      {costs.total > 0 && (
        <div className="shrink-0 text-center leading-tight lg:hidden">
          <p className="eyebrow">Total</p>
          <p className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
            {formatCost(costs.total)}
          </p>
        </div>
      )}

      {/* Every stage, spent or not. Showing only the ones with a figure made the
          row a different shape on every page and left the reader to work out
          whether a missing column meant "free" or "not yet" — a dash says the
          second outright, and the columns stop moving as you walk the journey.

          The dash is muted where a figure is secondary text, so a row of them
          reads as an empty ledger rather than as four values you have to check. */}
      {costs.total > 0 && (
        <dl className="hidden shrink-0 items-center gap-4 text-xs lg:flex">
          {steps.map((s) => {
            const spent = costs.byStep.get(s.id) ?? 0;
            return (
              <div key={s.id} className="text-center leading-tight">
                <dt className="eyebrow">{s.label}</dt>
                <dd
                  className={`tabular-nums ${
                    spent > 0
                      ? "text-[var(--color-text-secondary)]"
                      : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {spent > 0 ? formatCost(spent) : "—"}
                </dd>
              </div>
            );
          })}
          <div className="border-l border-[var(--color-border)] pl-4 text-center leading-tight">
            <dt className="eyebrow">Total</dt>
            <dd className="tabular-nums font-semibold text-[var(--color-text-primary)]">
              {formatCost(costs.total)}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-col items-end gap-1.5 min-w-0">
        {/* One line rather than a stacked "NEXT / label": the arrow already
            says which direction this goes, and the two-line version was the
            tallest thing in a 64px bar. */}
        {next && next.enabled ? (
          <Link href={next.href} className="btn-primary px-4 py-2 text-sm">
            {next.label}
            <span aria-hidden>→</span>
          </Link>
        ) : next ? (
          // The reason is a tooltip, not a second line. The bar is a fixed 64px
          // so its rule lines up with the rail's, and a two-line right column
          // came to ~67px — it spilled past the bar's own background while the
          // page was still settling, which read as the bar changing size.
          <button
            disabled
            title={hint ?? "Add your resume and a job description to continue"}
            className="btn-primary cursor-not-allowed px-4 py-2 text-sm opacity-45"
          >
            {next.label}
            <span aria-hidden>→</span>
          </button>
        ) : (
          <span
            className={`text-xs ${current.complete ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`}
          >
            {current.complete ? "✓ Letter drafted — you're all set" : "Last step"}
          </span>
        )}
      </div>
    </nav>
  );
}
