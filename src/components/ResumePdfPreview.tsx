"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The compiled resume, rendered into the page itself.
 *
 * Drawn to canvases with pdf.js rather than handed to the browser's PDF
 * viewer in an <iframe>. The viewer is an application, not an embed: it brings
 * its own dark chrome around the page, its own scrollbars, and its own zoom
 * state, so the document ended up living inside a second scrolling window with
 * a black border around it. None of that is stylable from the host page.
 *
 * As canvases the pages are just elements — they flow with the document, size
 * to the column, and the page scrolls. There is no inner scroll to get lost in
 * and nothing to see but the resume.
 *
 * This is the file that gets sent, rendered by the same engine that would open
 * it, so it keeps the property that made LaTeX worth doing: the preview is the
 * artefact, not an approximation of it.
 */

type Props = {
  /** Object URL of the last PDF that built. Empty before the first compile. */
  pdfUrl: string;
  compiling: boolean;
  /** True when the source on screen failed, so this PDF is one edit behind. */
  stale: boolean;
  /**
   * Cap the height and scroll internally. Used beside the editor in split view,
   * where the two columns have to agree on a height; off elsewhere, so the
   * document sets its own and the page scrolls.
   */
  boxed?: boolean;
  /**
   * Called with a click's position on the page, in PDF points from the top-left
   * — the coordinate system SyncTeX records in, so the caller can look it up
   * without knowing anything about how this component scaled the canvas.
   */
  onLocate?: (page: number, xPt: number, yPt: number) => void;
};

/**
 * Renders at the display's true pixel density, so text is sharp rather than a
 * bitmap scaled up. Capped: a 3x device on a wide column is a lot of canvas for
 * no visible gain.
 */
const MAX_SCALE = 2;

/** A variable, so webpack can't statically resolve it. See the import below. */
const PDFJS_URL = "/pdf.min.mjs";

export default function ResumePdfPreview({
  pdfUrl,
  compiling,
  stale,
  boxed = false,
  onLocate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState("");

  // Read at click time rather than captured in the render effect, so changing
  // the handler never forces the document to re-render.
  const onLocateRef = useRef(onLocate);
  onLocateRef.current = onLocate;

  /**
   * A click on a page, in PDF points.
   *
   * The canvas carries its own unscaled page size, so the conversion is a ratio
   * against the element's rendered box. Going through getBoundingClientRect
   * rather than the render scale means zoom, device pixel ratio and the
   * responsive width all cancel out on their own.
   */
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const locate = onLocateRef.current;
    if (!locate) return;

    const canvas = (e.target as HTMLElement).closest("canvas");
    if (!canvas) return;

    const page = Number(canvas.dataset.page);
    const wPt = Number(canvas.dataset.wpt);
    const hPt = Number(canvas.dataset.hpt);
    if (!page || !wPt || !hPt) return;

    const rect = canvas.getBoundingClientRect();
    locate(
      page,
      ((e.clientX - rect.left) / rect.width) * wPt,
      ((e.clientY - rect.top) / rect.height) * hPt
    );
  }, []);

  // The column's width decides the render scale, so it has to be measured
  // rather than assumed — and re-measured when the chat panel opens or the
  // window changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    /**
     * Only a change worth re-rendering for.
     *
     * Rendering is what makes the container tall, which brings up the page's
     * scrollbar, which takes ~15px off this element's width — which, taken as a
     * new width, cancelled the render that caused it and started another. The
     * preview never finished a single pass. Anything under a threshold is
     * treated as the same width, which breaks the cycle; a real layout change
     * (opening the chat) is far larger.
     */
    const settle = (next: number) =>
      setWidth((prev) => (Math.abs(next - prev) < 24 ? prev : next));

    const observer = new ResizeObserver(([entry]) => settle(Math.round(entry.contentRect.width)));
    observer.observe(el);
    settle(Math.round(el.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfUrl || width === 0) return;

    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];

    void (async () => {
      try {
        // Loaded as a plain browser module from /public, deliberately hidden
        // from the bundler.
        //
        // Bundling it does not work: webpack's ESM interop throws
        // "Object.defineProperty called on non-object" while initialising
        // pdf.js, inside __webpack_require__.r and before any of this code
        // runs — so there is nothing to work around from here. Both the modern
        // and the legacy builds fail identically. webpackIgnore leaves the
        // import alone and the browser resolves it natively, which is also why
        // the specifier is a variable rather than a literal.
        //
        // Both files are copied into /public by the postinstall step in
        // package.json; pdf.js rejects a worker whose version doesn't match the
        // main build, so they have to move together.
        const pdfjs = (await import(/* webpackIgnore: true */ PDFJS_URL)) as typeof import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise;
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
        const host = containerRef.current;
        if (!host) return;

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;

          const unscaled = page.getViewport({ scale: 1 });
          // Fit the column exactly; the canvas' backing store is then that
          // size times the device ratio.
          const scale = width / unscaled.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className =
            "block rounded-sm border border-[var(--color-border-subtle)] bg-white shadow-sm";
          // The page's own size, so a click can be converted back to PDF points
          // without the handler knowing the render scale.
          canvas.dataset.page = String(n);
          canvas.dataset.wpt = String(unscaled.width);
          canvas.dataset.hpt = String(unscaled.height);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          // Attached before rendering, not after: pdf.js v5's render promise
          // never settles for a canvas that isn't in the document, so
          // collecting them up and swapping them in at the end hung forever on
          // the first page. Rendering into the live DOM also means each page
          // appears as it finishes rather than all at once.
          if (n === 1) host.replaceChildren(canvas);
          else host.append(canvas);
          canvases.push(canvas);

          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
        }

        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render the PDF.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, width]);

  return (
    <div
      className={`relative rounded-lg ${
        boxed
          ? "h-full overflow-auto border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-2"
          : ""
      }`}
    >
      <div
        ref={containerRef}
        aria-label="Resume preview"
        onClick={handleClick}
        className={`flex flex-col gap-3 transition-opacity duration-200 ${
          stale ? "opacity-40" : "opacity-100"
        } ${onLocate ? "[&_canvas]:cursor-text" : ""}`}
      />

      {!pdfUrl && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            {compiling ? "Typesetting…" : "Nothing to preview yet."}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
      )}

      {compiling && pdfUrl && (
        <div className="pointer-events-none sticky bottom-3 mt-3 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-[var(--color-surface-raised)]/95 px-3 py-1.5 shadow-md">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            <span className="text-[11px] text-[var(--color-text-secondary)]">Typesetting…</span>
          </span>
        </div>
      )}

      {stale && !compiling && (
        <div className="pointer-events-none sticky bottom-3 mt-3 flex justify-center">
          <span className="rounded-full bg-[var(--color-surface-raised)]/95 px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] shadow-md">
            Showing the last version that compiled
          </span>
        </div>
      )}
    </div>
  );
}
