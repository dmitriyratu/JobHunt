"use client";

import type { ReactNode } from "react";

/**
 * The assistant as a floating box, opened from the rail.
 *
 * Anchored to the bottom-right corner of the working area rather than docked
 * into the layout: the document is the thing you came here to read, and taking
 * a fixed column away from it permanently to hold a chat you use in bursts is
 * the wrong trade. This appears over the page and gives all the width back the
 * moment it closes.
 *
 * `--rail-w` is what keeps it off the applications rail, which is 68px or
 * 320px depending on whether that's collapsed (see globals.css). The bottom
 * offset clears the sticky step bar.
 */

type Props = {
  title: string;
  /** What this particular chat is for, so the two are told apart on sight. */
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
};

export default function ChatPanel({ title, subtitle, onClose, children }: Props) {
  return (
    <div
      // Full-width sheet on a phone, a panel on a desktop.
      className="fixed inset-x-3 bottom-20 z-40 sm:inset-x-auto sm:w-[380px]"
      style={{ right: "calc(var(--rail-w) + 1rem)" }}
    >
      <div className="glass-panel flex h-[min(560px,calc(100dvh-11rem))] flex-col overflow-hidden shadow-[var(--shadow-pop)]">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--color-border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="-mr-1 shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* min-h-0 so the transcript scrolls instead of pushing the composer
            off the bottom of the flex column. */}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/**
 * Fallback control for below `lg`, where the applications rail — and with it
 * the assistant's usual toggle — isn't rendered.
 */
export function ChatToggle({
  label,
  open,
  pendingCount = 0,
  onClick,
}: {
  label: string;
  open: boolean;
  pendingCount?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`btn-secondary flex shrink-0 items-center gap-2 px-3 py-2 text-sm ${
        open ? "border-[var(--color-accent)] text-[var(--color-accent)]" : ""
      }`}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 12h8m-8-4h5m-5 8h3m-6.5 5.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 4.5Z"
        />
      </svg>
      {label}
      {pendingCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-[11px] font-semibold text-[var(--color-on-accent)]">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
