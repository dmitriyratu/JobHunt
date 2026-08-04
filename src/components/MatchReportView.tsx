"use client";

import { useState, type ReactNode } from "react";
import type {
  MatchReport,
  MatchReportItem,
  MatchStatus,
  RequirementImportance,
  RequirementStrength,
} from "@/types";

type Props = {
  report: MatchReport | null;
  canAnalyze: boolean;
  loading: boolean;
  error: string;
  onAnalyze: () => void;
  /** Requirement currently attached to the chat question, if any. */
  attachedItemId: string | null;
  onAttachItem: (id: string) => void;
};

/**
 * The one scale the report is colour-coded on.
 *
 * `status` and `strength` are two fields but they read as a single four-step
 * verdict — nothing matches *and* exceeds — so they are collapsed here and
 * every colour decision downstream keys off this instead of off either field.
 */
type Outcome = "gap" | "partial" | "match" | "exceeds";

function outcomeOf(status: MatchStatus, strength?: RequirementStrength): Outcome {
  return status === "match" && strength === "exceeds" ? "exceeds" : status;
}

/** Worst first: the thing you have to do something about should be read first. */
const OUTCOME_ORDER: Outcome[] = ["gap", "partial", "match", "exceeds"];

/**
 * 20×20 glyphs, drawn in `currentColor`.
 *
 * Colour is never the only channel — each outcome carries a shape too, so the
 * report survives a red/green colour deficiency and a black-and-white print.
 */
const OUTCOME_ICON: Record<Outcome, ReactNode> = {
  gap: <path strokeLinecap="round" d="M6.5 6.5l7 7M13.5 6.5l-7 7" />,
  // Outline circle, right half filled: "some of this, not all of it".
  partial: (
    <>
      <circle cx="10" cy="10" r="5.5" />
      <path d="M10 4.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" />
    </>
  ),
  match: <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 10.5l3 3 6-6.5" />,
  exceeds: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 15.5V5m0 0L5.5 9.5M10 5l4.5 4.5" />
  ),
};

/**
 * One tinted surface per outcome, and nothing else.
 *
 * An earlier pass had the fill *and* a 4px coloured left edge *and* a white
 * box around the evidence — three devices saying what one says perfectly well.
 * The fill already covers the whole card, which is a stronger scanning signal
 * than any bar down its side, so the card is now a tinted surface with a
 * hairline, one saturated pill, and a rule between the quote and the verdict.
 */
type OutcomeStyle = {
  label: string;
  /** Card fill and hairline. */
  card: string;
  /** The rule under the title — same hue as the border, so it recedes. */
  rule: string;
  /**
   * Solid pill: small, saturated, and the only loud thing on the card.
   *
   * Carries its own ink because the four fills are dark in light mode and
   * light in dark mode — a shared `text-white` was legible in exactly one of
   * the two themes.
   */
  pill: string;
};

const OUTCOME: Record<Outcome, OutcomeStyle> = {
  gap: {
    label: "Gap",
    card: "bg-[var(--color-danger-surface)] border-[var(--color-danger-line)]",
    rule: "border-[var(--color-danger-line)]",
    pill: "bg-[var(--color-danger)] text-[var(--color-on-danger)]",
  },
  partial: {
    label: "Partial",
    card: "bg-[var(--color-warning-surface)] border-[var(--color-warning-line)]",
    rule: "border-[var(--color-warning-line)]",
    pill: "bg-[var(--color-warning)] text-[var(--color-on-warning)]",
  },
  match: {
    label: "Match",
    card: "bg-[var(--color-success-surface)] border-[var(--color-success-line)]",
    rule: "border-[var(--color-success-line)]",
    pill: "bg-[var(--color-success)] text-[var(--color-on-success)]",
  },
  exceeds: {
    label: "Exceeds",
    card: "bg-[var(--color-accent-surface)] border-[var(--color-accent-line)]",
    rule: "border-[var(--color-accent-line)]",
    pill: "bg-[var(--color-accent)] text-[var(--color-on-accent)]",
  },
};

/**
 * Blue is "above and beyond" throughout — an exceeded requirement and a
 * standout are the same idea, so they get the same colour and the same star.
 */
const STANDOUT_STYLE: OutcomeStyle = {
  label: "Standout",
  card: "bg-[var(--color-accent-surface)] border-[var(--color-accent-line)]",
  rule: "border-[var(--color-accent-line)]",
  pill: "bg-[var(--color-accent)] text-[var(--color-on-accent)]",
};

