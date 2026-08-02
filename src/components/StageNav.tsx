"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { getJourneySteps, type StepId } from "@/lib/journey";
import { useJobHuntState } from "@/lib/useAppState";

/**
 * Where you are in the journey.
 *
 * This is a progress meter, not a toolbar, and it is now built to look like
 * one. Every step owns a segment of a single track across the top of the row,
 * and the segment's colour is the whole state machine: finished is green,
 * where-you-are is near-black, still-to-come is a hairline grey. Underneath it
 * each step names itself.
 *
 * Deliberately no accent anywhere in here. --color-accent is the app's action
 * colour — it fills .btn-primary and nothing else that isn't clickable-and-
 * primary — and an earlier pass gave the current step a solid accent pill,
 * which made the one thing on the row that is *not* an action look like the
 * loudest button on the page. Progress gets its own language: position is
 * carried by weight and by the track, completion by the same green the rest of
 * the app already uses for "done".
 *
 * The row is a four-column grid on a phone and a centred flex row from `sm`.
 * The grid is what let the labels come back: the previous version hid three of
 * the four names below `sm` and left a row of anonymous glyphs, and scrolled
 * horizontally when they didn't fit. Four columns always fit, because the
 * labels wrap inside them.
 */

/**
 * One glyph per step, drawn on a 20×20 grid in `currentColor`.
 *
 * Keyed by StepId rather than positionally: the icon has to stay attached to
 * its step if the journey is ever reordered, since the whole point is that the
 * mark becomes learnable.
 */
const STEP_ICON: Record<StepId, ReactNode> = {
  // A document with a turned corner — the thing you upload.
  source: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 3.5h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1Z"
      />
      <path strokeLinecap="round" d="M10 3.5v3.5h3" />
    </>
  ),
  // Bars: the report is a set of requirements measured against each other.
  match: <path strokeLinecap="round" d="M3.5 16.5v-5M8 16.5v-9M12.5 16.5v-6M17 16.5v-11" />,
  // A typeset page — ruled lines rather than a blank sheet, to tell it apart
  // from the upload glyph at 14px.
  resume: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 3.5h11v13h-11z" />
      <path strokeLinecap="round" d="M7 7.5h6M7 10.5h6M7 13.5h3.5" />
    </>
  ),
  letter: (
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 5.5h15v9h-15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.5 6 7.5 5.5L17.5 6" />
    </>
  ),
};

function StepIcon({ id }: { id: StepId }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      // Heavier than a typical 20px glyph wants, because it is drawn at 14.
      // At 1.6 the strokes landed on half pixels and the whole row read soft.
      strokeWidth={1.9}
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      {STEP_ICON[id]}
    </svg>
  );
}

/**
 * Finished.
 *
 * Rides beside the glyph rather than trailing the label, so it sits in the same
 * place whether the label is on the glyph's line (from `sm`) or under it (on a
 * phone). Green, matching its track segment.
 */
function DoneCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      aria-hidden
      className="h-3 w-3 shrink-0 text-[var(--color-success)]"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function StageNav() {
  const { state } = useJobHuntState();
  const pathname = usePathname();
  const steps = getJourneySteps(state);
  const currentIndex = steps.findIndex((s) => s.href === pathname);

  return (
    <nav aria-label="Progress" className="w-full">
      {/*
       * Equal columns on a phone so four labels always fit; content-width and
       * centred from `sm`, where there is room for the row to be as wide as it
       * wants to be. `items-stretch` keeps every segment on the same line when
       * one label wraps to two and its neighbours don't.
       */}
      <ol className="grid grid-cols-4 items-stretch gap-1.5 sm:flex sm:justify-center sm:gap-2">
        {steps.map((step, i) => {
          const active = i === currentIndex;

          /*
           * The track segment, which is the only thing carrying position.
           *
           * Current beats complete when a step is both — you can revisit a
           * finished step, and "you are here" is the more urgent fact. The tick
           * beside the glyph still says the step is done, so nothing is lost.
           */
          const track = active
            ? "bg-[var(--color-text-primary)]"
            : step.complete
              ? "bg-[var(--color-success)]"
              : "bg-[var(--color-border-subtle)]";

          const label = active
            ? "font-semibold text-[var(--color-text-primary)]"
            : step.complete
              ? "font-medium text-[var(--color-text-secondary)]"
              : "font-medium text-[var(--color-text-muted)]";

          const icon = active
            ? "text-[var(--color-text-primary)]"
            : step.complete
              ? "text-[var(--color-success)]"
              : "text-[var(--color-text-muted)]";

          const content = (
            <>
              <span className={`h-1 w-full shrink-0 rounded-full ${track}`} />
              {/* Stacked on a phone — an icon beside a label that wraps to two
                  lines leaves the glyph floating against a ragged block — and
                  on one line from `sm`, where nothing wraps. */}
              <span className="flex flex-1 flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
                <span className={`flex items-center gap-1 ${icon}`}>
                  <StepIcon id={step.id} />
                  {step.complete && <DoneCheck />}
                </span>
                <span className={`text-center text-[11px] leading-tight sm:text-xs ${label}`}>
                  {step.label}
                </span>
              </span>
              {step.complete && <span className="sr-only">(done)</span>}
            </>
          );

          // 44px on a touch screen, counted on the whole column rather than on
          // the text, so the tappable area is the segment and everything under
          // it. The row is content-sized otherwise.
          const base =
            "flex h-full flex-col gap-1.5 rounded-[var(--radius-sm)] px-1.5 pb-1.5 pt-0 transition-colors sm:px-2.5 sm:pb-2 [@media(pointer:coarse)]:min-h-[52px]";

          return (
            <li key={step.id} className="flex min-w-0 sm:w-auto">
              {step.enabled ? (
                <Link
                  href={step.href}
                  aria-current={active ? "step" : undefined}
                  title={step.label}
                  className={`${base} w-full hover:bg-[var(--color-surface-overlay)]`}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className={`${base} w-full cursor-not-allowed opacity-55`}
                  title="Add a resume and job description first"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
