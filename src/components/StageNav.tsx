"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { getJourneySteps, type StepId } from "@/lib/journey";
import { useJobHuntState } from "@/lib/useAppState";

/**
 * Where you are in the journey.
 *
 * Each step is a glyph in a tile plus its name. The glyph is what makes this
 * work: it is the same mark every time, in the same place, so after a couple
 * of applications the row is recognised rather than read — and it degrades to
 * icons alone on a phone, which is the one screen where four labels never fit.
 *
 * Exactly one thing on the row is filled in, and it is the step you are on.
 * An earlier pass gave every finished step a solid green disc, so a session
 * with four finished steps put four loud marks on screen and the current step
 * was the quietest element in the row — the one piece of information the nav
 * exists to carry. Completion is now a small badge on the corner of the tile,
 * which says the same thing without competing.
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
      className="h-3.5 w-3.5"
      aria-hidden
    >
      {STEP_ICON[id]}
    </svg>
  );
}

/**
 * Finished.
 *
 * Trails the label rather than riding the corner of the glyph. As a badge it
 * needed a tile to sit on; once the tile went, an 11px disc pinned to a 14px
 * glyph simply covered it — two marks fighting for the same square. Given its
 * own place in the line it stays legible and costs about ten pixels.
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

/**
 * The step separator.
 *
 * A chevron rather than a rule: a rule joins two things, an arrow says which
 * way the work runs, and that is the thing the row was missing. It takes the
 * success hue once the step behind it is finished, so the coloured run stops
 * exactly at the frontier and the trail reads as progress rather than
 * decoration.
 */
function StepArrow({ done }: { done: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden
      className={`h-3 w-3 shrink-0 ${
        done
          ? "text-[var(--color-success)] opacity-85"
          : "text-[var(--color-text-muted)] opacity-55"
      }`}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export default function StageNav() {
  const { state } = useJobHuntState();
  const pathname = usePathname();
  const steps = getJourneySteps(state);

  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  /**
   * Bring the current step into view.
   *
   * Still needed even though the labels collapse on a phone: the current step
   * keeps its label, so the row can still overrun a narrow screen.
   *
   * The container's scrollLeft is set directly rather than calling
   * scrollIntoView, which walks up the ancestor chain and would scroll the
   * whole page to bring the rail into view — the same reason the chat
   * transcripts scroll their own container.
   */
  useEffect(() => {
    const rail = railRef.current;
    const active = activeRef.current;
    if (!rail || !active) return;
    if (rail.scrollWidth <= rail.clientWidth) return;

    rail.scrollLeft = Math.max(
      0,
      active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2
    );
  }, [pathname, steps.length]);

  return (
    <div
      ref={railRef}
      className="flex items-center gap-1.5 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {steps.map((step, i) => {
        const active = pathname === step.href;
        // Completion is the tile's badge, and the current step's tile is
        // already spoken for by the accent — a green badge on it would put two
        // colours on one 26px object.
        const showBadge = step.complete && !active;

        /*
         * Every step is a pill now, not just the current one.
         *
         * Bare labels beside a filled current step left the row looking like
         * one button and three captions. Giving them all the same container
         * makes them read as four of the same kind of thing, and lets the
         * current one differ by fill rather than by existing at all.
         */
        /*
         * One filled shape per step, and not a line anywhere.
         *
         * The previous pass drew two nested 1px outlines — the chip and a tile
         * inside it — which is the worst thing you can do for sharpness on a
         * fractional display: at 1.5x a 1px border lands on 0.667px and every
         * edge in the row went soft. A solid fill has no sub-pixel edge to
         * blur, so the shapes are now defined by colour and the nested box is
         * gone entirely. The glyph carries the state instead.
         */
        const base =
          "flex items-center gap-2 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 text-xs tracking-[-0.005em] transition-colors [@media(pointer:coarse)]:min-h-[44px]";

        const tone = active
          ? "bg-[var(--color-accent)] font-semibold text-[var(--color-on-accent)]"
          : step.enabled
            ? "bg-[var(--color-chip)] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            : "bg-[var(--color-chip)] font-medium text-[var(--color-text-muted)] opacity-45 cursor-not-allowed";

        const iconTone = active
          ? "text-[var(--color-on-accent)]"
          : step.complete
            ? "text-[var(--color-success)]"
            : "text-[var(--color-text-muted)]";

        const content = (
          <>
            <span className={`flex shrink-0 items-center ${iconTone}`}>
              <StepIcon id={step.id} />
            </span>
            {/* The current step keeps its label at every width; the rest give
                theirs up below sm, where four of them never fitted. Hidden with
                sr-only rather than `hidden`, so the links keep their names for
                a screen reader at any width. */}
            <span className={active ? "" : "sr-only sm:not-sr-only"}>{step.label}</span>
            {showBadge && <DoneCheck />}
          </>
        );

        return (
          <div
            key={step.id}
            ref={active ? activeRef : undefined}
            className="flex shrink-0 items-center gap-1.5"
          >
            {step.enabled ? (
              <Link
                href={step.href}
                aria-current={active ? "step" : undefined}
                className={`${base} ${tone}`}
                title={step.label}
              >
                {content}
              </Link>
            ) : (
              <span
                className={`${base} ${tone}`}
                title="Add a resume and job description first"
              >
                {content}
              </span>
            )}
            {i < steps.length - 1 && <StepArrow done={step.complete} />}
          </div>
        );
      })}
    </div>
  );
}
