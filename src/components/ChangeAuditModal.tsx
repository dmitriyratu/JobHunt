"use client";

import { useEffect, useMemo } from "react";
import type { GroundingDecision } from "@/lib/groundingPass";
import type { TailoredResume } from "@/types";

/**
 * Everything the two automatic passes did to the document, line by line.
 *
 * The pane used to say this in two sentences of counts — "2 were put back to
 * your own wording; 2 skills your resume doesn't claim were removed". Counts
 * are the wrong unit for this. They tell you something happened without telling
 * you what, and the one question they raise ("which two?") had no answer
 * anywhere in the app: the grounding pass has recorded the full before/after
 * for every decision since it was written, and the client was throwing it away
 * on arrival.
 *
 * That mattered more than a missing detail view usually does, because the
 * checker is known to be wrong. The measured false-positive rate on reverts was
 * eleven in thirteen (see the two-tier note in groundingPass), which is why
 * only outright fabrication is allowed to change text now. A pass whose
 * judgement you are expected to second-guess has to show its working.
 *
 * Three groups, because they answer three different questions:
 *   - The accuracy check rewrites or flags claims the uploaded document does
 *     not support. What it did is a correctness question.
 *   - The page-fitting pass removes true material to hit a length target. What
 *     it did is an editorial question, and every bit of it is recoverable — the
 *     bullets are still in the data, flagged `dropped`.
 *   - What the writer never used at all. Not a change and not an error, but the
 *     same worry underneath: the difference between a line the app decided
 *     against and a line it never saw is invisible on the finished page, and
 *     only one of those is worth arguing with.
 */

export type GroundingSummary = {
  checked: number;
  repaired: number;
  reverted: number;
  removedSkills: string[];
  unverified: number;
  flagged: number;
  /** Empty on documents generated before the pane kept them. */
  decisions?: GroundingDecision[];
};

export type FitSummary = {
  pages: number;
  trimmed: number;
  collapsed: number;
  droppedSections: string[];
  /** Keywords cut to reach the page target, by name. */
  skillsRemoved: string[];
  summaryShortened: number;
  fits: boolean;
};

type Props = {
  open: boolean;
  grounding: GroundingSummary | null;
  fit: FitSummary | null;
  /** Read for the text of what the fitting pass cut, which the counts omit. */
  resume: TailoredResume | null;
  onClose: () => void;
};

/** How many things this would have to show. Decides whether the button exists. */
export function changeCount(
  grounding: GroundingSummary | null,
  fit: FitSummary | null
): number {
  const g = grounding
    ? grounding.repaired +
      grounding.reverted +
      grounding.unverified +
      grounding.flagged +
      grounding.removedSkills.length
    : 0;
  const f = fit
    ? fit.trimmed +
      fit.collapsed +
      fit.droppedSections.length +
      fit.skillsRemoved.length +
      fit.summaryShortened
    : 0;
  return g + f;
}

const OUTCOME: Record<
  GroundingDecision["outcome"],
  { label: string; tone: "changed" | "flagged"; blurb: string }
> = {
  repaired: {
    label: "Rewritten",
    tone: "changed",
    blurb: "stated a figure the uploaded document never states, so it was rewritten without it",
  },
  reverted: {
    label: "Put back",
    tone: "changed",
    blurb: "could not be corrected, so your own line from the upload stands instead",
  },
  unverified: {
    label: "Left as written",
    tone: "flagged",
    blurb: "was queried, but there was nothing better to fall back to — so it stands, unchecked",
  },
  flagged: {
    label: "Worth a read",
    tone: "flagged",
    blurb: "the checker objected to. Nothing was changed — this check is wrong often enough that only fabricated figures are allowed to edit the page",
  },
};

/** A bullet the length pass removed, with the role it belonged to. */
type Cut = { where: string; text: string };