const STANDOUT_ICON = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M10 3.5l2 4.2 4.5.6-3.3 3.2.8 4.5L10 13.9 6 16l.8-4.5L3.5 8.3l4.5-.6z"
  />
);

const IMPORTANCE_LABEL: Record<RequirementImportance, string> = {
  critical: "Critical",
  important: "Important",
  "nice-to-have": "Nice to have",
};

const IMPORTANCE_GROUPS: RequirementImportance[] = ["critical", "important", "nice-to-have"];

/**
 * Requirements bucketed by importance, each bucket ordered worst-first.
 *
 * Importance used to be a pill on every card, which repeated the same three
 * words down the whole report and competed with the outcome colours. As a
 * group heading it is said once, in greyscale, and the cards get the width and
 * the palette back.
 */
function groupItems(items: MatchReportItem[]): [RequirementImportance, MatchReportItem[]][] {
  return IMPORTANCE_GROUPS.map(
    (importance) =>
      [
        importance,
        items
          .filter((item) => item.importance === importance)
          .sort(
            (a, b) =>
              OUTCOME_ORDER.indexOf(outcomeOf(a.status, a.strength)) -
              OUTCOME_ORDER.indexOf(outcomeOf(b.status, b.strength))
          ),
      ] as [RequirementImportance, MatchReportItem[]]
  ).filter(([, group]) => group.length > 0);
}

function OutcomeIcon({ icon, className = "" }: { icon: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden
    >
      {icon}
    </svg>
  );
}

/**
 * Status and overshoot read as one four-level scale — Gap / Partial / Match /
 * Exceeds — rather than two pills side by side. "Exceeds" already implies a
 * match, so showing both would just crowd the row.
 */
export function ResultPill({
  status,
  strength,
}: {
  status: MatchStatus;
  strength?: RequirementStrength;
}) {
  const outcome = outcomeOf(status, strength);
  return <Pill style={OUTCOME[outcome]} icon={OUTCOME_ICON[outcome]} />;
}

export function StatusPill({ status }: { status: MatchStatus }) {
  return <ResultPill status={status} />;
}

/**
 * Solid rather than tinted: it sits on an already-tinted card, and a wash on a
 * wash reads as neither. Each fill carries ink that clears AA against it, in
 * both themes — see --color-on-* in globals.css.
 */
function Pill({ style, icon }: { style: OutcomeStyle; icon: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11px] font-semibold ${style.pill}`}
    >
      <OutcomeIcon icon={icon} className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

/**
 * Importance in greyscale weight, deliberately: the colours are spoken for by
 * the outcome scale, and a second hue-coded axis would make neither legible.
 */
export function ImportancePill({ importance }: { importance: RequirementImportance }) {
  const classes: Record<RequirementImportance, string> = {
    critical: "bg-[var(--color-text-primary)] text-[var(--color-on-emphasis)]",
    important: "bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]",
    "nice-to-have": "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]",
  };
  return (
    <span
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${classes[importance]}`}
    >
      {IMPORTANCE_LABEL[importance]}
    </span>
  );
}

