import type {
  MatchReportItem,
  MatchStatus,
  ReportEntry,
  RequirementImportance,
  StandoutItem,
} from "@/types";

export function isStandout(entry: ReportEntry): entry is StandoutItem {
  return "credential" in entry;
}

/** Display label for either kind of report entry. */
export function entryLabel(entry: ReportEntry): string {
  return isStandout(entry) ? entry.credential : entry.requirement;
}

export const IMPORTANCE_WEIGHT: Record<RequirementImportance, number> = {
  critical: 3,
  important: 2,
  "nice-to-have": 1,
};

export const STATUS_SCORE: Record<MatchStatus, number> = {
  match: 1,
  partial: 0.5,
  gap: 0,
};

/**
 * Deliberately ignores `strength` and `standouts`. This score answers "how well
 * does this candidate fit what the posting asked for", which is capped at
 * meeting every requirement. Overshoot and unasked-for credentials are
 * persuasion material for the letter, not extra fit — letting them push past
 * 100 would make the number mean something else.
 */
export function computeOverallScore(items: MatchReportItem[]): number {
  if (items.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  for (const item of items) {
    const weight = IMPORTANCE_WEIGHT[item.importance];
    weightedSum += weight * STATUS_SCORE[item.status];
    weightTotal += weight;
  }

  if (weightTotal === 0) return 0;
  return Math.round((100 * weightedSum) / weightTotal);
}
