"use client";

import { useState } from "react";
import Link from "next/link";
import SourceLink from "./SourceLink";
import type { AssertedFact, MatchReport } from "@/types";

/**
 * What the next step will be given, folded away.
 *
 * This is provenance rather than input — it says nothing you didn't already
 * decide on an earlier step — so it opens collapsed and stays out of the way of
 * the work. Always: an undetected company used to spring the whole panel open
 * on arrival, which spent a screen of recap to surface one empty field and made
 * the step look like it was asking for something before you had done anything.
 *
 * The blank still has to be findable, so the summary line says so — that is one
 * line in a place the eye already lands, and the field itself is one click
 * behind it.
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
  /**
   * Facts you stated that the uploaded file doesn't contain. Listed here
   * because this panel's promise is that it shows everything the next step is
   * given, and these are the only part of that which isn't a file you chose or
   * a report you can see — they were agreed to in passing, possibly on a
   * different application, and this is where they become visible again.
   */
  assertedFacts: AssertedFact[];
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
 * shows a meaningless prefix, so `SourceLink` shows the host and keeps the full
 * URL on the link.
 *
 * The source and its size go on separate lines. Kept inline, the narrow column
 * truncated the whole value and the character count — the part that says the
 * posting is sent in full — was the first thing to disappear.
 */
function JobSourceValue({ jobSource, charCount }: { jobSource: string; charCount: number }) {
  if (!jobSource) return <>—</>;

  return (
    <>
      <SourceLink source={jobSource} className="block truncate" />
      <span className="block text-[var(--color-text-muted)]">
        {charCount.toLocaleString()} chars, sent in full
      </span>
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
  assertedFacts,
}: Props) {
  const needsCompany = !detectedCompany && !companyName.trim();
  const [open, setOpen] = useState(false);

  // The line answers "which application am I in?", which is the only thing
  // worth knowing at a glance. Shown open or closed, so the header's height
  // never changes — the action beside it in the row is sized to match, and a
  // header that grew on expand would leave the two mismatched.
  const summary = [jobTitle, detectedCompany || companyName].map((s) => s.trim()).filter(Boolean);

  return (
    /*
     * Collapsed, the panel *is* --recap-h — the height sits on this element
     * rather than on the row inside it, so `border-box` swallows the hairline
     * whatever it happens to render as. That matters: at a 1.5 device pixel
     * ratio Chrome draws the 1px border as 0.667px, so subtracting a literal
     * 2px from the inner row missed the button by a fraction on exactly the
     * displays most people have.
     *
     * Expanded, the height comes off and normal padding takes over; the two
     * stay aligned at the top, which is all that is left to match once the
     * card is taller than the button by design.
     */
    <div className={`glass-panel px-5 ${open ? "pt-4 pb-5" : "h-[var(--recap-h)]"}`}>
      <div
        className={`flex items-center justify-between gap-2 ${open ? "" : "h-full"}`}
      >
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
            {(summary.length > 0 || needsCompany) && (
              <span className="block truncate text-xs text-[var(--color-text-muted)]">
                {summary.join(" · ")}
                {needsCompany && (
                  <>
                    {summary.length > 0 && " · "}
                    <span className="text-[var(--color-warning)]">no company detected</span>
                  </>
                )}
              </span>
            )}
          </span>
        </button>

        {open && (
          <Link
            href="/match"
            className="tap -my-1.5 inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] hover:underline"
          >
            Edit match report
          </Link>
        )}
      </div>

      {!open ? null : (
        <div className="mt-4">
      {/* Labels above their values on a phone, beside them from `sm`. The 5rem
          label column was narrower than "Job description" at this size, so the
          label wrapped to two lines and `items-baseline` then aligned its
          *second* line with the value — the row read as broken rather than
          tight. */}
      <dl className="grid grid-cols-1 gap-x-3 gap-y-3 text-xs sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-x-4 sm:items-baseline">
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
                //
                // No `py-1.5`: it overrode .input-base's own padding and left
                // the panel's one editable field 30px tall on a tablet, where
                // the pointer is a finger. text-sm rather than text-xs from
                // `sm:` for the same reason — 12px is a caption, not a field.
                className="input-base text-base sm:text-sm"
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

        {/* Listed rather than counted. "3 stated facts" tells you nothing about
            whether they are still true, and these go onto a document you send
            to an employer — the whole reason to show them here is so you can
            read one and think "that shouldn't be on this application". */}
        {assertedFacts.length > 0 && (
          <Row label="Also told us">
            {/* Wrapped, not truncated. These are the whole point of the row —
                you are meant to read one and think "that shouldn't be on this
                application" — and a `title` tooltip is the one affordance a
                touch screen doesn't have, so on a phone the ellipsis was the
                end of the story. */}
            <ul className="space-y-0.5">
              {assertedFacts.map((fact) => (
                <li key={fact.id} className="break-words">
                  {fact.text}
                </li>
              ))}
            </ul>
            <span className="block text-[var(--color-text-muted)]">
              Treated as part of your resume. Edit under Your Profile.
            </span>
          </Row>
        )}
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
        </div>
      )}
    </div>
  );
}
