"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteFile, loadFile, saveFile } from "@/lib/fileStore";
import { canonicalizeLinkedInUrl } from "@/lib/linkedinUrl";
import DocumentPreview from "./DocumentPreview";
import SourceLink from "./SourceLink";

type Tab = "paste" | "url" | "file";
type SourceType = "file" | "url" | "text";

type Props = {
  jobDescription: string;
  jobSource: string;
  jobSourceType: SourceType | "";
  fileKey: string;
  onParsed: (text: string, source: string, sourceType: SourceType) => void;
  onClear: () => void;
  /** Read off the posting as it loads. Empty until that has come back. */
  jobTitle: string;
  onJobTitleChange: (value: string) => void;
  /**
   * Replaces the extracted text with a hand-corrected version. Same
   * consequences as loading a different posting, because that is what it is.
   */
  onTextEdit: (text: string) => void;
};

/**
 * The role, centred between the status and the buttons, editable in place.
 *
 * It reads as a heading rather than as a field because for all but a handful of
 * postings it is simply correct and nobody will touch it. The affordance shows
 * on hover, and clicking the text itself also opens it — the whole line is a
 * button, so hitting a 14px pencil is never the only way in.
 */
function RoleHeading({ title, onChange }: { title: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim().slice(0, 120);
    if (next !== title) onChange(next);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        placeholder="Role"
        aria-label="Role"
        // Matches the heading it replaces, so opening the editor doesn't resize
        // the row. Already ≥16px, so iOS has no reason to zoom the page.
        className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-surface-raised)] px-2 py-1 text-lg font-semibold tracking-[-0.01em] outline-none sm:flex-[3] sm:text-center"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(title);
        setEditing(true);
      }}
      title={title || "Add the role"}
      className="group/role flex min-w-0 items-center justify-start gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--color-surface-overlay)] sm:flex-[3] sm:justify-center sm:text-center"
    >
      {title ? (
        /* Two lines, not one.
         *
         * The status beside it is always two lines — a heading over the host
         * and the character count — so the row is that tall regardless, and a
         * single-line role was ellipsising into space the strip had already
         * reserved. Real titles are long enough for it to matter: "Machine
         * Learning Scientist 5 — Sales, Ads DSE" is a middle column away from
         * fitting, and this column is half the row.
         *
         * Clamped rather than left free so the strip's height stays a property
         * of the status block. The button's `title` still carries the whole
         * string for the rare posting that needs a third line. */
        <span className="line-clamp-2 min-w-0 text-lg font-semibold leading-snug tracking-[-0.01em]">
          {title}
        </span>
      ) : (
        // Not silent: an empty role here is usually the extraction having found
        // nothing, and the fix is ten seconds of typing that nobody will do if
        // the space just looks like padding. Sized to the heading it stands in
        // for, so the row doesn't change height when one arrives.
        <span className="text-lg font-medium text-[var(--color-text-placeholder)]">
          Add the role
        </span>
      )}
      <svg
        aria-hidden
        className="h-3 w-3 shrink-0 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover/role:opacity-100 [@media(pointer:coarse)]:opacity-100"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

export default function JobDescriptionInput({
  jobDescription,
  jobSource,
  jobSourceType,
  fileKey: FILE_KEY,
  onParsed,
  onClear,
  jobTitle,
  onJobTitleChange,
  onTextEdit,
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
        {/* Three things across one row: what happened, which job it is, and the
            way out. The middle one is the only one anybody looks at twice —
            "Job description loaded" is the same on every application ever
            loaded — so it takes the centre and the type weight, while the
            status keeps its place as the thing that confirms the upload
            worked. Wraps to two rows below `sm`, where three across is three
            ellipses.

            Centred vertically from `sm`, not top-aligned: the role is now half
            again the height of the status beside it, and two blocks of
            different heights hung from a shared top edge read as one of them
            having slipped. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            {/* A caption, not a heading. It was `text-sm font-medium` — the
                same size and weight the role now abandons — so the two competed,
                and the boilerplate won on position alone by being first in the
                row. Demoting it is most of what makes the role read as the
                title of the card.

                Not `.eyebrow`, which is the obvious choice and the wrong one:
                its uppercasing and 0.07em tracking make this particular string
                wide enough to wrap in a column this narrow, and two lines of
                boilerplate is louder than the one line of 14px it replaced. */}
            <p className="text-xs font-medium text-[var(--color-text-muted)]">
              Job description loaded
            </p>
            {/* A posting URL is mostly tracking parameters, so only its host is
                shown; the char count stays intact beside it rather than
                splitting into "5,799 c / hars".

                Inline again, and side by side in the space this column now has
                — see the Replace button below for what was taking it. Stacking
                these was a fix for a wrap that only happened because the column
                was about five pixels short of holding both, and it cost a third
                line on every posting to spare the rare one that needed it.

                Separated by a gap rather than a "·", which is what made
                stacking look like the better option: the glyph belonged to the
                count, so a wrap stranded it at the head of the second line.
                Space says the same thing and has nothing to orphan, so the
                narrow case degrades to two tidy lines. */}
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--color-text-secondary)]">
              <SourceLink source={jobSource} className="min-w-0 truncate" />
              <span className="whitespace-nowrap text-[var(--color-text-muted)]">
                {jobDescription.length.toLocaleString()} chars
              </span>
            </p>
          </div>

          <RoleHeading title={jobTitle} onChange={onJobTitleChange} />

          {/* Sized to the button, not to a quarter of the row.
              `sm:flex-1` here was a counterweight — an empty column as wide as
              the status block, so the role landed on the exact centre of the
              card. It bought that centring with about 145px that the status
              had to give up, which is the whole reason the host and the count
              stopped fitting on one line. The role is still centred in the
              space between its neighbours, which is what reads as centred; a
              strip where the left block wraps to three lines does not. */}
          <div className="flex shrink-0 items-center">
            <button onClick={handleClear} className="btn-secondary text-xs py-1.5 px-3">
              Replace
            </button>
          </div>
        </div>

        {/* The text edits in place — see DocumentPreview.onTextChange. There is
            no Edit button here because clicking the text is the gesture. */}
        <DocumentPreview
          variant="posting"
          cleanedText={jobDescription}
          fileUrl={jobSourceType === "file" ? fileUrl ?? undefined : undefined}
          fileName={jobSourceType === "file" ? jobSource : undefined}
          isPdf={jobSourceType === "file" ? isPdf : false}
          externalUrl={jobSourceType === "url" ? jobSource : undefined}
          onTextChange={onTextEdit}
        />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "paste", label: "Paste Text" },
    { id: "url", label: "Link" },
    { id: "file", label: "File" },
  ];

  return (
    <div className="glass-panel p-5">
      {/* `.seg-track` / `.seg-item` — the shared segmented control. Written out
          here it was a flat 32px at every width, against 40/28px for the
          identical-looking strip in DocumentPreview: two controls that are
          meant to read as the same thing, at three different heights. */}
      <div className="seg-track mb-4 bg-[var(--color-surface)]">
        {/* The selected tab is the raised surface on a recessed track, not the
            overlay — the overlay is a hover and sits *below* the track, so
            using it here drew the chosen tab as the pressed one. */}
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(""); }}
            className={`seg-item ${tab === t.id ? "seg-item-active" : ""}`}
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
            // The UA draws the "Choose file" button itself and the only lever on
            // its height is this padding — at py-1 it came out around 24px, the
            // smallest target in the app.
            className="input-base file:mr-3 file:min-h-9 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--color-accent-muted)] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[var(--color-accent)]"
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
        {loading ? "Processing…" : "Load Job Description"}
      </button>
    </div>
  );
}
