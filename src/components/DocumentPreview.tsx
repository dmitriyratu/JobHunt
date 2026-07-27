"use client";

import { useEffect, useState } from "react";

type Props = {
  cleanedText: string;
  fileUrl?: string;
  fileName?: string;
  isPdf?: boolean;
  externalUrl?: string;
};

export default function DocumentPreview({
  cleanedText,
  fileUrl,
  fileName,
  isPdf,
  externalUrl,
}: Props) {
  const hasOriginal = Boolean(fileUrl || externalUrl);
  const [tab, setTab] = useState<"clean" | "original">("clean");
  const [expanded, setExpanded] = useState(false);
  const showClean = tab === "clean" || !hasOriginal;

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

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
              className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
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
          {cleanedText}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6"
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
              {cleanedText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function tabClass(active: boolean) {
  return `text-xs font-medium py-1.5 px-3 rounded-md transition-colors ${
    active
      ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]"
      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
  }`;
}
