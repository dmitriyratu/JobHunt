"use client";

import { useState } from "react";

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
  const showClean = tab === "clean" || !hasOriginal;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-[var(--color-text-secondary)]">Preview</p>
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
      </div>

      {showClean ? (
        <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border-subtle)]">
          {cleanedText.slice(0, 2000)}
          {cleanedText.length > 2000 && "…"}
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
        <div className="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden" style={{ height: 320 }}>
          <embed src={fileUrl} type="application/pdf" width="100%" height="100%" />
        </div>
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
