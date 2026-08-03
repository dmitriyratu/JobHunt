"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LatexEditor from "./LatexEditor";
import ResumePdfPreview from "./ResumePdfPreview";
import ChangeAuditModal, {
  changeCount,
  type FitSummary,
  type GroundingSummary,
} from "./ChangeAuditModal";
import { splitDocument } from "@/lib/resumeLatex";
import { revealDownload } from "@/lib/saveDownload";
import { lineAt, parseSyncTex } from "@/lib/synctex";
import type { CompileState } from "@/lib/useLatexCompile";
import type { ResumePageTarget, TailoredResume } from "@/types";

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
  /**
   * The last file written from this pane, or null before anything was saved.
   *
   * `usedFolders` decides whether there is somewhere to open: the fallback path
   * is a flat browser download, whose location the page never learns.
   */
  saved: { path: string; usedFolders: boolean } | null;
  /**
   * What the grounding pass did to this generation, or null if none has run in
   * this session. Reported rather than silent: the document says something
   * different from what the model first wrote, and that is worth knowing.
   *
   * Carries the per-line decisions, not just the counts — see ChangeAuditModal
   * for why a count is the wrong unit for this.
   */
  grounding: GroundingSummary | null;
  /**
   * What the page-fitting pass cut to reach the length target, or null if it
   * did not run. Same argument as grounding: the document holds less than the
   * writer produced, and that should be visible rather than discovered.
   */
  fit: FitSummary | null;
  /**
   * The structured document, read only for what the fitting pass cut: dropped
   * bullets stay in the data with their text, and that text is the audit's
   * whole point.
   */
  resume: TailoredResume | null;
  /**
   * Copied fields — employers, titles, dates — that the uploaded document does
   * not state. Reported rather than corrected: the app cannot know which side
   * is right, and quietly rewriting an employer name would be the same defect
   * from the other direction. This is the loudest notice on the pane because it
   * is the only one describing something that might not be true.
   */
  factIssues: { where: string; field: string; value: string }[];
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
};

const VIEWS: [DocumentView, string][] = [
  ["split", "Split"],
  ["pdf", "PDF"],
];

/**
 * A saved path split into the two segments worth printing.
 *
 * The full path is 60-odd characters of which the last two are the only ones
 * anybody reads — the rest is their home directory. Both are shown, not just
 * the folder: a lone folder name reads as "somewhere over there", and what the
 * link actually does is point at one file inside it.
 *
 * Kept as two strings rather than one joined label so the folder can truncate
 * on a narrow pane while the file name — the more specific half, and the last
 * thing a CSS truncation would leave standing — always survives.
 */
function splitPath(filePath: string): { folder: string; file: string } {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return {
    folder: parts.length > 1 ? parts[parts.length - 2] : "",
    file: parts[parts.length - 1] ?? filePath,
  };
}

