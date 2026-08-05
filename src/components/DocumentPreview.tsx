"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { wordRegExp } from "@/lib/proofread";
import { logicalBlocks } from "@/lib/sourceLines";
import { useScrollLock } from "@/lib/useScrollLock";

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
  /**
   * How tall the cleaned text is allowed to get.
   *
   * "full" is the honest default for a document you are looking at: the box
   * renders at its natural height and the page or dialog around it does the
   * scrolling, so there is one scrollbar instead of a short pane nested inside
   * a long one. It also makes the expand control pointless, so it goes.
   *
   * "compact" earns its place in exactly one situation: a proofread finding is
   * outstanding, and clicking one has to bring the word into view *without*
   * taking the list of findings off screen. A short pane that scrolls its own
   * contents keeps both visible; a full-height one would scroll the dialog to
   * the word and leave the accept/reject buttons somewhere above it.
   */
  height?: "compact" | "full";
  /**
   * How to typeset the cleaned text.
   *
   * "raw" is the fallback: a monospace block showing the extracted text exactly
   * as it came out of the parser, every line break and run of spaces intact.
   *
   * The other two typeset the document instead, because monospace makes any
   * long document an undifferentiated wall — the heading you scan for is the
   * same size and weight as everything around it. They differ in how the text
   * is split, and that difference matters: a posting's newlines are the
   * author's, so "posting" trusts them, while a resume's newlines are wherever
   * the *page* broke, so "resume" rejoins the wraps first (see `resumeLines`).
   * Using the wrong one puts a paragraph break inside every wrapped sentence.
   */
  variant?: "raw" | "posting" | "resume";
  /**
   * Makes the cleaned text editable in place: click it to get a caret, click
   * away to keep what you typed.
   *
   * Passed only where the extracted text is the thing being corrected — the
   * posting. A resume's extracted text is not editable here on purpose: it is a
   * copy of an uploaded file, and the place to fix it is the file.
   *
   * Absent leaves the pane exactly as it was, so nothing that renders a document
   * read-only pays for this in behaviour or in chrome.
   */
  onTextChange?: (text: string) => void;
};

