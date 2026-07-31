"use client";

import { useState } from "react";
import Link from "next/link";
import type { MatchReport } from "@/types";

/**
 * What the next step will be given, folded away.
 *
 * This is provenance rather than input — it says nothing you didn't already
 * decide on an earlier step — so it opens collapsed and stays out of the way of
 * the work. The exception is the company field: when nothing was detected,
 * there is a blank here that actually needs filling, and hiding it behind a
 * disclosure would hide the one thing on this panel that isn't just a recap.
 */

type Props = {
  resumeFilename: string;
  resumeText: string;
  jobSource: string;
  jobDescription: string;
  report: MatchReport | null;
  jobTitle: string;
  detectedCompany: string;
  companyName: string;
  onCompanyNameChange: (v: string) => void;
};

/**
 * One row of the definition list.
 *
 * Values are left-aligned into a shared column rather than right-aligned to the
 * panel edge. Right-alignment gave every value a different starting x, so once
 * one of them wrapped there was nothing tying a line back to its label.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-[var(--color-text-secondary)] min-w-0">{children}</dd>
    </>
  );
}

/**
 * A job URL is far too long to sit in a right-aligned row — truncating it just
 * shows a meaningless prefix. Show the host instead and keep the full URL on
 * the link, which is both shorter and more useful than a clipped string.
 */
function JobSourceValue({ jobSource, charCount }: { jobSource: string; charCount: number }) {
  if (!jobSource) return <>—</>;

  let url: URL | null = null;
  try {
    const parsed = new URL(jobSource);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed;
  } catch {
    // Not a URL — a filename or pasted text.
  }

  // The source and its size go on separate lines. Kept inline, the narrow
  // column truncated the whole value and the character count — the part that
  // says the posting is sent in full — was the first thing to disappear.
  const meta = (
    <span className="block text-[var(--color-text-muted)]">
      {charCount.toLocaleString()} chars, sent in full
    </span>
  );

  if (!url) {
    return (
      <>
        <span className="block truncate" title={jobSource}>
          {jobSource}
        </span>
        {meta}
      </>
    );
  }

  return (
    <>
      <a
        href={url.href}
        target="_blank"
        rel="noopener noreferrer"
        title={url.href}
        className="block truncate text-[var(--color-accent)] hover:underline"
      >
        {url.hostname.replace(/^www\./, "")} ↗
      </a>
      {meta}
    </>
  );
}

export default function ContextRecap({
  resumeFilename,
  resumeText,
  jobSource,
  jobDescription,
  report,
  jobTitle,
  detectedCompany,
  companyName,
  onCompanyNameChange,
}: Props) {
  const needsCompany = !detectedCompany && !companyName.trim();
  const [open, setOpen] = useState(needsCompany);

  // The line answers "which application am I in?", which is the only thing
  // worth knowing at a glance. Shown open or closed, so the header's height
  // never changes — the action beside it in the top bar is sized to match, and
  // a header that grew on expand dragged the button's height with it.
  const summary = [jobTitle, detectedCompany || companyName].map((s) => s.trim()).filter(Boolean);

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-my-1 flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left"
        >
          <svg
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform ${
              open ? "rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Context carried over</span>
            {summary.length > 0 && (
              <span className="block truncate text-xs text-[var(--color-text-muted)]">
                {summary.join(" · ")}
              </span>
            )}
          </span>
        </button>

        {open && (
          <Link
            href="/match"
            className="shrink-0 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] hover:underline rounded-md px-2 py-1.5 -my-1.5"
          >
            Edit match report
          </Link>
        )}
      </div>

      {!open ? null : (
        <>
      <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4 gap-y-3 text-xs items-baseline">
        {jobTitle && <Row label="Role">{jobTitle}</Row>}

        {detectedCompany ? (
          <Row label="Company">{detectedCompany}</Row>
        ) : (
          <>
            <dt className="text-[var(--color-text-muted)]">
              <label htmlFor="recap-company">Company</label>
            </dt>
            <dd className="min-w-0">
              <input
                id="recap-company"
                value={companyName}
                onChange={(e) => onCompanyNameChange(e.target.value)}
                placeholder="Not detected — type it here"
                // text-base below sm: a sub-16px field makes iOS zoom the whole
                // page on focus and never zoom back out.
                className="input-base py-1.5 text-base sm:text-xs"
              />
            </dd>
          </>
        )}

        <Row label="Resume">
          <span className="block truncate" title={resumeFilename || undefined}>
            {resumeFilename || "—"}
          </span>
          <span className="block text-[var(--color-text-muted)]">
            {resumeText.length.toLocaleString()} chars, sent in full
          </span>
        </Row>
        <Row label="Job description">
          <JobSourceValue jobSource={jobSource} charCount={jobDescription.length} />
        </Row>
        {/* Spell out that the whole report goes in, not just the headline score
            — "84/100 · 12 requirements" reads like the score is all the letter
            gets, when in fact every requirement, its evidence and its
            assessment are part of the prompt. */}
        <Row label="Match report">
          {report ? (
            <>
              all {report.items.length} requirements with evidence
              {(report.standouts ?? []).length > 0 &&
                ` · ${(report.standouts ?? []).length} standout${
                  (report.standouts ?? []).length === 1 ? "" : "s"
                }`}{" "}
              · {report.overallScore}/100 fit
            </>
          ) : (
            "Not analyzed"
          )}
        </Row>
      </dl>

      <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
        Everything above is passed on in full, plus the recipient, the company and any notes you
        add below.
      </p>
        </>
      )}
    </div>
  );
}
