"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import LatexEditor from "./LatexEditor";
import ResumePdfPreview from "./ResumePdfPreview";
import { splitDocument } from "@/lib/resumeLatex";
import { lineAt, parseSyncTex } from "@/lib/synctex";
import type { CompileState } from "@/lib/useLatexCompile";
import type { ResumePageTarget } from "@/types";

/**
 * The document half of the resume step: LaTeX source on one side, the PDF it
 * produces on the other.
 *
 * There is no accept/reject review here by design. Once the source is the
 * working copy, a change is something you make and see, not something you are
 * asked to rule on — the diff surface lives in the chat, where a change is
 * still a proposal.
 */

/**
 * Two views, not three. A source-only mode existed and earned nothing: editing
 * without the preview beside it is the one thing nobody wants to do here, and
 * Split already gives the editor half the pane.
 */
export type DocumentView = "split" | "pdf";

type Props = {
  tex: string;
  onTexChange: (next: string) => void;
  compile: CompileState;
  /** Null for a CV, which is never trimmed to a page count. */
  pageTarget: ResumePageTarget | null;
  loading: boolean;
  hasResume: boolean;
  /** Set when the machine has no LaTeX engine; nothing can compile until fixed. */
  engineHint: string;
  downloading: boolean;
  savedPath: string;
  /**
   * What the grounding pass did to this generation, or null if none has run in
   * this session. Reported rather than silent: the document says something
   * different from what the model first wrote, and that is worth one line.
   */
  grounding: {
    checked: number;
    repaired: number;
    reverted: number;
    skillsRemoved: number;
    unverified: number;
  } | null;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
};

const VIEWS: [DocumentView, string][] = [
  ["split", "Split"],
  ["pdf", "PDF"],
];

