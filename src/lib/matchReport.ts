import type {
  MatchReportItem,
  MatchStatus,
  RequirementImportance,
} from "@/types";

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
