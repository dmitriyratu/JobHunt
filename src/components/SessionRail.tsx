"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveCompany, sessionTitle } from "@/lib/session";
import { useJobHuntState } from "@/lib/useAppState";
import CompanyLogo from "./CompanyLogo";
import SessionCard from "./SessionCard";

const COLLAPSED_KEY = "jobhunt-rail-collapsed";

function ChevronIcon({ pointsRight }: { pointsRight: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${pointsRight ? "" : "rotate-180"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Lives in the root layout, so it persists unchanged across every step of the
 * journey (resume & job → match report → letter) rather than remounting per
 * page.
 *
 * Collapses to a strip of company logos. The collapsed choice is remembered,
 * because a rail you have to re-collapse on every visit is worse than one that
 * never collapsed.
 */
export default function SessionRail() {
  const { sessions, currentSessionId, hydrated, newSession, switchSession, deleteSession } =
    useJobHuntState();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  /**
   * The stored preference can only be read after mount, so the width animation
   * is withheld until then — otherwise a rail restored as collapsed would be
   * seen sliding shut on every page load.
   */
  const [prefLoaded, setPrefLoaded] = useState(false);
  /**
   * Which card is showing its details. Deliberately separate from
   * `currentSessionId`: the active application stays highlighted at all times,
   * but its details collapse as soon as you look elsewhere, so the rail stays
   * a scannable list rather than one permanently open card.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Private-mode storage failure just means the default (expanded) stands.
    }
    setPrefLoaded(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal: the rail still toggles for this session.
      }
      return next;
    });
    setExpandedId(null);
  }, []);

  // Clicking anywhere outside the open card minimises it. Uses a ref rather
  // than an attribute selector so generated session ids never need escaping.
  useEffect(() => {
    if (!expandedId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && expandedRef.current?.contains(target)) return;
      setExpandedId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expandedId]);

  const handleNew = useCallback(async () => {
    setCreating(true);
    try {
      await newSession();
      setExpandedId(null);
      // A brand-new application has nothing to analyze or write yet.
      router.push("/");
    } finally {
      setCreating(false);
    }
  }, [newSession, router]);

  const handleSelect = useCallback(
    (id: string) => {
      switchSession(id);
      // Re-clicking the open card closes it, so the same control both opens
      // and dismisses the details.
      setExpandedId((prev) => (prev === id ? null : id));
    },
    [switchSession]
  );

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] sticky top-0 h-screen ${
        collapsed ? "w-[68px]" : "w-[320px]"
      } ${prefLoaded ? "transition-[width] duration-200 ease-out" : ""}`}
      aria-label="Applications"
    >
      {collapsed ? (
        <>
          <div className="flex flex-col items-center gap-2 px-3 py-4 border-b border-[var(--color-border-subtle)]">
            <button
              onClick={toggleCollapsed}
              title="Expand applications"
              aria-label="Expand applications"
              aria-expanded={false}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <ChevronIcon pointsRight={false} />
            </button>
            <button
              onClick={handleNew}
              disabled={creating}
              title="New application"
              aria-label="New application"
              className="btn-primary h-9 w-9 p-0 text-lg leading-none"
            >
              {creating ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "+"
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col items-center gap-2">
            {hydrated &&
              sessions.map((session) => {
                const company = resolveCompany(session);
                const title = sessionTitle(session);
                const active = session.id === currentSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => switchSession(session.id)}
                    title={title}
                    aria-label={title}
                    aria-current={active ? "true" : undefined}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border p-1.5 transition-colors ${
                      active
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
                    }`}
                  >
                    {/* CompanyLogo renders nothing without a company name, so
                        fall back to the first letter of the card's own title —
                        an empty tile would be unclickable-looking. */}
                    {company ? (
                      <CompanyLogo company={company} variant="tile" />
                    ) : (
                      <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                        {title.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </>
      ) : (
        <>
          <div className="px-4 py-5 border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-medium text-sm">Applications</h2>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {hydrated ? sessions.length : ""}
                </span>
                <button
                  onClick={toggleCollapsed}
                  title="Collapse applications"
                  aria-label="Collapse applications"
                  aria-expanded
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <ChevronIcon pointsRight />
                </button>
              </div>
            </div>
            <button onClick={handleNew} disabled={creating} className="btn-primary w-full">
              {creating ? "Creating…" : "+ New application"}
            </button>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Your resume carries over; the job details start fresh.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {hydrated &&
              sessions.map((session) => (
                <div key={session.id} ref={session.id === expandedId ? expandedRef : undefined}>
                  <SessionCard
                    session={session}
                    active={session.id === currentSessionId}
                    expanded={session.id === expandedId}
                    onSelect={() => handleSelect(session.id)}
                    onDelete={() => deleteSession(session.id)}
                  />
                </div>
              ))}
          </div>
        </>
      )}
    </aside>
  );
}
