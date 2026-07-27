"use client";

import { useCallback, useEffect, useState } from "react";
import { useJobHuntState } from "@/lib/useAppState";
import SessionList from "./SessionList";

/**
 * Phone and tablet access to the applications list.
 *
 * SessionRail is `hidden lg:flex` because a permanent 320px column doesn't fit
 * on a narrow screen — which left small screens with no way to create or switch
 * applications at all. This is the same list as a slide-over, opened from the
 * header, and it hides itself at `lg` where the rail takes over.
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
        className="lg:hidden flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] transition-colors"
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
          className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={close}
        >
          <div
            // h-dvh, not h-screen: on iOS Safari `100vh` counts the collapsing
            // address bar, so a full-height sheet would overflow the visible area.
            className="flex h-dvh w-[88%] max-w-[360px] flex-col bg-[var(--color-surface-raised)] shadow-xl"
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
