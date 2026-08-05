"use client";

import { useEffect, useState } from "react";
import CompanyLogo from "@/components/CompanyLogo";
import JobFactsAside from "@/components/jobfacts/JobFactsAside";
import JobFactsCardLine from "@/components/jobfacts/JobFactsCardLine";
import JobFactsPanel from "@/components/jobfacts/JobFactsPanel";
import {
  FACTS_HOURLY,
  FACTS_PARTIAL,
  FACTS_RICH,
  FACTS_SPARSE,
} from "@/fixtures/jobFacts";
import { applyTheme, loadTheme, type Theme } from "@/lib/theme";
import type { JobFacts } from "@/types";

/**
 * The panel and the card line, against postings of decreasing candour.
 *
 * What is left of the bench that chose between four placements — the three that
 * lost are gone, and so are their sections here. It stays because the thing it
 * tests is not the choice but the data: a posting that states one fact, a
 * posting that pays by the hour, a posting that won't say what it pays. Those
 * are the cases that break a layout, they cost an API call each to reproduce in
 * the real app, and they are exactly the ones nobody has to hand when they are
 * about to adjust a margin.
 */

const DATASETS: { id: string; label: string; note: string; facts: JobFacts }[] = [
  { id: "rich", label: "Generous posting", note: "all 10 stated", facts: FACTS_RICH },
  { id: "partial", label: "Typical posting", note: "no pay, 5 stated", facts: FACTS_PARTIAL },
  { id: "sparse", label: "Says nothing", note: "1 stated", facts: FACTS_SPARSE },
  { id: "hourly", label: "Hourly contract", note: "$/hr, no sponsorship", facts: FACTS_HOURLY },
];

/** The panel's other two states, which no fixture can reach on its own. */
const STATES = [
  { id: "facts", label: "Extracted" },
  { id: "loading", label: "Reading…" },
  { id: "error", label: "Failed" },
] as const;

type StateId = (typeof STATES)[number]["id"];

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow shrink-0">{label}</span>
      <div className="seg-track bg-[var(--color-surface)]">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`seg-item ${value === o.id ? "seg-item-active" : ""}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One card in the applications rail, at the rail's real 320px width. */
function RailCard({
  role,
  company,
  domain,
  score,
  stage,
  when,
  active,
  facts,
}: {
  role: string;
  company: string;
  domain: string;
  score: number | null;
  stage: string;
  when: string;
  active?: boolean;
  facts: JobFacts | null;
}) {
  const scoreClass =
    score === null
      ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]"
      : score >= 75
        ? "bg-[var(--color-success-muted)] text-[var(--color-success)]"
        : score >= 45
          ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
          : "bg-[var(--color-danger-muted)] text-[var(--color-danger)]";

  return (
    <div
      className={`rounded-lg border p-3 ${
        active
          ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
          : "border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]"
      }`}
    >
      <div className="flex items-start gap-3 pr-5">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-1.5">
          <CompanyLogo company={company} domain={domain} variant="tile" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words leading-snug">{role}</p>
          <p className="text-xs text-[var(--color-text-muted)] break-words mt-0.5">{company}</p>
        </div>
      </div>

      {facts && <JobFactsCardLine facts={facts} variant="chips" />}

      <div className="flex items-center flex-wrap gap-2 mt-2.5 text-[10px]">
        <span className={`px-1.5 py-0.5 rounded-full font-medium ${scoreClass}`}>
          {score === null ? "Not analyzed" : `${score}/100`}
        </span>
        <span className="text-[var(--color-text-muted)]">{stage}</span>
        <span className="text-[var(--color-text-muted)] ml-auto">{when}</span>
      </div>
    </div>
  );
}

function Caption({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">{children}</p>
    </div>
  );
}

export default function JobFactsDemo() {
  const [dataset, setDataset] = useState(DATASETS[0].id);
  const [panelState, setPanelState] = useState<StateId>("facts");
  const [theme, setTheme] = useState<Theme>("light");
  /**
   * Corrections made here, held for as long as the bench is open.
   *
   * The editors are half of what the panel now is, and they cannot be judged
   * from a static render: whether "Setup" should be a select turns on what it
   * feels like to fix a wrong one. Discarded on switching posting, since the
   * edit was to that posting's facts.
   */
  const [override, setOverride] = useState<JobFacts | null>(null);

  useEffect(() => setTheme(loadTheme()), []);
  useEffect(() => applyTheme(theme), [theme]);

  const base = DATASETS.find((d) => d.id === dataset)?.facts ?? FACTS_RICH;
  const facts = override ?? base;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[var(--color-surface)]">
      <div className="sticky top-0 z-10 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-6 py-3">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle
            label="Posting"
            value={dataset}
            options={DATASETS.map((d) => ({ id: d.id, label: d.label }))}
            onChange={(id) => {
              setOverride(null);
              setDataset(id);
            }}
          />
          <Toggle
            label="Panel"
            value={panelState}
            options={STATES.map((s) => ({ id: s.id, label: s.label }))}
            onChange={setPanelState}
          />
          <Toggle
            label="Theme"
            value={theme}
            options={[
              { id: "light" as const, label: "Light" },
              { id: "dark" as const, label: "Dark" },
            ]}
            onChange={setTheme}
          />
          <p className="text-xs text-[var(--color-text-muted)]">
            {DATASETS.find((d) => d.id === dataset)?.note}
          </p>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1100px] flex-wrap items-start gap-8 px-6 py-8">
        <div className="w-[320px] shrink-0">
          <Caption title="On the application card">
            Three facts at most, pay first. The rail is 320px with a logo tile in it.
          </Caption>
          <div className="space-y-2 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
            <RailCard
              role="Staff Software Engineer, Payments Infrastructure"
              company="Northwind"
              domain=""
              score={null}
              stage="Job loaded"
              when="just now"
              facts={null}
            />
            <RailCard
              role="Staff Software Engineer, Payments Infrastructure"
              company="Northwind"
              domain=""
              score={82}
              stage="Report ready"
              when="2h ago"
              active
              facts={facts}
            />
            <RailCard
              role="Senior Backend Engineer"
              company="Figma"
              domain="figma.com"
              score={64}
              stage="Resume drafted"
              when="Yesterday"
              facts={FACTS_PARTIAL}
            />
            <RailCard
              role="Principal Engineer, Platform"
              company="Datadog"
              domain="datadoghq.com"
              score={41}
              stage="Job loaded"
              when="3d ago"
              facts={FACTS_HOURLY}
            />
          </div>
        </div>

        <div className="w-[260px] shrink-0">
          <Caption title="Beside the posting">
            Pay at display size, everything the posting skipped shown as &ldquo;Not stated&rdquo;.
          </Caption>
          {/* Through JobFactsPanel rather than the aside directly, so the two
              states a fixture cannot produce are reachable here too. */}
          <JobFactsPanel
            facts={panelState === "facts" ? facts : null}
            loading={panelState === "loading"}
            error={panelState === "error" ? "429 Too Many Requests" : ""}
            onRetry={() => setPanelState("facts")}
            onChange={(next) => {
              setOverride(next);
              setPanelState("facts");
            }}
          />
        </div>

        <div className="w-[260px] shrink-0">
          <Caption title="Aside, non-sticky">
            The same panel as it renders inside a dialog or a drawer.
          </Caption>
          <JobFactsAside facts={facts} sticky={false} />
        </div>
      </div>
    </div>
  );
}
