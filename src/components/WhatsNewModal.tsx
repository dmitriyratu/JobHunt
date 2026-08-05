"use client";

import { useCallback, useEffect } from "react";
import { formatReleaseDate, latestRelease, releases, type ReleaseMedia } from "@/lib/releases";
import { useScrollLock } from "@/lib/useScrollLock";
import { useTheme } from "@/lib/useTheme";

/**
 * What changed, in the language of someone using the app rather than someone
 * who wrote it.
 */
type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * The screenshot for one change, in the theme you are reading in.
 *
 * Both files are always on disk; only one is ever requested, so the wrong-theme
 * shot costs nothing. `useTheme` reports light until it has read localStorage,
 * which is fine here — the modal is opened by a click, long after that.
 */
function ChangeShot({ media }: { media: ReleaseMedia }) {
  const { theme } = useTheme();

  return (
    // Plain <img>: a scene is as tall as its content, so these have no
    // intrinsic size known at build time, and next/image wants one.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={theme === "dark" ? media.dark : media.light}
      alt={media.alt}
      loading="lazy"
      className="mt-2.5 w-full rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]"
    />
  );
}

/**
 * Opened from the header's overflow menu. The unread dot is resolved there too,
 * beside the menu item and aggregated onto the menu's own trigger — see
 * `hasUnreadRelease` in lib/releases.
 */
export default function WhatsNewModal({ open, onClose }: Props) {
  // Holds the page still. Was a local `body.style.overflow = "hidden"` here,
  // which the shared hook supersedes: it also compensates for the scrollbar
  // width it removes, and reference-counts so overlapping dialogs don't hand
  // the page back early.
  useScrollLock(open);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Nothing has shipped yet. Rather than an empty panel, there's nothing here —
  // the menu hides its item on the same condition.
  if (!latestRelease) return null;

  return (
    <>
      {open && (
        <div
          className="modal-overlay"
          onClick={close}
        >
          <div
            // Wider than the other modals because this one carries
            // screenshots, and a shrunk screenshot of an interface is a
            // picture of something you cannot read.
            className="modal-panel glass-panel max-w-2xl p-0"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="What's new"
          >
            <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">What&rsquo;s new</h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Every update that changed something for you
                </p>
              </div>
              <button onClick={close} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                Close
              </button>
            </div>

            {/* Capped so a long history scrolls inside the panel instead of
                turning the page into one. The cap is `.modal-panel`'s now: as a
                `max-h-[70vh]` inside a scrolling backdrop this was two nested
                scrollers, and `vh` on a phone is the *large* viewport, so 70%
                of it could be more than 100% of what was actually on screen. */}
            <div className="modal-body p-4 sm:p-5">
              <div className="space-y-6">
                {releases.map((release, index) => (
                  <section key={release.version}>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="text-sm font-medium">{release.headline}</h3>
                      {index === 0 && (
                        <span className="rounded-full bg-[var(--color-accent-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                          Latest
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                      Version {release.version} &middot; {formatReleaseDate(release.date)}
                    </p>

                    <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      {release.summary}
                    </p>

                    {release.changes.length > 0 && (
                      <ul className="mt-3 space-y-2.5">
                        {release.changes.map((change) => (
                          <li
                            key={change.title}
                            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3"
                          >
                            <p className="text-xs font-medium">{change.title}</p>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                              {change.detail}
                            </p>
                            {change.media && <ChangeShot media={change.media} />}
                          </li>
                        ))}
                      </ul>
                    )}

                    {index < releases.length - 1 && (
                      <div className="mt-6 border-b border-[var(--color-border-subtle)]" />
                    )}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
