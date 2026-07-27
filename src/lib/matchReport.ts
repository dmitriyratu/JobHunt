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
 * A gate is the requirement the reader screens on. The concept only earns its
 * keep while it stays scarce — mark five and it degenerates into a second,
 * blurrier copy of `importance`.
 */
export const MAX_GATES = 2;

/**
 * Enforces the gate scarcity the analyzer prompt asks for but cannot guarantee.
 *
 * Models over-mark this, and marking nothing is just as bad: the letter builds
 * its opening on the gate, so there always has to be at least one. Keeps the
 * highest-importance marks and falls back to the first critical requirement.
 */
export function normaliseGates(items: MatchReportItem[]): MatchReportItem[] {
  const gateIds = new Set(
    items
      .filter((item) => item.gating)
      .sort(
        (a, b) => IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance]
      )
      .slice(0, MAX_GATES)
      .map((item) => item.id)
  );

  if (gateIds.size === 0) {
    const fallback = items.find((item) => item.importance === "critical") ?? items[0];
    if (fallback) gateIds.add(fallback.id);
  }

  return items.map((item) => ({ ...item, gating: gateIds.has(item.id) }));
}

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
