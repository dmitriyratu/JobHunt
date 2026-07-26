"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteFile, loadFile, saveFile } from "@/lib/fileStore";
import { canonicalizeLinkedInUrl } from "@/lib/linkedinUrl";
import DocumentPreview from "./DocumentPreview";

type Tab = "paste" | "url" | "file";
type SourceType = "file" | "url" | "text";

type Props = {
  jobDescription: string;
  jobSource: string;
  jobSourceType: SourceType | "";
  fileKey: string;
  onParsed: (text: string, source: string, sourceType: SourceType) => void;
  onClear: () => void;
};

export default function JobDescriptionInput({
  jobDescription,
  jobSource,
  jobSourceType,
  fileKey: FILE_KEY,
  onParsed,
  onClear,
}: Props) {
  const [tab, setTab] = useState<Tab>("url");
  const [pasteText, setPasteText] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Rehydrate the original-file preview from IndexedDB after a reload — the
  // extracted text survives in localStorage, but the File blob only lives here.
  useEffect(() => {
    if (jobSourceType !== "file" || !jobDescription || fileUrl) return;
    let cancelled = false;
    loadFile(FILE_KEY).then((file) => {
      if (cancelled || !file) return;
      setFileUrl(URL.createObjectURL(file));
      setIsPdf(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    });
    return () => {
      cancelled = true;
    };
  }, [jobSourceType, jobDescription, fileUrl, FILE_KEY]);

  const submit = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      if (tab === "file") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Select a file first");
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-job", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to parse file");
        setFileUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(file);
        });
        setIsPdf(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
        void saveFile(FILE_KEY, file);
        onParsed(data.text, data.source, "file");
        return;
      }

      const res = await fetch("/api/parse-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab === "url" ? "url" : "text",
          url: tab === "url" ? url : undefined,
          text: tab === "paste" ? pasteText : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to parse job description");
      onParsed(data.text, data.source, tab === "url" ? "url" : "text");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [tab, url, pasteText, onParsed, FILE_KEY]);

  const handleClear = useCallback(() => {
    setFileUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsPdf(false);
    void deleteFile(FILE_KEY);
    onClear();
  }, [onClear, FILE_KEY]);

  if (jobDescription) {
    return (
      <div className="glass-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">Job description loaded</p>
            {/* Only the URL may break mid-token; the char count stays intact
                instead of splitting into "5,799 c / hars". */}
            <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">
              <span className="break-all">{jobSource}</span>
              <span className="whitespace-nowrap">
                {" · "}
                {jobDescription.length.toLocaleString()} chars
              </span>
            </p>
          </div>
          <button onClick={handleClear} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
            Replace
          </button>
        </div>
        <DocumentPreview
          cleanedText={jobDescription}
          fileUrl={jobSourceType === "file" ? fileUrl ?? undefined : undefined}
          fileName={jobSourceType === "file" ? jobSource : undefined}
          isPdf={jobSourceType === "file" ? isPdf : false}
          externalUrl={jobSourceType === "url" ? jobSource : undefined}
        />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "paste", label: "Paste text" },
    { id: "url", label: "Link" },
    { id: "file", label: "File" },
  ];

  return (
    <div className="glass-panel p-5">
      <div className="flex gap-1 p-1 bg-[var(--color-surface)] rounded-lg mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(""); }}
            className={`flex-1 text-xs font-medium py-2 px-3 rounded-md transition-colors ${
              tab === t.id
                ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste the full job description here…"
          rows={8}
          className="input-base resize-none"
        />
      )}

      {tab === "url" && (
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(canonicalizeLinkedInUrl(e.target.value))}
          placeholder="https://company.com/jobs/senior-engineer"
          className="input-base"
        />
      )}

      {tab === "file" && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="input-base file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-[var(--color-accent-muted)] file:text-[var(--color-accent)]"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-2">PDF, DOCX, or plain text</p>
        </div>
      )}

      {error && <p className="text-[var(--color-danger)] text-xs mt-3">{error}</p>}

      <button
        onClick={submit}
        disabled={loading || (tab === "paste" && !pasteText.trim()) || (tab === "url" && !url.trim())}
        className="btn-primary w-full mt-4"
      >
        {loading ? "Processing…" : "Load job description"}
      </button>
    </div>
  );
}
