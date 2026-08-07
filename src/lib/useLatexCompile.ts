"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps a compiled PDF alongside the LaTeX source, rebuilt on request.
 *
 * This used to rebuild on a 700ms typing pause, which read well in the editor
 * and was the single most expensive thing the app did. A ten-minute session
 * spent north of a hundred compiles to show maybe five documents anyone looked
 * at, and every one of them was a server round trip — which is affordable on a
 * developer's machine and is not affordable anywhere the app is actually
 * hosted. Compiling on demand turns that session into a handful of builds.
 *
 * What survives from the live version, because both were about the document
 * never appearing to break:
 *
 * The previous PDF stays on screen while the next one builds. Blanking the
 * preview would make the document flicker for the ~3s a compile takes, and you
 * would spend the wait watching an empty page.
 *
 * A superseded compile is aborted, not awaited. Pressing the button twice
 * should show the second document, not work through the first.
 *
 * A generated document builds automatically. Source arrives already generated,
 * so requiring a press to see anything at all would make the pane look broken
 * on arrival. Edits after that are `dirty` — source that differs from what is
 * on screen — and wait to be asked.
 *
 * "A generated document", not "the first one". This was a per-mount boolean,
 * and the pane is keyed on the application rather than on the document, so
 * generating a second document in the same application auto-built nothing: the
 * new source was stored, the previous PDF stayed on screen, and the only hint
 * was the rebuild button changing colour. Generate a CV and then a resume and
 * you were shown the CV; do it in the other order and you were shown the
 * resume. It read as the picker ignoring the choice, because what you always
 * got back was whichever document you had generated first.
 */

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
  /**
   * The source has been edited since the PDF on screen was built.
   *
   * What the button reads from: there is nothing to rebuild when this is false,
   * and the preview is quietly out of date whenever it is true.
   */
  dirty: boolean;
  /** Build the current source. Safe to call while a build is in flight. */
  compile: () => void;
};

/**
 * @param documentId Identifies the document `tex` belongs to, so a newly
 *   generated one can build itself while an edited one still waits to be asked.
 *   Editing never changes it; generating always does.
 */
export function useLatexCompile(
  tex: string,
  enabled: boolean,
  documentId: string
): CompileState {
  const [pdfUrl, setPdfUrl] = useState("");
  const [pages, setPages] = useState(0);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [stale, setStale] = useState(false);
  const [synctex, setSynctex] = useState("");
  /** The source behind the PDF on screen; null until one has been built. */
  const [builtTex, setBuiltTex] = useState<string | null>(null);

  // Held in a ref so the effect that revokes it doesn't need pdfUrl as a
  // dependency — that would revoke the URL the <iframe> is currently showing.
  const urlRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);

  // Read by compile() so the callback can stay stable across keystrokes. A
  // compile() that changed identity on every edit would retrigger any effect
  // depending on it, which is the auto-compile this hook exists to avoid.
  const texRef = useRef(tex);
  texRef.current = tex;

  const compile = useCallback(async () => {
    const source = texRef.current;
    if (!source.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCompiling(true);
    try {
      const res = await fetch("/api/compile-latex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tex: source }),
        signal: controller.signal,
      });

      if (controller.signal.aborted || unmountedRef.current) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "The document did not compile.");
        setLog(data.log ?? "");
        setStale(true);
        // Deliberately not recorded as built: the source that failed is still
        // what's in the editor, so the button stays live to try it again.
        return;
      }

      const data = (await res.json()) as { pdf: string; pages: number; synctex: string };
      if (controller.signal.aborted || unmountedRef.current) return;

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
      setBuiltTex(source);
      setError("");
      setLog("");
      setStale(false);
    } catch (err) {
      // An abort is a second press superseding the first, not a failure worth
      // showing.
      if (unmountedRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not reach the compiler.");
      setStale(true);
    } finally {
      if (!controller.signal.aborted && !unmountedRef.current) setCompiling(false);
    }
  }, []);

  // The one build nobody asks for, once per document.
  //
  // Records the id BEFORE compiling, and in a ref rather than in state, for the
  // same reason the boolean did: a build that fails must not leave the
  // condition true and retry forever. Null is not a document id, so the first
  // one always qualifies.
  const autoBuiltRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !tex.trim()) return;
    if (autoBuiltRef.current === documentId) return;
    autoBuiltRef.current = documentId;
    void compile();
  }, [enabled, tex, compile, documentId]);

  // Only on unmount: the last object URL would otherwise outlive the page.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return {
    pdfUrl,
    pages,
    compiling,
    error,
    log,
    stale,
    synctex,
    dirty: builtTex !== null && builtTex !== tex,
    compile,
  };
}
