"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getJourneySteps } from "@/lib/journey";
import { useJobHuntState } from "@/lib/useAppState";

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function StageNav() {
  const { state } = useJobHuntState();
  const pathname = usePathname();
  const steps = getJourneySteps(state);

  return (
    // Scrolls rather than hiding below md: three pills are a little wider than a
    // phone, and knowing where you are in the journey matters more on the screen
    // with the least room for context.
    <div className="flex items-center gap-2 max-w-full overflow-x-auto">
      {steps.map((step, i) => {
        const active = pathname === step.href;
        const base =
          "flex items-center gap-1.5 whitespace-nowrap text-xs font-medium px-3 py-2 rounded-full transition-colors";
        const tone = active
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : step.enabled
            ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            : "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed";

        // A filled check marks a finished step; otherwise the step number.
        const marker = step.complete ? (
          <span className="flex items-center justify-center h-4 w-4 rounded-full bg-[var(--color-success)] text-white">
            <CheckIcon />
          </span>
        ) : (
          <span
            className={`flex items-center justify-center h-4 w-4 rounded-full text-[10px] ${
              active
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-border)] text-[var(--color-text-secondary)]"
            }`}
          >
            {step.index}
          </span>
        );

        const content = (
          <>
            {marker}
            {step.label}
          </>
        );

        return (
          <div key={step.id} className="flex items-center gap-2 shrink-0">
            {step.enabled ? (
              <Link href={step.href} className={`${base} ${tone}`} title={step.label}>
                {content}
              </Link>
            ) : (
              <span className={`${base} ${tone}`} title="Add a resume and job description first">
                {content}
              </span>
            )}
            {i < steps.length - 1 && (
              <div className="w-2 sm:w-4 h-px bg-[var(--color-border)] shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