/** Section rule for one importance bucket: dot, label, count, hairline. */
function GroupHeading({
  importance,
  count,
}: {
  importance: RequirementImportance;
  count: number;
}) {
  const dot: Record<RequirementImportance, string> = {
    critical: "bg-[var(--color-text-primary)]",
    important: "bg-[var(--color-text-muted)]",
    "nice-to-have": "bg-[var(--color-border)]",
  };
  const label: Record<RequirementImportance, string> = {
    critical: "text-[var(--color-text-primary)]",
    important: "text-[var(--color-text-secondary)]",
    "nice-to-have": "text-[var(--color-text-muted)]",
  };
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`h-2 w-2 rounded-full shrink-0 ${dot[importance]}`} />
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${label[importance]}`}
      >
        {IMPORTANCE_LABEL[importance]}
      </p>
      <span className="text-[11px] text-[var(--color-text-muted)]">{count}</span>
      <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
    </div>
  );
}

/**
 * The clickable chrome every entry shares: outcome fill, outcome hairline, and
 * nothing else.
 *
 * `h-full` matters — grid rows are already as tall as their tallest card, so
 * letting the short ones stretch costs nothing and stops the row bottoms from
 * coming out ragged. `flex flex-col` is what keeps the content pinned to the
 * top once it does stretch: a button centres its contents vertically, so the
 * short cards in a row would otherwise float mid-box.
 *
 * Selection is a near-black ring, not a colour — every hue on this page is
 * already saying something about the match.
 */
function EntryCard({
  style,
  attached,
  onClick,
  children,
}: {
  style: OutcomeStyle;
  attached: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attached}
      // One step tighter than the panel it sits in, rather than a third radius
      // on the page.
      className={`flex h-full w-full flex-col items-stretch rounded-[var(--radius-control)] border p-3.5 text-left transition-shadow ${
        style.card
      } ${
        attached
          ? "ring-2 ring-[var(--color-text-primary)] ring-offset-1 ring-offset-[var(--color-surface-raised)]"
          : "hover:shadow-[var(--shadow-card)]"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * One labelled block of a card's body.
 *
 * The verdict leads and the resume line supports it. You already know what
 * your resume says; the reason to open a card is what it means against this
 * requirement, so that answer comes first and the source it rests on follows.
 *
 * The two are told apart without reading, on three axes at once: the label
 * opens its own line (a run-in label left no mark of where one block ended and
 * the next began, and the pair read as one paragraph), the verdict is
 * near-black at 12px against the source's grey 11px, and the source carries a
 * document mark. Neither is boxed — a fenced-off panel inside an already
 * tinted card just punches a hole in it.
 *
 * Deliberately not set as a quotation. The analysis prompt asks the model to
 * quote *or closely paraphrase* the supporting line, so quote marks would
 * assert a fidelity the text does not have. It is an attribution, not a quote.
 */
function Block({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "source" | "verdict";
}) {
  const verdict = tone === "verdict";
  return (
    <div>
      <p
        className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] ${
          verdict ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-muted)]"
        }`}
      >
        {!verdict && (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            className="h-3 w-3 shrink-0"
            aria-hidden
          >
            <path
              strokeLinejoin="round"
              d="M11.5 3H6.75A1.75 1.75 0 0 0 5 4.75v10.5A1.75 1.75 0 0 0 6.75 17h6.5A1.75 1.75 0 0 0 15 15.25V6.5z"
            />
            <path strokeLinejoin="round" d="M11.5 3v3.5H15" />
          </svg>
        )}
        {label}
      </p>
      {/* break-words: this renders lines quoted straight out of a resume or a
          posting, which is where the URLs and the slash-separated tech runs
          live. Without it one of those paints outside the tinted card. */}
      <p
        className={`mt-1 break-words leading-relaxed ${
          verdict
            ? "text-xs text-[var(--color-text-primary)]"
            : "text-[11px] text-[var(--color-text-tertiary)]"
        }`}
      >
        {text}
      </p>
    </div>
  );
}

function AttachedNote() {
  return (
    <p className="mt-2 text-[10px] font-semibold text-[var(--color-text-primary)]">
      Attached to your next chat message
    </p>
  );
}

/**
 * Cards side by side: as many across as fit, one on a phone.
 *
 * The number that matters is the narrowest a card can get and still hold a
 * requirement and its outcome pill on one line — around 350px — so that is the
 * number this states, and the column count follows from it.
 *
 * It used to be `md:grid-cols-2 xl:grid-cols-3`, which asked the window how
 * wide the cards were. The window is the wrong thing to ask: the report sits
 * left of a rail that is 0, 68 or 320px depending on state, so `xl` — the point
 * at which a third column was added — is also the point at which 320px is taken
 * away. Three columns came out *narrower* than two: 256px against 307px, both
 * well under the 350 this grid is built around, and the pill dropped below the
 * requirement on nearly every card.
 */
const CARD_GRID = "auto-grid auto-grid-fill [--col-min:22rem] gap-2.5";

function tally(items: MatchReportItem[]): Partial<Record<Outcome, number>> {
  return items.reduce<Partial<Record<Outcome, number>>>((acc, item) => {
    const key = outcomeOf(item.status, item.strength);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * The whole report in one line: how many of each outcome, and the control that
 * narrows the report to them.
 *
 * The score says how you did; this says what it is made of, which is the
 * question anyone actually has next. Sits right under the summary so the
 * answer is above the fold whatever the report contains.
 *
 * The counts are also the only place on the page that names all four outcomes
 * at once, which makes them the obvious place to filter from — "5 partial" is
 * already the question "which five?". They toggle and they combine, so gap and
 * partial together — everything with work left in it — is two clicks.
 *
 * Selected is a near-black ring and unselected is dimmed, the same two devices
 * the cards use, because the four fills are spoken for by the outcome scale.
 */
function OutcomeTally({
  counts,
  active,
  total,
  onToggle,
  onClear,
}: {
  counts: Partial<Record<Outcome, number>>;
  active: Outcome[];
  total: number;
  onToggle: (outcome: Outcome) => void;
  onClear: () => void;
}) {
  const filtering = active.length > 0;

  return (
    <div
      className="mt-2.5 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Filter requirements by outcome"
    >
      {OUTCOME_ORDER.filter((key) => counts[key]).map((key) => {
        const on = active.includes(key);
        const label = OUTCOME[key].label.toLowerCase();
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={on}
            aria-label={
              on
                ? `Stop showing only ${label} requirements`
                : `Show only the ${counts[key]} ${label} requirements`
            }
            className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11px] font-semibold transition ${
              OUTCOME[key].pill
            } ${
              on
                ? "ring-2 ring-[var(--color-text-primary)] ring-offset-1 ring-offset-[var(--color-surface-raised)]"
                : filtering
                  ? "opacity-45 hover:opacity-100"
                  : "hover:opacity-85"
            }`}
          >
            <OutcomeIcon icon={OUTCOME_ICON[key]} className="h-3.5 w-3.5" />
            {counts[key]} {label}
          </button>
        );
      })}
      {filtering && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-secondary)] underline-offset-2 transition hover:text-[var(--color-text-primary)] hover:underline"
        >
          Show all {total}
        </button>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const severity = score >= 75 ? "success" : score >= 45 ? "warning" : "danger";
  const color = `var(--color-${severity})`;
  // Unfilled track is a lighter step of the same hue, so the arc reads as a
  // proportion of the whole rather than a floating fragment.
  const track = `var(--color-${severity}-muted)`;

  const size = 64;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={track}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - filled)}
            // Start the arc at 12 o'clock instead of 3 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 500ms ease-out" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-lg font-semibold"
          style={{ color }}
          role="img"
          aria-label={`Fit score ${score} out of 100`}
        >
          {score}
        </span>
      </div>
      <p className="eyebrow mt-1">Fit score</p>
    </div>
  );
}

