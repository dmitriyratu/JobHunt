import type { Session } from "@/types";

export type StepId = "source" | "match" | "resume" | "letter";

export type JourneyStep = {
  id: StepId;
  href: string;
  label: string;
  /** Number shown in the nav pill when the step isn't finished yet. */
  index: number;
  /** "Submitted" — this step's own work is done. */
  complete: boolean;
  /** Whether it's reachable; navigation itself never destroys anything. */
  enabled: boolean;
};

/**
 * Single source of truth for step order, completion, and reachability —
 * shared by the header nav and the prev/next footer so they can't disagree.
 */
export function getJourneySteps(session: Session): JourneyStep[] {
  const hasSource = Boolean(session.resumeText && session.jobDescription);
  const hasReport = session.matchReport !== null;
  // Deciding not to tailor settles the step as much as tailoring does — the
  // nav's job is to show what's left to decide, not to insist on one answer.
  const hasResume = Boolean(session.resumeTex) || session.resumeSkipped;
  const hasLetter = Boolean(session.generatedBody);

  return [
    {
      id: "source",
      href: "/",
      label: "Resume & job",
      index: 1,
      complete: hasSource,
      enabled: true,
    },
    {
      id: "match",
      href: "/match",
      label: "Match report",
      index: 2,
      complete: hasReport,
      enabled: hasSource,
    },
    {
      id: "resume",
      href: "/resume",
      label: "Tailor resume",
      index: 3,
      complete: hasResume,
      enabled: hasSource,
    },
    {
      id: "letter",
      href: "/letter",
      label: "Write letter",
      index: 4,
      complete: hasLetter,
      enabled: hasSource,
    },
  ];
}

export function findStepIndex(steps: JourneyStep[], pathname: string): number {
  const exact = steps.findIndex((s) => s.href === pathname);
  return exact;
}
