"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getJourneySteps } from "@/lib/journey";
import { useJobHuntState } from "@/lib/useAppState";

/**
 * Prev/next footer for moving through the journey. Navigation is purely
 * navigation — it never clears downstream work (only submitting new material
 * on a page does that), so both directions are always safe.
 */
export default function StepNav({ hint }: { hint?: string }) {
  const { state } = useJobHuntState();
  const pathname = usePathname();
  const steps = getJourneySteps(state);
  const i = steps.findIndex((s) => s.href === pathname);
  if (i === -1) return null;

  const prev = i > 0 ? steps[i - 1] : null;
  const next = i < steps.length - 1 ? steps[i + 1] : null;
  const current = steps[i];

  return (
    <nav className="mt-8 pt-5 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
      <div className="min-w-0">
        {prev ? (
          <Link
            href={prev.href}
            className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span aria-hidden>←</span>
            <span className="text-left">
              <span className="block text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
                Back
              </span>
              {prev.label}
            </span>
          </Link>
        ) : (
          <span />
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 min-w-0">
        {next && next.enabled ? (
          <Link href={next.href} className="btn-primary px-5 py-2.5">
            <span className="text-left">
              <span className="block text-[10px] uppercase tracking-wide opacity-80">Next</span>
              {next.label}
            </span>
            <span aria-hidden>→</span>
          </Link>
        ) : next ? (
          <>
            <button disabled className="btn-primary px-5 py-2.5 opacity-45 cursor-not-allowed">
              <span className="text-left">
                <span className="block text-[10px] uppercase tracking-wide opacity-80">Next</span>
                {next.label}
              </span>
              <span aria-hidden>→</span>
            </button>
            <p className="text-xs text-[var(--color-text-muted)]">
              {hint ?? "Add your resume and a job description to continue"}
            </p>
          </>
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
