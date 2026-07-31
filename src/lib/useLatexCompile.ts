"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps a compiled PDF in step with LaTeX source as it is typed.
 *
 * Two behaviours make this feel live rather than merely automatic:
 *
 * The previous PDF stays on screen while the next one builds. Blanking the
 * preview on every keystroke would make the document flicker for the ~2s a
 * compile takes, and you would spend the edit watching an empty page.
 *
 * A superseded compile is aborted, not awaited. Typing outruns the engine, and
 * without this the preview would work through a backlog of stale sources and
 * land several edits behind.
 */

const DEBOUNCE_MS = 700;

export type CompileState = {
  /** Object URL of the most recent PDF that built, or "" before the first. */
  pdfUrl: string;
  pages: number;
  compiling: boolean;
  /** Set when the current source doesn't build; the preview then shows stale. */
  error: string;
  log: string;
  /** True once a source has failed since the last success. */
  stale: boolean;
  /**
   * The SyncTeX map for the PDF currently on screen, uncompressed.
   *
   * Kept in step with pdfUrl rather than with `tex`: while a compile is in
   * flight the preview still shows the previous document, and locating a click
   * against a map for source that isn't rendered yet would send the editor to
   * the wrong line.
   */
  synctex: string;
};

export function useLatexCompile(tex: string, enabled: boolean): CompileState {
  const [pdfUrl, setPdfUrl] = useState("");
  const [pages, setPages] = useState(0);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [stale, setStale] = useState(false);
  const [synctex, setSynctex] = useState("");

  // Held in a ref so the effect that revokes it doesn't need pdfUrl as a
  // dependency — that would revoke the URL the <iframe> is currently showing.
  const urlRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !tex.trim()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCompiling(true);
      try {
        const res = await fetch("/api/compile-latex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tex }),
          signal: controller.signal,
        });

        if (cancelled) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "The document did not compile.");
          setLog(data.log ?? "");
          setStale(true);
          return;
        }

        const data = (await res.json()) as { pdf: string; pages: number; synctex: string };
        if (cancelled) return;

        // atob gives one character per byte; the map turns that back into the
        // bytes a Blob will accept.
        const binary = atob(data.pdf);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const next = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));

        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = next;
        setPdfUrl(next);
        setPages(data.pages ?? 0);
        setSynctex(data.synctex ?? "");
        setError("");
        setLog("");
        setStale(false);
      } catch (err) {
        // An abort is this hook superseding itself, not a failure worth showing.
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Could not reach the compiler.");
        setStale(true);
      } finally {
        if (!cancelled) setCompiling(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tex, enabled]);

  // Only on unmount: the last object URL would otherwise outlive the page.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  return { pdfUrl, pages, compiling, error, log, stale, synctex };
}