export default function DocumentPreview({
  cleanedText,
  fileUrl,
  fileName,
  isPdf,
  externalUrl,
  highlight,
  height = "full",
  variant = "raw",
  onTextChange,
}: Props) {
  const compact = height === "compact";
  const hasOriginal = Boolean(fileUrl || externalUrl);
  const [tab, setTab] = useState<"clean" | "original">("clean");
  const [expanded, setExpanded] = useState(false);
  const showClean = tab === "clean" || !hasOriginal;
  const markRef = useRef<HTMLElement>(null);

  /**
   * In-place editing of the cleaned text.
   *
   * There is no Edit button and no Save button, because both were asking the
   * reader to declare an intention they had already acted on: you notice the
   * scraper ate a paragraph while looking at the paragraph, and the gesture that
   * follows is to click it. So the pane takes a caret on click and keeps what
   * you typed when you click away — the same contract as a spreadsheet cell,
   * and the reason neither of those has a Save button either.
   *
   * Clicking must not look like anything happened. The textarea therefore keeps
   * the pane's box — same border, same fill, same padding — and the pane's
   * typography rather than a form control's: same size, same leading, same
   * colour, and emphatically not monospace. What changes is that the typeset
   * document becomes its own source lines, which is unavoidable, and a caret
   * appears, which is the point.
   *
   * It also grows with its content instead of scrolling inside a fixed frame,
   * because the pane it replaces has no inner scroller either at full height —
   * a box that suddenly scrolls separately from the page is the other half of
   * feeling like a different component.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const editable = Boolean(onTextChange);
  const editing = draft !== null;

  /**
   * Sizes the box to the text in it.
   *
   * Called from the textarea's ref callback as well as on every keystroke, which
   * is what makes the swap flash-free: refs run during commit, before the
   * browser paints, so the box is never briefly two rows tall.
   */
  const fitToContent = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (editing) areaRef.current?.focus();
  }, [editing]);

  const beginEdit = () => {
    if (!editable || editing) return;
    setDraft(cleanedText);
  };

  /**
   * Commits on the way out, and only when something actually changed.
   *
   * The equality check is what makes click-away safe to be the save gesture:
   * committing an unchanged document would still count as replacing the posting
   * downstream, so idly clicking into the text and back out would silently throw
   * away a match report.
   */
  const endEdit = () => {
    const next = draft;
    setDraft(null);
    if (next !== null && next.trim() && next !== cleanedText) onTextChange?.(next);
  };

  // The expanded reader is a dialog like any other — see useScrollLock.
  useScrollLock(expanded);

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

  const typeset = variant !== "raw";
  const cleanBody = typeset ? (
    <Prose
      lines={variant === "resume" ? resumeLines(cleanedText) : postingLines(cleanedText)}
      dense={variant === "resume"}
      highlight={highlight}
      firstRef={markRef}
    />
  ) : highlight ? (
    marked(cleanedText, highlight, { ref: markRef, used: false })
  ) : (
    cleanedText
  );

  return (
    <div className="mt-4">
      {/* Wraps rather than overflowing: the label, a two-tab strip and the
          expand control have a hard minimum around 276px, which is more than a
          320px phone has inside the card. `min-w-0` on the label is what lets
          it give way first. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-[var(--color-text-secondary)]">Preview</p>
        <div className="flex items-center gap-2">
          {hasOriginal && (
            <div className="seg-track bg-[var(--color-surface)]">
              <button type="button" onClick={() => setTab("clean")} className={tabClass(tab === "clean")}>
                Cleaned Text
              </button>
              <button type="button" onClick={() => setTab("original")} className={tabClass(tab === "original")}>
                Original
              </button>
            </div>
          )}
          {/* Only when the text is clipped. At full height the whole document
              is already on the page, and a control that opens a dialog to show
              you what you are looking at is furniture. */}
          {showClean && compact && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand full text"
              title="Expand full text"
              // `tap` rather than `sm:h-7 sm:w-7`: the old rule shrank it to
              // 28px from 640px up, which is every tablet.
              className="tap flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6l-7 7M9 21H3m0 0v-6m0 6l7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showClean ? (
        typeset ? (
          // The box is the same element whether or not it is being edited, so
          // there is nothing for it to change into: the border, the fill and the
          // padding are written once and the caret arrives inside them.
          <div
            onClick={beginEdit}
            className={`rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-3.5 ${
              compact ? "max-h-40 overflow-y-auto" : ""
            } ${editable && !editing ? "cursor-text hover:border-[var(--color-border)]" : ""}`}
          >
            {editing ? (
              <Editor
                draft={draft ?? ""}
                onDraft={setDraft}
                onEnd={endEdit}
                onAbandon={() => setDraft(null)}
                areaRef={areaRef}
                fit={fitToContent}
                // The prose measure, matched exactly: the text keeps its column
                // and its line breaks, so clicking in doesn't reflow the
                // paragraph you were reading.
                className="max-w-[68ch] text-[13px] leading-relaxed text-[var(--color-text-secondary)]"
              />
            ) : (
              cleanBody
            )}
          </div>
        ) : (
          // break-words alongside pre-wrap: pre-wrap only breaks at spaces, and a
          // parsed resume routinely carries a URL or a long path with none in it.
          // Without this the card grew a horizontal scrollbar on a phone.
          <pre
            onClick={beginEdit}
            className={`whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text-secondary)] ${
              compact ? "max-h-40 overflow-y-auto" : ""
            } ${editable && !editing ? "cursor-text hover:border-[var(--color-border)]" : ""}`}
          >
            {editing ? (
              <Editor
                draft={draft ?? ""}
                onDraft={setDraft}
                onEnd={endEdit}
                onAbandon={() => setDraft(null)}
                areaRef={areaRef}
                fit={fitToContent}
                // Monospace here, matching the raw view — this branch exists to
                // show the extraction exactly as it came out.
                className="font-mono text-xs"
              />
            ) : (
              cleanBody
            )}
          </pre>
        )
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
            Open Original Posting ↗
          </a>
        </div>
      ) : isPdf && fileUrl ? (
        <>
          {/* iOS Safari won't render an inline PDF through <embed> — it leaves a
              blank grey box — so small screens get a link out instead. */}
          {/* Height in dvh rather than a flat 320px: a landscape phone — which
              is wide enough for `sm:` to fire — is only 390px tall, so a fixed
              320 was most of the screen for a preview you scroll past.
              Bounded even at full height, unlike the cleaned text: this is the
              browser's own PDF viewer, it scrolls itself whatever we do, and
              the number of pages isn't ours to know. Given more room instead,
              so what it scrolls is a page rather than a slot. */}
          <div
            className={`hidden overflow-hidden rounded-lg border border-[var(--color-border-subtle)] sm:block ${
              compact ? "h-[clamp(12rem,45dvh,20rem)]" : "h-[clamp(20rem,70dvh,44rem)]"
            }`}
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
          // overscroll-contain for the same reason .modal-overlay carries it:
          // without it, running out of document here scrolls the page behind.
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-[var(--color-scrim)] p-3 sm:p-6"
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
            {typeset ? (
              <div className="flex-1 overflow-y-auto px-5 py-4">{cleanBody}</div>
            ) : (
              <pre className="flex-1 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words p-5 text-xs text-[var(--color-text-secondary)]">
                {cleanBody}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The caret, wearing the pane's clothes.
 *
 * Everything that would mark this out as a form control is stripped — border,
 * fill, padding, resize grip, its own scrollbar — because the box around it is
 * the pane's own box and is still on screen. What the caller passes in is the
 * typography of the text being replaced, so the only thing that changes on
 * click is that the typeset document becomes its own source lines.
 */
function Editor({
  draft,
  onDraft,
  onEnd,
  onAbandon,
  areaRef,
  fit,
  className,
}: {
  draft: string;
  onDraft: (v: string) => void;
  onEnd: () => void;
  onAbandon: () => void;
  areaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  fit: (el: HTMLTextAreaElement | null) => void;
  className: string;
}) {
  return (
    <textarea
      ref={(el) => {
        areaRef.current = el;
        fit(el);
      }}
      value={draft}
      onChange={(e) => {
        onDraft(e.target.value);
        fit(e.target);
      }}
      onBlur={onEnd}
      onKeyDown={(e) => {
        // Escape abandons. Enter stays a newline — this is a document, not a
        // field, and Enter is the one key that has to keep meaning what it means
        // in a document.
        if (e.key === "Escape") {
          e.preventDefault();
          onAbandon();
        }
      }}
      aria-label="Document text"
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[var(--color-text-secondary)] outline-none ${className}`}
    />
  );
}

/** One line of a document, classified by the role it plays on the page. */
type Line =
  | { kind: "title" | "heading" | "date" | "para"; text: string }
  | { kind: "bullet"; items: string[] };

/**
 * Bullet markers a posting arrives with.
 *
 * "•" is ours — the scraper writes it for every `<li>` (see `blockText`) — but
 * pasted text comes as whatever the person's clipboard held, and a posting
 * written in Markdown uses "-" or "*". Numbered items keep their number.
 */
const BULLET = /^\s*(?:[•·▪◦‣*]|[-–—](?=\s)|\d{1,2}[.)](?=\s))\s*/;

/**
 * True when a line of a posting is doing the job of a heading.
 *
 * There is no markup left to ask — the scrape is plain text by the time it gets
 * here — so this reads the same signals a person does: a trailing colon, or a
 * short unpunctuated phrase sitting on its own line. The "no ': ' inside" test
 * is what keeps label lines ("Location: San Francisco") out; they are short and
 * unpunctuated too, but they are content, not structure.
 */
function isPostingHeading(text: string): boolean {
  if (text.endsWith(":")) return true;
  if (text.length > 70) return false;
  if (/:\s/.test(text)) return false;
  if (/[.,;]$/.test(text)) return false;
  const words = text.split(/\s+/).length;
  return words >= 2 && words <= 10;
}

/**
 * A scraped posting split into lines.
 *
 * One line of the scrape is one line here: `blockText` has already put the
 * document's paragraph breaks back, so the newlines can be trusted as the
 * author's own.
 */
function postingLines(text: string): Line[] {
  const out: Line[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "").trim();
      if (!item) continue;
      const prev = out[out.length - 1];
      // Consecutive markers are one list, so the gap between items stays
      // tighter than the gap between a list and the paragraph after it.
      if (prev?.kind === "bullet") prev.items.push(item);
      else out.push({ kind: "bullet", items: [item] });
      continue;
    }

    out.push({ kind: isPostingHeading(line) ? "heading" : "para", text: line });
  }
  return withTitle(out);
}

/**
 * An uploaded resume split into lines.
 *
 * `logicalBlocks` rather than a split on "\n", because a resume's newlines are
 * *not* the author's: PDF and DOCX extraction break wherever the page broke, so
 * one bullet arrives as three or four physical lines and splitting on them puts
 * a gap inside every sentence that happened to wrap. Rejoining those is the
 * whole job, and it is done there rather than here because the same split
 * decides what a citation addresses — the layout you are looking at is the
 * document exactly as the grounding pass reads it, by construction rather than
 * by two sets of rules agreeing.
 *
 * So there is nothing left to do here but group runs of bullets into a list.
 */
function resumeLines(text: string): Line[] {
  const out: Line[] = [];
  for (const block of logicalBlocks(text)) {
    if (block.kind === "bullet") {
      const prev = out[out.length - 1];
      if (prev?.kind === "bullet") prev.items.push(block.text);
      else out.push({ kind: "bullet", items: [block.text] });
      continue;
    }
    out.push({ kind: block.kind, text: block.text });
  }
  return withTitle(out);
}

/**
 * Promotes the opening line to the document's title.
 *
 * Every resume opens with a name and every posting with a role, and neither
 * should look like one more section heading — a page whose first two headings
 * are typeset identically makes the reader work out which one names the thing.
 */
function withTitle(lines: Line[]): Line[] {
  const first = lines[0];
  if (!first || first.kind === "bullet") return lines;
  return [{ kind: "title", text: first.text }, ...lines.slice(1)];
}

/**
 * A document typeset as the document it was, rather than as a block of code.
 *
 * `dense` is the difference between the two callers. A posting is prose and
 * wants air between paragraphs; a resume is a dozen short lines per section —
 * titles, employers, dates — and the same spacing turns it into a list of
 * orphans, so its blocks sit closer together and its sections are separated by
 * a rule instead of by a gap.
 */
function Prose({
  lines,
  dense,
  highlight,
  firstRef,
}: {
  lines: Line[];
  dense?: boolean;
  highlight?: string;
  firstRef: React.Ref<HTMLElement>;
}) {
  // Shared across every line so the scroll target is the first match in the
  // document, not the first match in each block.
  const target = { ref: firstRef, used: false };
  const render = (s: string) => (highlight ? marked(s, highlight, target) : s);

  return (
    // 68ch is the reading measure — prose past about 75 characters a line loses
    // the eye on the return sweep.
    //
    // Left-aligned, not centred. Centring was meant to make the cap read as a
    // decision rather than as text failing to fill its panel, and it doesn't:
    // against a panel whose every other element starts at the left edge, a
    // column floating in the middle reads as broken alignment, not as a measure.
    // The slack goes on the right, where the eye never goes.
    <div className="max-w-[68ch] text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
      {lines.map((line, i) => {
        if (line.kind === "bullet") {
          return (
            <ul key={i} className={`pl-1 ${dense ? "my-1 space-y-0.5" : "my-2 space-y-1"}`}>
              {line.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span aria-hidden className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-muted)]" />
                  <span className="min-w-0 break-words">{render(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (line.kind === "title") {
          return (
            <h3 key={i} className="mb-2 break-words text-sm font-semibold text-[var(--color-text-primary)]">
              {render(line.text)}
            </h3>
          );
        }

        if (line.kind === "heading") {
          return (
            <h4
              key={i}
              className={`mt-4 break-words text-xs font-semibold uppercase tracking-wide text-[var(--color-text-primary)] first:mt-0 ${
                dense ? "mb-1.5 border-b border-[var(--color-border-subtle)] pb-1" : "mb-1.5"
              }`}
            >
              {render(line.text)}
            </h4>
          );
        }

        // A bare date belongs to the line above it — an employer, a degree — so
        // it is pulled up tight against it and set back, rather than floating
        // between two entries where it reads as belonging to neither.
        if (line.kind === "date") {
          return (
            <p key={i} className="mb-1 break-words text-xs text-[var(--color-text-muted)]">
              {render(line.text)}
            </p>
          );
        }

        return (
          <p key={i} className={`break-words first:mt-0 ${dense ? "my-1" : "my-2"}`}>
            {render(line.text)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * The text with every occurrence of a word wrapped for the eye.
 *
 * Every occurrence, not just the first, because accepting a fix changes all of
 * them — showing one would misrepresent what the button does. The ref goes on
 * the first so there is something to scroll to; `target` is shared across calls
 * because prose renders line by line and only one of those lines holds it.
 */
function marked(text: string, word: string, target: { ref: React.Ref<HTMLElement>; used: boolean }): ReactNode {
  const pattern = wordRegExp(word, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const first = !target.used;
    if (first) target.used = true;
    out.push(
      <mark
        key={index}
        ref={first ? target.ref : undefined}
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
  // `.seg-item` — the shared segmented control (globals.css), so this reads the
  // same as the source/link/file strip on the job card and the editor/PDF strip
  // on the resume step. Written out here it was 40px on a phone and 28px from
  // `sm:` up, which is to say it got smaller on a tablet, where the pointer is
  // still a finger. The shared class asks about the pointer instead.
  //
  // Selected is the raised surface on a recessed track. The overlay is a hover
  // and sits below the track, so reaching for it here drew the chosen tab as
  // the pressed one — backwards from what the control is saying.
  return `seg-item ${active ? "seg-item-active" : ""}`;
}
