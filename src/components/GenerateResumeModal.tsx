"use client";

import { useEffect, useState } from "react";
import { allowsPageTarget, SHAPE_DEFS, SHAPE_ORDER } from "@/lib/documentShape";
import { isProfileUsable, type ResumeProfile } from "@/lib/settings";
import ProfileFields from "./ProfileFields";
import TemplatePreview from "./TemplatePreview";
import type { DocumentShape, ResumePageTarget } from "@/types";

/**
 * Everything that used to be a permanent sidebar panel, asked at the moment you
 * press Generate.
 *
 * The inputs here are answered once per application and then never touched
 * again, so holding a column open for them cost the document the width it
 * actually needs. Sequencing them also puts the format last, after the details
 * and the steer — which is the right order, because the format is the only one
 * of the three that has a recommendation attached and is worth pausing on.
 */

const STEPS = ["Your details", "What to emphasise", "Format"] as const;

type Props = {
  open: boolean;
  profile: ResumeProfile;
  emphasis: string;
  pageTarget: ResumePageTarget;
  /** Triage's pick. Null while it is still reading the posting, or if it failed. */
  recommended: DocumentShape | null;
  recommendedReason: string;
  recommendedConfident: boolean;
  /** What was chosen last time, if anything. Outranks the recommendation. */
  current: DocumentShape | null;
  recommendationFailed: boolean;
  onRetryRecommendation: () => void;
  onProfileChange: (next: ResumeProfile) => void;
  onEmphasisChange: (next: string) => void;
  onPageTargetChange: (next: ResumePageTarget) => void;
  onGenerate: (shape: DocumentShape) => void;
  onClose: () => void;
};

