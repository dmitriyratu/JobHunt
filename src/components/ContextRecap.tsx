"use client";

import Link from "next/link";
import type { MatchReport } from "@/types";

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
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm">Context carried over</h3>
        <Link
          href="/match"
          className="text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] hover:underline rounded-md px-2 py-1.5 -mx-2 -my-1.5"
        >
          Edit match report
        </Link>
      </div>

      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4 gap-y-3 text-xs items-baseline">
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
        Everything above is passed to the letter in full, plus the recipient, the company and any
        notes you add below.
      </p>
    </div>
  );
}
