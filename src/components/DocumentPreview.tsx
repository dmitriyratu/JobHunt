"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { wordRegExp } from "@/lib/proofread";

type Props = {
  cleanedText: string;
  fileUrl?: string;
  fileName?: string;
  isPdf?: boolean;
  externalUrl?: string;
  /**
   * A word to find in the cleaned text and scroll to.
   *
   * The proofread list names a word; "where is it" is the question every row
   * raises, and the answer is a hundred lines up in a scrolling box. Setting
   * this marks every occurrence and brings the first into view.
   */
  highlight?: string;
};

export default function DocumentPreview({
  cleanedText,
  fileUrl,
  fileName,
  isPdf,
  externalUrl,
  highlight,
}: Props) {
  const hasOriginal = Boolean(fileUrl || externalUrl);
  const [tab, setTab] = useState<"clean" | "original">("clean");
  const [expanded, setExpanded] = useState(false);
  const showClean = tab === "clean" || !hasOriginal;
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  // A highlight is only visible on the cleaned text — the original is a PDF the
  // app cannot annotate — so asking for one switches to the tab that can show it.
  useEffect(() => {
    if (highlight) setTab("clean");
  }, [highlight]);

  // Centred rather than merely scrolled into view: the box is short, and a match
  // pinned to its top edge reads as the first line of the document.
  useEffect(() => {
    if (!highlight) return;
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, expanded]);

  const cleanBody = highlight ? marked(cleanedText, highlight, markRef) : cleanedText;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--color-text-secondary)]">Preview</p>
        <div className="flex items-center gap-2">
          {hasOriginal && (
            <div className="flex gap-1 p-1 bg-[var(--color-surface)] rounded-lg">
              <button type="button" onClick={() => setTab("clean")} className={tabClass(tab === "clean")}>
                Cleaned text
              </button>
              <button type="button" onClick={() => setTab("original")} className={tabClass(tab === "original")}>
                Original
              </button>
            </div>
          )}
          {showClean && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand full text"
              title="Expand full text"
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] sm:h-7 sm:w-7"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showClean ? (
        <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border-subtle)]">
          {cleanBody}
        </pre>
      ) : externalUrl ? (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            View the original posting on its source site.
          </p>
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs py-1.5 px-3 inline-flex"
          >
            Open original posting ↗
          </a>
        </div>
      ) : isPdf && fileUrl ? (
        <>
          {/* iOS Safari won't render an inline PDF through <embed> — it leaves a
              blank grey box — so small screens get a link out instead. */}
          <div
            className="hidden sm:block rounded-lg border border-[var(--color-border-subtle)] overflow-hidden"
            style={{ height: 320 }}
          >
            <embed src={fileUrl} type="application/pdf" width="100%" height="100%" />
          </div>
          <div className="sm:hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 text-center">
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Open the PDF to view it on this device.
            </p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs py-1.5 px-3 inline-flex"
            >
              Open {fileName ?? "PDF"} ↗
            </a>
          </div>
        </>
      ) : fileUrl ? (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Inline preview isn&rsquo;t available for this file type — open it to view.
          </p>
          <a href={fileUrl} download={fileName} className="btn-secondary text-xs py-1.5 px-3 inline-flex">
            Open {fileName ?? "file"}
          </a>
        </div>
      ) : null}

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-scrim)] p-3 sm:p-6"
          onClick={() => setExpanded(false)}
        >
          <div
            className="glass-panel w-full max-w-2xl max-h-[85dvh] flex flex-col p-0 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)] shrink-0">
              <p className="text-sm font-medium">
                Full cleaned text — {cleanedText.length.toLocaleString()} characters
              </p>
              <button onClick={() => setExpanded(false)} className="btn-secondary text-xs py-1.5 px-3">
                Close
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap p-5">
              {cleanBody}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The text with every occurrence of a word wrapped for the eye.
 *
 * Every occurrence, not just the first, because accepting a fix changes all of
 * them — showing one would misrepresent what the button does. The ref goes on
 * the first so there is something to scroll to.
 */
function marked(text: string, word: string, firstRef: React.Ref<HTMLElement>): ReactNode {
  const pattern = wordRegExp(word, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <mark
        key={index}
        ref={index === 0 ? firstRef : undefined}
        className="rounded-sm bg-[var(--color-warning-muted)] px-0.5 text-[var(--color-text-primary)] ring-1 ring-[var(--color-warning)]/50"
      >
        {match[0]}
      </mark>
    );
    last = match.index + match[0].length;
    index++;
    // A zero-length match would spin forever; the pattern cannot produce one,
    // but the loop should not depend on that being true.
    if (match[0].length === 0) pattern.lastIndex++;
  }

  if (!index) return text;
  out.push(text.slice(last));
  return out;
}

function tabClass(active: boolean) {
  // py-2.5 clears 40px on a phone; sm: puts it back to the compact desktop size.
  return `text-xs font-medium py-2.5 px-3 sm:py-1.5 rounded-md transition-colors ${
    active
      ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]"
      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
  }`;
}
