"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  resumeText: string;
  resumeFilename: string;
  onParsed: (text: string, filename: string) => void;
  onClear: () => void;
};

export default function ResumeUpload({
  resumeText,
  resumeFilename,
  onParsed,
  onClear,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      setError("");
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/parse-resume", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");

        onParsed(data.text, data.filename);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [onParsed]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  if (resumeText) {
    return (
      <div className="glass-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-success-muted)]">
              <svg className="h-5 w-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{resumeFilename}</p>
              <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">
                {resumeText.length.toLocaleString()} characters extracted
              </p>
            </div>
          </div>
          <button onClick={onClear} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
            Replace
          </button>
        </div>
        <div className="mt-4">
          <p className="text-xs text-[var(--color-text-secondary)] mb-2">Preview</p>
          <pre className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-40 overflow-y-auto bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border-subtle)]">
            {resumeText.slice(0, 2000)}
            {resumeText.length > 2000 && "…"}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-5">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload resume file"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
            : "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md,.rtf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
          }}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <p className="text-sm text-[var(--color-text-secondary)]">Reading resume…</p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-overlay)]">
              <svg className="h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm font-medium">Drop your resume here or click to browse</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">PDF, DOCX, TXT supported</p>
          </>
        )}
      </div>
      {error && <p className="text-[var(--color-danger)] text-xs mt-3">{error}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-6 w-6 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