export default function GenerateResumeModal({
  open,
  profile,
  emphasis,
  pageTarget,
  recommended,
  recommendedReason,
  recommendedConfident,
  current,
  recommendationFailed,
  onRetryRecommendation,
  onProfileChange,
  onEmphasisChange,
  onPageTargetChange,
  onGenerate,
  onClose,
}: Props) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<DocumentShape | null>(current ?? recommended);

  // Reopening starts over. Resuming mid-flow would land you on the format step
  // with no memory of why, and these three answers take seconds to restate.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // A previous choice outranks the recommendation: someone who overrode it once
  // shouldn't have to override it again. Falls back to the recommendation,
  // which may still have been in flight when this opened.
  useEffect(() => {
    if (open) setSelected(current ?? recommended);
  }, [open, current, recommended]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const choice = selected ?? current ?? recommended ?? "resume";
  const profileReady = isProfileUsable(profile);
  const last = step === STEPS.length - 1;
  // Length belongs to the shape about to be produced, and a CV is never cut.
  const showLength = allowsPageTarget(choice);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generate resume"
        onClick={(e) => e.stopPropagation()}
        // Capped and column-flexed so the step body scrolls internally and the
        // Back/Continue footer stays put. The format step is tall enough to
        // push its own footer off a laptop screen otherwise.
        className="glass-panel my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col p-5 sm:p-6"
      >
        {/* Step rail — three short answers, so the count is worth showing up
            front rather than revealing one surprise at a time. */}
        <ol className="mb-5 flex shrink-0 items-center gap-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2 sm:flex-1">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-2 text-left ${
                  i < step ? "cursor-pointer" : "cursor-default"
                }`}
              >
                {/* Same three tones as the journey meter in the header —
                    answered is green, where-you-are is near-black, still to
                    come is a grey chip. The accent belongs to the buttons at
                    the foot of this dialog, not to a position marker. */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                    i < step
                      ? "bg-[var(--color-success)] text-[var(--color-on-success)]"
                      : i === step
                        ? "bg-[var(--color-text-primary)] text-[var(--color-on-emphasis)]"
                        : "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </span>
                {/* The step you are on names itself at every width; the other
                    two give their labels up on a phone, where three of them and
                    the rules between them do not fit. */}
                <span
                  className={`text-xs ${
                    i === step
                      ? "font-medium text-[var(--color-text-primary)]"
                      : "hidden text-[var(--color-text-muted)] sm:block"
                  }`}
                >
                  {label}
                </span>
              </button>
              {/* The connecting rule needs room the current step's label has
                  already taken on a phone, where it came out as a two-pixel
                  dash. The numbers and their order say the same thing. */}
              {i < STEPS.length - 1 && (
                <span className="hidden h-px flex-1 bg-[var(--color-border)] sm:block" />
              )}
            </li>
          ))}
        </ol>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Your details</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                These head every resume JobHunt generates, and they&rsquo;re the one part the
                model never writes. Filled in from your upload — worth a check, since PDF
                extraction mangles phone numbers and links.
              </p>
            </div>
            {/* Fed the shape this generation is heading for, so the link slots
                match the document. `choice` is already the recommendation until
                the format step overrides it, which is the best guess available
                two steps before that step is reached. */}
            <ProfileFields
              value={profile}
              onChange={onProfileChange}
              shape={choice}
              idPrefix="gen"
            />
            {!profileReady && (
              <p className="text-xs text-[var(--color-warning)]">
                A name and at least one way to reach you are required.
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Anything to emphasise?</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Optional. Say what to lead with or play down, in plain words — it steers
                which of your existing bullets get the room.
              </p>
            </div>
            <textarea
              value={emphasis}
              onChange={(e) => onEmphasisChange(e.target.value)}
              placeholder="Lead with the payments work at Shopify, downplay the frontend years…"
              rows={4}
              className="input-base resize-none"
              autoFocus
            />

            {showLength ? (
              <div>
                <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Length</p>
                <div className="flex gap-2">
                  {([1, 2] as ResumePageTarget[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={pageTarget === n}
                      onClick={() => onPageTargetChange(n)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        pageTarget === n
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]"
                      }`}
                    >
                      {n === 1 ? "One page" : "Two pages"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {SHAPE_DEFS[choice].label} runs as long as it needs to. Nothing is cut for
                space.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-4">
              <h2 className="text-base font-semibold">Which document should this be?</h2>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                The format decides the sections and their order.
              </p>
            </div>

            {/* The recommendation and its evidence, above the options — so it
                reads as a considered suggestion, not a pre-ticked box. */}
            <div className="mb-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2.5">
              {recommendationFailed && recommended === null ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[11px] leading-snug text-[var(--color-text-secondary)]">
                    Couldn&apos;t read the posting for a recommendation — pick whichever fits.
                  </p>
                  <button
                    onClick={onRetryRecommendation}
                    className="shrink-0 text-[11px] text-[var(--color-accent)] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : recommended === null ? (
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Reading the posting…
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-[var(--color-text-secondary)]">
                  <span className="font-medium text-[var(--color-accent)]">
                    {recommendedConfident ? "Recommended" : "Recommended (close call)"}:{" "}
                    {SHAPE_DEFS[recommended].label}
                  </span>
                  {recommendedReason && <> — {recommendedReason}</>}
                </p>
              )}
            </div>

            {/* Three across rather than two. At six shapes a two-column grid
                runs to three rows and the last one falls below the fold, which
                makes the specialist formats read as an afterthought — they are
                the whole reason someone is on this step. */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {SHAPE_ORDER.map((shape) => {
                const def = SHAPE_DEFS[shape];
                const isChoice = choice === shape;
                return (
                  <button
                    key={shape}
                    type="button"
                    aria-pressed={isChoice}
                    onClick={() => setSelected(shape)}
                    className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
                      isChoice
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
                    }`}
                  >
                    {/* The pill sits above the label rather than beside it: at
                        a third of the row there is no width to share, and the
                        label wraps to two lines under a floated badge. */}
                    <div className="mb-1.5 flex min-h-[14px] items-center">
                      {recommended === shape && (
                        <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[var(--color-on-accent)]">
                          Recommended
                        </span>
                      )}
                    </div>
                    <span
                      className={`mb-2 text-[11px] font-medium leading-snug ${
                        isChoice
                          ? "text-[var(--color-accent)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {def.label}
                    </span>

                    {/* Constrained so every sheet is the same size regardless
                        of how many sections its shape declares. */}
                    <div className="mx-auto w-full max-w-[150px]">
                      <TemplatePreview shape={shape} muted={!isChoice} />
                    </div>

                    <p className="mt-2 text-[10px] leading-snug text-[var(--color-text-muted)]">
                      {def.description}
                    </p>
                    {/* Pushed to the bottom so the length line sits on one
                        baseline across a row of unequal descriptions. */}
                    <p className="mt-auto pt-1.5 text-[9px] uppercase tracking-wide text-[var(--color-text-muted)]">
                      {def.lengthNote}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <button
            onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            onClick={last ? () => onGenerate(choice) : () => setStep((s) => s + 1)}
            disabled={!profileReady}
            className="btn-primary flex-1 py-2 text-sm"
          >
            {last ? `Generate ${SHAPE_DEFS[choice].short}` : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