function cutBullets(resume: TailoredResume | null): Cut[] {
  if (!resume) return [];
  const out: Cut[] = [];
  for (const section of resume.sections) {
    for (const entry of section.entries ?? []) {
      for (const bullet of entry.bullets) {
        if (!bullet.dropped || !bullet.value.trim()) continue;
        const where = [entry.heading, entry.organization].filter(Boolean).join(" · ");
        out.push({ where: where || section.key, text: bullet.value });
      }
    }
  }
  return out;
}

export default function ChangeAuditModal({ open, grounding, fit, resume, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const decisions = useMemo(() => grounding?.decisions ?? [], [grounding]);
  const changed = decisions.filter((d) => OUTCOME[d.outcome].tone === "changed");
  const flagged = decisions.filter((d) => OUTCOME[d.outcome].tone === "flagged");
  const cuts = useMemo(() => cutBullets(resume), [resume]);
  const collapsed = resume?.collapsed ?? [];
  const removedSkills = grounding?.removedSkills ?? [];
  const omitted = resume?.omitted ?? [];

  if (!open) return null;

  // Every decision is recorded, so a count with no decisions behind it can only
  // be a document generated before the pane kept them. Say so rather than
  // render an empty section that reads as "nothing happened".
  const missingDetail =
    decisions.length === 0 &&
    Boolean(grounding) &&
    grounding!.repaired + grounding!.reverted + grounding!.unverified + grounding!.flagged > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel my-2 w-full max-w-3xl overflow-hidden p-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="What changed"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-sm font-medium">What changed</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Everything the accuracy and length passes did after the writer finished.
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4 sm:p-5">
          {/* --- The accuracy check ------------------------------------------ */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Accuracy check
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {grounding
                ? `${grounding.checked} rewritten ${
                    grounding.checked === 1 ? "line was" : "lines were"
                  } compared against your uploaded document. Lines the writer copied across
                    untouched are their own source and are not checked.`
                : "Did not run for this document."}
            </p>

            {missingDetail && (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                This document was generated before the detail was kept — only the counts
                survive. Regenerate to see the lines themselves.
              </p>
            )}

            {changed.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-[var(--color-warning)]">
                  {changed.length === 1 ? "1 line was changed" : `${changed.length} lines were changed`}
                </p>
                {changed.map((d) => (
                  <DecisionCard key={d.id} decision={d} showBefore />
                ))}
              </div>
            )}

            {flagged.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  {flagged.length === 1
                    ? "1 line was queried and left alone"
                    : `${flagged.length} lines were queried and left alone`}
                </p>
                {flagged.map((d) => (
                  <DecisionCard key={d.id} decision={d} showBefore={false} />
                ))}
              </div>
            )}

            {removedSkills.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-[var(--color-warning)]">
                  {removedSkills.length === 1
                    ? "1 skill was removed"
                    : `${removedSkills.length} skills were removed`}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Deleted outright, not rewritten: the writer listed{" "}
                  {removedSkills.length === 1 ? "this" : "these"} and your uploaded resume
                  never does. If one is wrong, it is a wording mismatch — add it to your
                  resume in the same words and regenerate.
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {removedSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] line-through"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {grounding &&
              changed.length + flagged.length + removedSkills.length === 0 &&
              !missingDetail && (
                <p className="mt-2 text-xs text-[var(--color-success)]">
                  Nothing was changed — every rewritten line traced back to your document.
                </p>
              )}
          </section>

          {/* --- The length pass --------------------------------------------- */}
          {fit && (
            <section className="border-t border-[var(--color-border-subtle)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Cut to fit {fit.pages} page{fit.pages === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                True material removed for length, least relevant to this posting first. Ask
                the chat to put any of it back.
                {!fit.fits && " It still runs long — shorten some bullets by hand."}
              </p>

              {cuts.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {cuts.map((cut, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] px-3 py-2"
                    >
                      <p className="text-[11px] text-[var(--color-text-muted)]">{cut.where}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)] line-through decoration-[var(--color-text-muted)]">
                        {cut.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {collapsed.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {collapsed.length === 1
                      ? "1 earlier role reduced to a single line"
                      : `${collapsed.length} earlier roles reduced to a single line`}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {collapsed.map((entry, i) => (
                      <li key={i} className="text-xs text-[var(--color-text-secondary)]">
                        {[entry.heading, entry.organization].filter(Boolean).join(" · ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Keywords are named rather than counted, like the bullets
                  above and for the same reason: "4 skills dropped" tells you
                  something was lost and gives you no way to judge whether it
                  mattered. These are the tail of the grid — the writer's own
                  ranking, cut from the end — so anything here that you would
                  have fought for is a ranking that came out wrong, which is
                  worth seeing rather than a number. */}
              {fit.skillsRemoved.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {fit.skillsRemoved.length === 1
                      ? "1 keyword cut to reach the page target"
                      : `${fit.skillsRemoved.length} keywords cut to reach the page target`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {fit.skillsRemoved.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-[var(--color-surface-overlay)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] line-through"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* The counts with no text behind them. Named anyway: a section
                  gone whole is the change most likely to be noticed after
                  sending. */}
              {(fit.droppedSections.length > 0 || fit.summaryShortened > 0) && (
                <ul className="mt-3 space-y-0.5 text-xs text-[var(--color-text-secondary)]">
                  {fit.droppedSections.length > 0 && (
                    <li>Sections left out entirely: {fit.droppedSections.join(", ")}</li>
                  )}
                  {fit.summaryShortened > 0 && (
                    <li>
                      Summary shortened by {fit.summaryShortened} sentence
                      {fit.summaryShortened === 1 ? "" : "s"}
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}

          {/* --- Never used at all -------------------------------------------- */}
          {omitted.length > 0 && (
            <section className="border-t border-[var(--color-border-subtle)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Not used from your resume
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                {omitted.length} line{omitted.length === 1 ? "" : "s"} of your uploaded
                document that nothing on this page draws on. Not an error — a tailored
                resume is meant to leave things out, and this is what it left. Worth a scan
                for anything this posting actually wanted; ask the chat to work it in.
              </p>
              {/* Collapsed by default. On a long career this is the biggest list
                  in the dialog and the least likely to be read line by line —
                  it is here to be searched when something feels missing, not to
                  greet you. */}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--color-accent)]">
                  Show the {omitted.length} unused line{omitted.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-1.5 space-y-1 border-l-2 border-[var(--color-border)] pl-2">
                  {omitted.map((line, i) => (
                    <li
                      key={i}
                      className="text-xs leading-relaxed text-[var(--color-text-secondary)]"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One decision, with the evidence it was made on.
 *
 * The cited lines are the point: a revert is only correct if the line it went
 * back to is genuinely what the upload said, and that is not something a
 * summary sentence can convey.
 */
function DecisionCard({
  decision,
  showBefore,
}: {
  decision: GroundingDecision;
  showBefore: boolean;
}) {
  const meta = OUTCOME[decision.outcome];

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-overlay)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            meta.tone === "changed"
              ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
              : "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          }`}
        >
          {meta.label}
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {decision.detector === "numbers"
            ? "found by exact matching"
            : "found by the model checker"}
        </span>
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
        <span className="text-[var(--color-text-muted)]">Why: </span>
        {decision.reason}
      </p>

      {showBefore && decision.wrote !== decision.became && (
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)] line-through">
          {decision.wrote}
        </p>
      )}
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-primary)]">
        {decision.became}
      </p>

      {decision.sources.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-[var(--color-text-muted)]">
            {decision.sources.length === 1
              ? "The line it cited"
              : `The ${decision.sources.length} lines it cited`}
          </summary>
          <ul className="mt-1 space-y-0.5 border-l-2 border-[var(--color-border)] pl-2">
            {decision.sources.map((source, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                {source}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
