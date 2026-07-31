"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * A plain-text LaTeX editor with syntax colouring.
 *
 * The colouring is a <pre> sitting exactly behind a transparent <textarea>,
 * rather than a code-editor dependency. The textarea keeps every native
 * behaviour a real editor has to re-implement — undo history, spellcheck, IME
 * composition, screen-reader support, find-in-page — and the overlay only has
 * to agree with it on font metrics and wrapping.
 *
 * Because the two are separate elements, anything that changes layout in one
 * must change it identically in the other. That is what SHARED below is for;
 * padding, font, size, line-height and wrapping all live there and are applied
 * to both.
 */

// pre-wrap on both, so a long \item wraps identically in each layer. Line
// numbers are deliberately absent: with wrapping, one source line can occupy
// several visual rows and a gutter would drift out of step with the text.
//
// scrollbar-gutter is the load-bearing one, and it is not cosmetic. The
// textarea scrolls and the <pre> does not, so once the document was long enough
// to overflow, the textarea reserved 16px for its scrollbar and the <pre> did
// not: measured 503px of text width against 519px. Wrapping is width-dependent,
// so the two layers then broke their lines in different places and the
// highlighted text slid out from under what you were typing — further out of
// step with every wrapped line down the page. Reserving the gutter on BOTH
// keeps one width, whether or not a scrollbar is actually showing.
//
// (Safari only learned scrollbar-gutter in 18.2. Below that both layers ignore
// it and the drift returns; the fallback is to give both `overflow-y: scroll`
// so each reserves a real scrollbar.)
const SHARED =
  "m-0 whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-[1.6] [scrollbar-gutter:stable]";

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Rendered over the editor when the document can't be edited yet. */
  disabled?: boolean;
  /**
   * A 1-based line to scroll to, select and mark, or null for none.
   *
   * `nonce` exists because clicking the same line in the preview twice should
   * scroll back to it both times; without it the second click changes no prop
   * and nothing happens.
   */
  reveal?: { line: number; nonce: number } | null;
};

// --- Highlighting -----------------------------------------------------------

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESCAPE[c]);
}

/**
 * Comments, control sequences and grouping — the three things worth telling
 * apart while editing a resume. Deliberately not a LaTeX parser: it colours
 * tokens, and a token it gets wrong costs nothing but a shade.
 *
 * One regex with alternation rather than successive passes, so a % inside what
 * has already been matched as a command can't be re-read as a comment.
 */
const TOKENS = /(%[^\n]*)|(\\(?:[a-zA-Z@]+\*?|.))|([{}[\]])|(\$[^$\n]*\$)/g;

/**
 * The character range of a 1-based line, or null if it is out of bounds.
 */
function lineRange(source: string, line: number): { start: number; end: number } | null {
  if (line < 1) return null;
  let start = 0;
  for (let i = 1; i < line; i++) {
    const at = source.indexOf("\n", start);
    if (at === -1) return null;
    start = at + 1;
  }
  const nl = source.indexOf("\n", start);
  return { start, end: nl === -1 ? source.length : nl };
}

function colour(source: string): string {
  let out = "";
  let last = 0;

  for (const m of source.matchAll(TOKENS)) {
    const start = m.index ?? 0;
    out += escapeHtml(source.slice(last, start));
    const text = escapeHtml(m[0]);

    if (m[1]) out += `<span class="text-[var(--color-text-muted)] italic">${text}</span>`;
    else if (m[2]) out += `<span class="text-[var(--color-accent)]">${text}</span>`;
    else if (m[3]) out += `<span class="text-[var(--color-text-muted)]">${text}</span>`;
    else out += `<span class="text-[var(--color-success)]">${text}</span>`;

    last = start + m[0].length;
  }

  return out + escapeHtml(source.slice(last));
}

/**
 * The coloured source, with the revealed line wrapped in a measurable span.
 *
 * The three pieces are coloured separately, which is safe only because no
 * token in TOKENS can span a newline — a comment stops at one, a control
 * sequence cannot contain one, and inline maths excludes it. Splitting on a
 * line boundary therefore cannot cut a token in half.
 *
 * The span is what makes scrolling work at all. With soft wrap a source line
 * occupies any number of visual rows, so `line × lineHeight` is wrong the
 * moment anything wraps — and in this editor nearly everything wraps. The
 * overlay already agrees with the textarea on every metric that affects layout,
 * so the span's offsetTop *is* the textarea's scroll position for that line.
 */
function highlight(source: string, mark: { start: number; end: number } | null): string {
  const body = mark
    ? colour(source.slice(0, mark.start)) +
      `<span data-reveal class="rounded-[2px] bg-[var(--color-accent)]/20">` +
      colour(source.slice(mark.start, mark.end)) +
      `</span>` +
      colour(source.slice(mark.end))
    : colour(source);

  // A trailing newline collapses in a <pre>, leaving the overlay one row short
  // of the textarea whenever the caret sits on a final blank line.
  return `${body}\n`;
}

// --- Component --------------------------------------------------------------

export default function LatexEditor({
  value,
  onChange,
  disabled = false,
  reveal = null,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const mark = useMemo(
    () => (reveal ? lineRange(value, reveal.line) : null),
    // Recomputed on nonce as well: re-clicking the same line has to re-run the
    // scroll below, and without this the memo would hold the previous range.
    [value, reveal?.line, reveal?.nonce] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  }, []);

  // Programmatic value changes (accepting a chat proposal) move the textarea's
  // scroll without firing onScroll, which would leave the layers offset.
  useEffect(syncScroll, [value, syncScroll]);

  /**
   * Bring a revealed line into view and put the caret on it.
   *
   * The scroll target is read off the overlay rather than calculated, for the
   * reason given above highlight(). The line is centred rather than scrolled
   * minimally to the top, because a line flush against the top edge of a code
   * pane reads as "the document starts here" instead of "this is your line".
   *
   * Selecting the text is what makes it an editing position and not just a
   * scroll — you can start typing over it. focus() comes last so the browser
   * doesn't scroll the selection into view on its own terms first.
   */
  useEffect(() => {
    if (!mark || !reveal) return;
    const ta = textareaRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;

    const span = pre.querySelector<HTMLElement>("[data-reveal]");
    if (span) {
      const target = span.offsetTop - ta.clientHeight / 2 + span.offsetHeight / 2;
      ta.scrollTop = Math.max(0, target);
      pre.scrollTop = ta.scrollTop;
    }

    ta.setSelectionRange(mark.start, mark.end);
    ta.focus({ preventScroll: true });
  }, [mark, reveal]);

  /**
   * Tab indents instead of leaving the editor.
   *
   * Trapping Tab is normally a keyboard-accessibility failure, so Escape-then-
   * Tab still moves focus out: the textarea is reachable and escapable without
   * a mouse.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = ta;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      // After React re-renders with the new value the caret would jump to the
      // end; put it back where the typing was.
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    },
    [value, onChange]
  );

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`${SHARED} pointer-events-none absolute inset-0 overflow-hidden text-[var(--color-text-primary)]`}
        dangerouslySetInnerHTML={{ __html: highlight(value, mark) }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-label="LaTeX source"
        className={`${SHARED} relative h-full w-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-[var(--color-accent)] outline-none selection:bg-[var(--color-accent)]/25`}
      />
    </div>
  );
}