export default function MatchReportView({
  report,
  canAnalyze,
  loading,
  error,
  onAnalyze,
  attachedItemId,
  onAttachItem,
}: Props) {
  const [filter, setFilter] = useState<Outcome[]>([]);

  const toggleFilter = (outcome: Outcome) =>
    setFilter((prev) =>
      prev.includes(outcome) ? prev.filter((o) => o !== outcome) : [...prev, outcome]
    );

  if (!report) {
    // Analysis auto-runs on arrival, so the normal state here is "working".
    if (loading) {
      return (
        <div className="glass-panel p-8 flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--color-text-secondary)]">Analyzing your match…</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Comparing your resume against every requirement in the posting.
          </p>
        </div>
      );
    }

    return (
      <div className="glass-panel p-5">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          {error
            ? "The analysis didn't complete."
            : "Once your resume and the job description are both loaded, analyze them to see a weighted match report — what matches, what's partial, and what's missing."}
        </p>
        {error && <p className="text-[var(--color-danger)] text-xs mb-3">{error}</p>}
        <button onClick={onAnalyze} disabled={!canAnalyze} className="btn-primary w-full">
          {error ? "Try again" : "Analyze match"}
        </button>
      </div>
    );
  }

  const counts = tally(report.items);
  // The filter is held loosely on purpose: a re-analysis, or a chat edit that
  // moves the last gap to a match, can retire an outcome the user had selected.
  // Intersecting with what the report still contains means that self-heals into
  // "show everything" rather than into an empty grid you have to click out of.
  const active = OUTCOME_ORDER.filter((key) => counts[key] && filter.includes(key));
  const filtering = active.length > 0;

  const groups = groupItems(
    filtering
      ? report.items.filter((item) => active.includes(outcomeOf(item.status, item.strength)))
      : report.items
  );
  // Reports saved before standouts existed have no array here.
  const standouts = report.standouts ?? [];

  return (
    // Deliberately unbounded height. A dozen requirements, each with evidence
    // and an assessment, needs the whole page — boxing them into a scroller
    // made the report feel cramped and hid most of it. Back/Next is a sticky
    // bar at the page bottom instead, so a long report never puts the nav out
    // of reach.
    <div className="glass-panel p-5">
      {/* Score, summary and the re-run control on one line: stacked, the three
          of them were 200px of header above a report that wanted the height. */}
      <div className="flex flex-wrap items-start gap-4">
        <ScoreRing score={report.overallScore} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] mb-1">Match report</h3>
          <p className="break-words text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {report.summary}
          </p>
          <OutcomeTally
            counts={counts}
            active={active}
            total={report.items.length}
            onToggle={toggleFilter}
            onClear={() => setFilter([])}
          />
          {error && <p className="text-[var(--color-danger)] text-xs mt-2">{error}</p>}
        </div>
        {/* Full width on a phone, where this wraps below the summary: a small
            left-aligned button with a caption under it read as a footnote to
            the paragraph above rather than as a control. */}
        <div className="w-full sm:w-auto sm:shrink-0 sm:max-w-[200px] sm:text-right">
          <button
            onClick={onAnalyze}
            disabled={loading}
            className="btn-secondary w-full text-xs sm:w-auto"
          >
            {loading ? "Re-analyzing…" : "Re-analyze match"}
          </button>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5">
            Replaces this report, including any accepted chat edits.
          </p>
        </div>
      </div>

      {/* The hint gives way to the filter state while one is on: what is on
          screen is no longer the whole report, and that has to be said
          somewhere the eye already goes. Standouts sit outside the four counts,
          so a filter drops them — said here rather than left as a section that
          silently vanished. */}
      <p className="eyebrow mt-5 mb-2">
        {filtering
          ? `${active.reduce((n, key) => n + (counts[key] ?? 0), 0)} of ${
              report.items.length
            } requirements${standouts.length > 0 ? " · standouts hidden" : ""}`
          : "Click any entry to ask the chat about it"}
      </p>

      <div className="space-y-4">
        {groups.map(([importance, items]) => (
          <div key={importance}>
            <GroupHeading importance={importance} count={items.length} />
            <div className={CARD_GRID}>
              {items.map((item) => {
                const outcome = outcomeOf(item.status, item.strength);
                const attached = item.id === attachedItemId;
                return (
                  <EntryCard
                    key={item.id}
                    style={OUTCOME[outcome]}
                    attached={attached}
                    onClick={() => onAttachItem(item.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-sm font-semibold leading-snug text-[var(--color-text-primary)]">
                        {item.requirement}
                      </p>
                      <Pill style={OUTCOME[outcome]} icon={OUTCOME_ICON[outcome]} />
                    </div>

                    {(item.evidence || item.note) && (
                      <div className={`mt-2.5 space-y-3 border-t pt-2.5 ${OUTCOME[outcome].rule}`}>
                        {item.note && (
                          <Block label="Assessment" text={item.note} tone="verdict" />
                        )}
                        {item.evidence && (
                          <Block label="From your resume" text={item.evidence} tone="source" />
                        )}
                      </div>
                    )}

                    {attached && <AttachedNote />}
                  </EntryCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!filtering && standouts.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)]">
          <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-primary)]">
              Standouts
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              This posting never asked for these — the letter uses at most one.
            </p>
          </div>
          <div className={CARD_GRID}>
            {standouts.map((standout) => {
              const attached = standout.id === attachedItemId;
              return (
                <EntryCard
                  key={standout.id}
                  style={STANDOUT_STYLE}
                  attached={attached}
                  onClick={() => onAttachItem(standout.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-semibold leading-snug text-[var(--color-text-primary)]">
                      {standout.credential}
                    </p>
                    <Pill style={STANDOUT_STYLE} icon={STANDOUT_ICON} />
                  </div>
                  {(standout.evidence || standout.whyValuable) && (
                    <div className={`mt-2.5 space-y-3 border-t pt-2.5 ${STANDOUT_STYLE.rule}`}>
                      {standout.whyValuable && (
                        <Block
                          label="Why it matters"
                          text={standout.whyValuable}
                          tone="verdict"
                        />
                      )}
                      {standout.evidence && (
                        <Block label="From your resume" text={standout.evidence} tone="source" />
                      )}
                    </div>
                  )}
                  {attached && <AttachedNote />}
                </EntryCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
