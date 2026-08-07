import { IMPORTANCE_WEIGHT } from "./matchReport";
import type { MatchReport } from "@/types";

/**
 * Renders a match report as prompt context.
 *
 * Shared by the letter and the tailored resume: both are built from the same
 * outline (which requirements matter, which the candidate clears and by how
 * much), so they need to read the report identically. Two copies of this would
 * drift, and the two documents would start arguing different cases.
 *
 * What this renders is the report, not what to do with it. A standout is used
 * one way in a letter (pick at most one, tie it to the role) and the opposite
 * way in a resume (keep all of them, they are already in the document), so the
 * usage rules belong in each system prompt — the same split EXCEEDS already
 * has. A rule written here reaches the document it was never meant for.
 */
export function formatMatchReport(report: MatchReport): string {
  const byStatus = { match: [], partial: [], gap: [] } as Record<
    MatchReport["items"][number]["status"],
    string[]
  >;

  // Order each group by importance so the model reads the critical overlaps
  // first — the prompts ask it to build on the highest-importance matches, so
  // those need to be at the top of what it sees. Within equal importance,
  // overshoot outranks a bare match: those are the lines that actually argue.
  const sorted = [...report.items].sort(
    (a, b) =>
      IMPORTANCE_WEIGHT[b.importance] - IMPORTANCE_WEIGHT[a.importance] ||
      Number(b.strength === "exceeds") - Number(a.strength === "exceeds")
  );

  for (const item of sorted) {
    // Reports saved before `strength` existed have no value here.
    const exceeds = item.strength === "exceeds" ? " — EXCEEDS" : "";
    const evidence = item.evidence ? `\n    evidence: ${item.evidence}` : "";
    const note = item.note ? `\n    note: ${item.note}` : "";
    byStatus[item.status].push(
      `- [${item.importance}] ${item.requirement}${exceeds}${evidence}${note}`
    );
  }

  const sections = [`Overall fit score: ${report.overallScore}/100`, report.summary];
  if (byStatus.match.length)
    sections.push(
      "STRONG MATCHES (build on these — highest importance first; " +
        "EXCEEDS means the candidate is well past the bar, not merely adequate):\n" +
        byStatus.match.join("\n")
    );
  if (byStatus.partial.length)
    sections.push("PARTIAL MATCHES (usable as supporting points):\n" + byStatus.partial.join("\n"));
  if (byStatus.gap.length)
    sections.push("GAPS (do not raise these unless unavoidable):\n" + byStatus.gap.join("\n"));

  const standouts = report.standouts ?? [];
  if (standouts.length) {
    sections.push(
      "STANDOUTS (credentials already in the resume that this posting never asked " +
        "for, but that a hiring team would prize anyway):\n" +
        standouts
          .map((s) => {
            const evidence = s.evidence ? `\n    evidence: ${s.evidence}` : "";
            const why = s.whyValuable ? `\n    why it's prized: ${s.whyValuable}` : "";
            return `- ${s.credential}${evidence}${why}`;
          })
          .join("\n")
    );
  }

  return sections.join("\n\n");
}