export default function ResumeDocumentPane({
  tex,
  onTexChange,
  compile,
  pageTarget,
  loading,
  hasResume,
  engineHint,
  downloading,
  savedPath,
  grounding,
  onDownloadPdf,
  onDownloadDocx,
}: Props) {
  // The finished document, not its source, is what you open this to look at.
  // Editing is a deliberate move to another tab.
  const [view, setView] = useState<DocumentView>("pdf");
  // Off by default: the preamble is layout, and someone rewriting their resume
  // should land on their own words, not on \usepackage lines.
  const [showFullSource, setShowFullSource] = useState(false);
  const split = useMemo(() => splitDocument(tex), [tex]);

  // Parsed from whatever the preview is currently showing, so a click is always
  // resolved against the document on screen rather than the source being typed.
  const synctex = useMemo(() => parseSyncTex(compile.synctex), [compile.synctex]);
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);
  const nonceRef = useRef(0);

  /**
   * A click on the preview, sent to the editor as a line.
   *
   * SyncTeX counts lines against the whole file, but the editor is usually
   * showing only the folded window, so the number has to be shifted by the
   * lines the fold hides. A click that lands in the hidden part — the header
   * block, or anything in the preamble — unfolds the source rather than doing
   * nothing, because a click that silently fails is worse than one that shows
   * you somewhere unexpected.
   */
  const handleLocate = useCallback(
    (page: number, xPt: number, yPt: number) => {
      const full = lineAt(synctex, page, xPt, yPt);
      if (!full) return;

      const nonce = ++nonceRef.current;
      if (showFullSource) {
        setReveal({ line: full, nonce });
      } else {
        const windowed = full - split.headLines;
        if (windowed >= 1) {
          setReveal({ line: windowed, nonce });
        } else {
          setShowFullSource(true);
          setReveal({ line: full, nonce });
        }
      }
      // Clicking the document in PDF-only view has nowhere to send you.
      setView((v) => (v === "pdf" ? "split" : v));
    },
    [synctex, showFullSource, split.headLines]
  );

  const canLocate = synctex.pages.size > 0;

  if (loading) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center gap-3 p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Picking what argues for this role…
        </p>
      </div>
    );
  }

  if (!hasResume) {
    return (
      <div className="glass-panel p-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">Nothing generated yet.</p>
        <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
          Your document gets re-ordered and re-worded against this posting, then handed to you
          as LaTeX you can edit line by line. The sections and their order are fixed; only what
          goes in them changes.
        </p>
      </div>
    );
  }

  const overTarget = pageTarget !== null && compile.pages > pageTarget;
  // A PDF is only downloadable once one has actually built, and the bytes are
  // whatever is on screen — you send what you reviewed.
  const canDownloadPdf = Boolean(compile.pdfUrl) && !compile.stale;

  return (
    <div className="glass-panel flex flex-col p-5 sm:p-6">
      <div className="mb-4 space-y-3 border-b border-[var(--color-border-subtle)] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Document view"
            className="flex gap-1 rounded-lg bg-[var(--color-surface-overlay)] p-1"
          >
            {VIEWS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:py-1.5 ${
                  view === id
                    ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Downloads live up here beside the view tabs rather than under the
              document: they're what you came to do, and at the foot of a pane
              that scrolls they sat below the fold. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-[var(--color-text-muted)]">
              {compile.compiling
                ? "Typesetting…"
                : compile.pages > 0 && (
                    <span className={overTarget ? "text-[var(--color-warning)]" : undefined}>
                      {compile.pages} page{compile.pages === 1 ? "" : "s"}
                      {pageTarget !== null && ` · target ${pageTarget}`}
                    </span>
                  )}
            </span>

            <button
              onClick={onDownloadPdf}
              disabled={downloading || !canDownloadPdf}
              title={
                canDownloadPdf
                  ? "Every line traces back to the document you uploaded — titles, employers and dates are copied across untouched."
                  : compile.error
                    ? "Fix the error below to download."
                    : "Waiting for the first compile…"
              }
              className="btn-primary px-4 py-2 text-sm"
            >
              {downloading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </span>
              ) : (
                "Download PDF"
              )}
            </button>

            {/* .docx for the portals that still reject a PDF upload. */}
            <button
              onClick={onDownloadDocx}
              disabled={downloading}
              className="btn-secondary px-2.5 py-2 text-xs"
            >
              .docx
            </button>
          </div>
        </div>

        {/* Only when something actually changed. On a clean generation the
            check is invisible, which is the right amount of noise for "nothing
            was wrong". */}
        {grounding &&
          grounding.repaired +
            grounding.reverted +
            grounding.skillsRemoved +
            grounding.unverified >
            0 && (
            <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-muted)] px-3 py-2">
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Checked {grounding.checked} rewritten{" "}
                {grounding.checked === 1 ? "line" : "lines"} against your original document.{" "}
                {[
                  grounding.repaired > 0 &&
                    `${grounding.repaired} ${
                      grounding.repaired === 1 ? "was" : "were"
                    } rewritten to drop a claim it didn't support`,
                  grounding.reverted > 0 &&
                    `${grounding.reverted} ${
                      grounding.reverted === 1 ? "was" : "were"
                    } put back to your own wording`,
                  grounding.skillsRemoved > 0 &&
                    `${grounding.skillsRemoved} ${
                      grounding.skillsRemoved === 1 ? "skill" : "skills"
                    } your resume doesn't claim ${
                      grounding.skillsRemoved === 1 ? "was" : "were"
                    } removed`,
                  // The one case worth a second look: flagged, unfixable, and
                  // with no original line to fall back to, so it stands as
                  // written rather than being deleted.
                  grounding.unverified > 0 &&
                    `${grounding.unverified} couldn't be traced back and ${
                      grounding.unverified === 1 ? "is" : "are"
                    } worth checking yourself`,
                ]
                  .filter(Boolean)
                  .join("; ")}
                .
              </p>
            </div>
          )}

        {savedPath && (
          <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-muted)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--color-success)]">✓ Saved</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-[var(--color-text-secondary)]">
              {savedPath}
            </p>
          </div>
        )}

        {engineHint && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] px-3 py-2">
            <p className="text-xs text-[var(--color-text-secondary)]">{engineHint}</p>
          </div>
        )}

        {compile.error && !engineHint && (
          <details className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-surface)] px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-[var(--color-danger)]">
              {compile.error}
            </summary>
            {compile.log && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--color-text-secondary)]">
                {compile.log}
              </pre>
            )}
          </details>
        )}

        {overTarget && !compile.error && (
          <p className="text-xs text-[var(--color-warning)]">
            Runs to {compile.pages} pages against a target of {pageTarget}. Ask the chat to cut,
            or tighten it here.
          </p>
        )}
      </div>

      {/* On the PDF tab the document sets its own height and the page scrolls.
          Split needs a bound: an editor is an unbounded amount of text, and
          beside it the preview has to agree on a height.

          Split stacks on a phone and goes side by side from lg: up. On the
          stacked layout grid-rows-2 is load-bearing: left to size themselves the
          rows are `auto`, and the preview — a full page of PDF canvas — took
          what it wanted, squeezing the editor to 131px, about six visible lines.
          Two explicit 1fr rows split the box evenly instead, and lg:grid-rows-1
          hands the constraint back to the columns. */}
      {view === "pdf" ? (
        <ResumePdfPreview
          pdfUrl={compile.pdfUrl}
          compiling={compile.compiling}
          stale={compile.stale}
          onLocate={canLocate ? handleLocate : undefined}
        />
      ) : (
        <div className="grid h-[clamp(420px,calc(100dvh-18rem),900px)] grid-cols-1 grid-rows-2 gap-3 lg:grid-cols-2 lg:grid-rows-1">
          <div className="flex min-h-0 flex-col gap-1.5">
            {/* Nothing is removed here — head and tail are spliced back on every
                keystroke, so what compiles and what the chat patches is always
                the whole document. This only decides how much of it you look at. */}
            <div className="flex items-center justify-between px-0.5 text-[11px] text-[var(--color-text-muted)]">
              <span>{showFullSource ? "Full LaTeX source" : "Document content"}</span>
              {split.hiddenLines > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFullSource((v) => !v)}
                  className="rounded px-1.5 py-0.5 font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-surface-hover)]"
                >
                  {showFullSource
                    ? "Hide preamble"
                    : `Show preamble and layout (${split.hiddenLines} lines)`}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <LatexEditor
                reveal={reveal}
                value={showFullSource ? tex : split.body}
                onChange={
                  showFullSource
                    ? onTexChange
                    : (next) => onTexChange(split.head + next + split.tail)
                }
              />
            </div>
          </div>
          <ResumePdfPreview
            pdfUrl={compile.pdfUrl}
            compiling={compile.compiling}
            stale={compile.stale}
            onLocate={canLocate ? handleLocate : undefined}
            boxed
          />
        </div>
      )}

    </div>
  );
}
