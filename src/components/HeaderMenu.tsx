"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasUnreadRelease, latestRelease } from "@/lib/releases";

/**
 * The header's overflow menu.
 *
 * Five utility buttons sat in the header row: your details, your account,
 * what's new, feedback and the theme. Only two of them are things you reach for
 * while working — the details you re-check per application, and the theme,
 * which is one tap. The other three are set-up and housekeeping, and having
 * them all out on the bar made the row wrap to a second line on a 768px tablet
 * and read as busier than the page under it.
 *
 * The dot is aggregated rather than repeated: whatever inside needs attention —
 * no API key, an unread release — surfaces on the trigger, so nothing hidden in
 * here can go unnoticed.
 */

type Props = {
  /** Drawn as a dot on Account, and on the trigger. */
  needsApiKey: boolean;
  onOpenAccount: () => void;
  onOpenWhatsNew: () => void;
  onOpenFeedback: () => void;
};

function DotsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h.01M12 12h.01M19 12h.01"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/** A megaphone rather than a bell: the dot already says something is waiting,
    so the icon is free to say what the panel *is*. Drawn at 1.5 where its
    neighbours use 2 — this is a Heroicons v2 outline with far more internal
    detail, and a 2px stroke closes up the gaps between cone and sound lines. */
function MegaphoneIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M10.3404 15.8398C9.65153 15.7803 8.95431 15.75 8.25 15.75H7.5C5.01472 15.75 3 13.7353 3 11.25C3 8.76472 5.01472 6.75 7.5 6.75H8.25C8.95431 6.75 9.65153 6.71966 10.3404 6.66022M10.3404 15.8398C10.5933 16.8015 10.9237 17.7317 11.3246 18.6234C11.5721 19.1738 11.3842 19.8328 10.8616 20.1345L10.2053 20.5134C9.6539 20.8318 8.9456 20.6306 8.67841 20.0527C8.0518 18.6973 7.56541 17.2639 7.23786 15.771M10.3404 15.8398C9.95517 14.3745 9.75 12.8362 9.75 11.25C9.75 9.66379 9.95518 8.1255 10.3404 6.66022M10.3404 15.8398C13.5 16.1124 16.4845 16.9972 19.1747 18.3749M10.3404 6.66022C13.5 6.3876 16.4845 5.50283 19.1747 4.12509M19.1747 4.12509C19.057 3.74595 18.9302 3.37083 18.7944 3M19.1747 4.12509C19.7097 5.84827 20.0557 7.65462 20.1886 9.51991M19.1747 18.3749C19.057 18.7541 18.9302 19.1292 18.7944 19.5M19.1747 18.3749C19.7097 16.6517 20.0557 14.8454 20.1886 12.9801M20.1886 9.51991C20.6844 9.93264 21 10.5545 21 11.25C21 11.9455 20.6844 12.5674 20.1886 12.9801M20.1886 9.51991C20.2293 10.0913 20.25 10.6682 20.25 11.25C20.25 11.8318 20.2293 12.4087 20.1886 12.9801"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function Dot({ title }: { title: string }) {
  return (
    <span
      className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]"
      title={title}
    />
  );
}

export default function HeaderMenu({
  needsApiKey,
  onOpenAccount,
  onOpenWhatsNew,
  onOpenFeedback,
}: Props) {
  const [open, setOpen] = useState(false);
  /**
   * Read in an effect, not during render: `localStorage` doesn't exist on the
   * server, and reading it while rendering would hand React a different first
   * paint on the client than the one it hydrates against.
   */
  const [unread, setUnread] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setUnread(hasUnreadRelease());
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      // Escape puts you back where you were, which is the trigger — otherwise
      // focus falls to the document and the next Tab restarts from the top.
      triggerRef.current?.focus();
    };
    // pointerdown, not click: a click that lands on a button elsewhere in the
    // header should close this *and* do its own job, and waiting for click
    // means the menu is still open underneath while that happens.
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    firstItemRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  /** Every item closes the menu before doing its thing — the panel it opens is
      the answer to the click, and two layers of overlay is one too many. */
  const pick = useCallback(
    (action: () => void) => () => {
      setOpen(false);
      action();
    },
    []
  );

  const hasNews = Boolean(latestRelease);
  const attention = needsApiKey || (hasNews && unread);

  const itemClass =
    "tap flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)]";

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
        aria-label="More"
        className={`hdr-btn hdr-btn-icon relative ${
          open ? "bg-[var(--color-surface-overlay)] border-[var(--color-text-muted)]" : ""
        }`}
      >
        <DotsIcon />
        {attention && (
          <span
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
            aria-hidden
          />
        )}
      </button>

      {open && (
        // Anchored to the trigger and right-aligned, so it opens inwards from
        // the edge of the window rather than off it.
        <div
          role="menu"
          aria-label="More"
          className="glass-panel absolute right-0 top-full z-50 mt-2 w-56 p-1.5 shadow-[var(--shadow-pop)]"
        >
          <button
            ref={firstItemRef}
            role="menuitem"
            onClick={pick(onOpenAccount)}
            className={itemClass}
          >
            <GearIcon />
            Account
            {needsApiKey && <Dot title="No API key set" />}
          </button>

          {hasNews && (
            <button
              role="menuitem"
              onClick={pick(() => {
                // Marked read by the menu rather than by the panel: you saw the
                // headline the moment it opened, and a dot that survives
                // reading it reads as broken.
                setUnread(false);
                onOpenWhatsNew();
              })}
              className={itemClass}
            >
              <MegaphoneIcon />
              What&rsquo;s New
              {unread && (
                <span
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                  title="New since you last looked"
                />
              )}
            </button>
          )}

          <button role="menuitem" onClick={pick(onOpenFeedback)} className={itemClass}>
            <ChatIcon />
            Send Feedback
          </button>
        </div>
      )}
    </div>
  );
}
