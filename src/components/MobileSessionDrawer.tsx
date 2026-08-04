"use client";

import { useCallback, useEffect, useState } from "react";
import { useJobHuntState } from "@/lib/useAppState";
import SessionList from "./SessionList";

/**
 * Phone and tablet access to the applications list.
 *
 * SessionRail is `hidden xl:flex` because a permanent 320px column doesn't fit
 * on a narrow screen — which left small screens with no way to create or switch
 * applications at all. This is the same list as a slide-over, opened from the
 * header, and it hides itself at `xl` where the rail takes over.
 *
 * `xl` rather than `lg`: at 1024 the rail was taking a third of a landscape
 * tablet, so that device is served from here now too.
 */
export default function MobileSessionDrawer() {
  const { sessions, hydrated } = useJobHuntState();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling under the finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Applications"
        aria-expanded={open}
        // Keeps its label — it is how the list is reached at every width below
        // `xl`, which now includes a landscape tablet. Everything else about
        // the box comes from `.hdr-btn`, which is what the five controls beside
        // it use; on its own it was the shortest thing in the row at 33px and
        // the only one that never grew for a touch pointer.
        className="hdr-btn xl:hidden"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
        Apps
        {hydrated && sessions.length > 0 && (
          <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
            {sessions.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex justify-end bg-[var(--color-scrim)]"
          onClick={close}
        >
          <div
            // h-dvh, not h-screen: on iOS Safari `100vh` counts the collapsing
            // address bar, so a full-height sheet would overflow the visible area.
            className="flex h-dvh w-[88%] max-w-[360px] flex-col bg-[var(--color-surface-raised)] shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Applications"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[var(--color-border-subtle)]">
              <h2 className="font-medium text-sm">Applications</h2>
              <button onClick={close} className="btn-secondary text-xs py-1.5 px-3">
                Close
              </button>
            </div>
            <SessionList onNavigate={close} />
          </div>
        </div>
      )}
    </>
  );
}