export default function ResumeDocumentPane({
  tex,
  onTexChange,
  compile,
  pageTarget,
  loading,
  hasResume,
  engineHint,
  downloading,
  saved,
  grounding,
  fit,
  resume,
  factIssues,
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

  // What the two automatic passes did, behind a button rather than in a
  // paragraph. Zero means both passes left the document alone.
  const [auditOpen, setAuditOpen] = useState(false);
  const changes = useMemo(() => changeCount(grounding, fit), [grounding, fit]);
  // Deliberately not folded into `changes`: lines the tailoring never used are
  // the normal outcome, not something that was done to the document, and
  // counting them would report a clean generation as forty changes.
  const unused = resume?.omitted?.length ?? 0;

  // Only set when revealing fails — a file moved since it was written, or a
  // machine with no file manager on the path. Shown next to the link rather
  // than thrown, because the save itself already worked.
  // Tied to the path it happened on, so the next save clears it without an
  // effect to watch for one.
  const [revealError, setRevealError] = useState<{ path: string; message: string } | null>(null);
  const handleReveal = useCallback(async () => {
    if (!saved) return;
    const message = await revealDownload(saved.path);
    setRevealError(message ? { path: saved.path, message } : null);
  }, [saved]);

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

  // Ctrl/Cmd+Enter rebuilds. The document no longer follows the source on its
  // own, and reaching for the mouse after every edit is the cost of that; this
  // is what keeps a tightening pass — cut a line, look, cut another — feeling
  // like the live preview it replaced.
  const runCompile = compile.compile;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      runCompile();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runCompile]);

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
          {/* The length of the document belongs with the view of it, not with
              the download buttons: it describes what you are looking at, and
              beside "Download PDF" it read as something about the file you were
              about to save. */}
          <div className="flex flex-wrap items-center gap-3">
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
                      ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Describes the PDF on screen, so it keeps saying what that
                document is while the next one builds — the button beside it is
                what reports the build. Dimmed while compiling because the count
                is about to be restated, and possibly differently. */}
            {compile.pages > 0 && (
              <span
                className={`text-xs transition-opacity ${
                  compile.compiling ? "opacity-50" : ""
                } ${
                  overTarget ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"
                }`}
              >
                {compile.pages} page{compile.pages === 1 ? "" : "s"}
                {pageTarget !== null && ` · target ${pageTarget}`}
              </span>
            )}

            {/* Sits with the page count because it is the same kind of fact —
                what this document is, not something to do about it — and is
                typeset like it for the same reason. As a bordered chip beside
                the download buttons it read as a control of equal weight to
                them, which is three times the emphasis a line that usually says
                "nothing was wrong" deserves.

                Amber only when the passes changed something. The link colour is
                the whole distinction from the green saved-file link opposite:
                one reports on the document, the other opens a folder on disk. */}
            {(changes > 0 || unused > 0) && (
              <button
                type="button"
                onClick={() => setAuditOpen(true)}
                title={[
                  grounding &&
                    `${grounding.checked} rewritten ${
                      grounding.checked === 1 ? "line was" : "lines were"
                    } checked against the document you uploaded.`,
                  changes > 0
                    ? `${changes} change${changes === 1 ? "" : "s"} to review.`
                    : grounding && "Nothing was changed.",
                  unused > 0 &&
                    `${unused} line${unused === 1 ? "" : "s"} of your resume ${
                      unused === 1 ? "is" : "are"
                    } not used on this page.`,
                  "Click for the details.",
                ]
                  .filter(Boolean)
                  .join(" ")}
                className={`text-xs underline decoration-dotted underline-offset-2 transition-colors ${
                  changes > 0
                    ? "font-medium text-[var(--color-warning)] hover:text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                {/* Named, not numbered: "4 unused" says nothing about what was
                    counted, and the count is the less interesting half. */}
                {[
                  changes > 0 && `${changes} change${changes === 1 ? "" : "s"}`,
                  unused > 0 &&
                    `${unused} unused ${changes > 0 ? "" : "resume "}line${unused === 1 ? "" : "s"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </button>
            )}
          </div>

          {/* Downloads live up here beside the view tabs rather than under the
              document: they're what you came to do, and at the foot of a pane
              that scrolls they sat below the fold.

              Full width on a phone, where they wrap onto a line of their own
              anyway — left at their content width they sat as two small tabs
              against a lot of empty row, which read as leftovers rather than as
              the thing the page is for. */}
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {/* One link, not a link and a caption and a confirmation. It used
                to be a panel under the document — the full path on its own
                line, below the fold on a scrolled pane, printed for copying
                because a page cannot navigate to a file:// URL. The server can
                do what the page cannot, so the path is a control now rather
                than a notice, and the folder name is the whole of it: the file
                name was a second thing to read for something the tick already
                says, and the path is one hover away.

                Green, matching its tick — the one green thing in the row is the
                one reporting a success, which is what keeps it from reading as
                another of the document's statistics. */}
            {saved && (
              <span className="flex min-w-0 items-center gap-1 text-xs">
                <span className="shrink-0 text-[var(--color-success)]">✓</span>
                {saved.usedFolders ? (
                  <button
                    type="button"
                    onClick={handleReveal}
                    title={`Saved as ${saved.path}\n\nClick to open the folder.`}
                    className="max-w-[14rem] truncate font-medium text-[var(--color-success)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-text-primary)]"
                  >
                    {splitPath(saved.path).folder || splitPath(saved.path).file}
                  </button>
                ) : (
                  // The browser-download fallback: no folders were made, so
                  // there is no folder to open — only the name it landed under.
                  <span
                    className="max-w-[14rem] truncate text-[var(--color-text-muted)]"
                    title={`Saved to your browser's download folder as ${saved.path}`}
                  >
                    {saved.path}
                  </span>
                )}
              </span>
            )}
            {/* Failures only. A successful open announces itself by being a
                window on your screen, and the confirmation that stood here
                said, permanently and next to a green tick, something the user
                could already see. */}
            {revealError?.path === saved?.path && revealError && (
              <span className="text-xs text-[var(--color-warning)]">{revealError.message}</span>
            )}

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
              className="btn-primary flex-1 px-4 py-2 text-sm sm:flex-none"
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
              className="btn-secondary shrink-0 px-4 py-2 text-xs"
            >
              .docx
            </button>
          </div>
        </div>

        {factIssues.length > 0 && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--color-warning)]">
              Check {factIssues.length === 1 ? "this" : "these"} against your own resume
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {factIssues.length === 1 ? "This detail is" : "These details are"} on the document
              but {factIssues.length === 1 ? "does not" : "do not"} appear in the file you
              uploaded. Employers, titles and dates are meant to be copied exactly, so this is
              either an extraction problem or something that should not be there.
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {factIssues.slice(0, 6).map((issue, i) => (
                <li key={i} className="text-xs text-[var(--color-text-secondary)]">
                  <span className="text-[var(--color-text-muted)]">{issue.field}:</span>{" "}
                  <span className="font-medium">{issue.value}</span>
                  <span className="text-[var(--color-text-muted)]"> — {issue.where}</span>
                </li>
              ))}
              {factIssues.length > 6 && (
                <li className="text-xs text-[var(--color-text-muted)]">
                  and {factIssues.length - 6} more
                </li>
              )}
            </ul>
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
            <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-[var(--color-text-muted)]">
              <span className="truncate">
                {showFullSource ? "Full LaTeX source" : "Document content"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
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

                {/* The preview stopped following the source, so this is what
                    closes the loop — and it has to carry the fact that it needs
                    pressing, because a document that is quietly one edit out of
                    date looks exactly like one that is current.

                    It belongs to the editor, not to the toolbar and not to the
                    document: what you press it about is the text you just typed,
                    and it only exists in the view where that text is on screen.
                    Sitting in the label row it costs no height and lands where
                    the eye already goes for the preamble toggle.

                    Accented only while there is something to build. A button
                    that shouts whether or not it has work reads as decoration
                    after the second glance, and the state that matters here is
                    the one where what you are reading is not what you wrote. */}
                <button
                  type="button"
                  onClick={runCompile}
                  disabled={compile.compiling}
                  title="Rebuild the preview from the source (Ctrl/Cmd+Enter)"
                  className={`rounded px-1.5 py-0.5 font-medium transition-colors disabled:opacity-50 ${
                    compile.dirty
                      ? "bg-[var(--color-accent)] text-white hover:opacity-90"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  {compile.compiling ? "Typesetting…" : "Recompile"}
                </button>
              </div>
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

      <ChangeAuditModal
        open={auditOpen}
        grounding={grounding}
        fit={fit}
        resume={resume}
        onClose={() => setAuditOpen(false)}
      />
    </div>
  );
}
