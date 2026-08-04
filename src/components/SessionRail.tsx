"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useChatDock } from "@/lib/chatDock";
import { resolveCompany, sessionTitle } from "@/lib/session";
import { useJobHuntState } from "@/lib/useAppState";
import CompanyLogo from "./CompanyLogo";
import SessionList from "./SessionList";

const COLLAPSED_KEY = "jobhunt-rail-collapsed";

function ChatIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h8m-8-4h5m-5 8h3m-6.5 5.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 4.5Z"
      />
    </svg>
  );
}

/**
 * The assistant's toggle, pinned to the foot of the rail.
 *
 * Which chat it opens is the current step's business, not the rail's — the rail
 * only knows there is one, what it's called, and how many suggestions are
 * waiting on a decision. Renders nothing on steps that have no chat.
 */
function RefineButton({ collapsed }: { collapsed: boolean }) {
  const { available, label, pendingCount, open, toggle } = useChatDock();
  if (!available) return null;

  return (
    // No top rule. StepNav draws one across the main column because it divides
    // the page from its own footer; the rail is already a separate column with
    // its own left edge, so a second rule here only cut the panel in half.
    //
    // Still h-16, and still matching StepNav's height exactly — the two footers
    // sit side by side, and the button has to line up with the controls beside
    // it even though the line between them is gone.
    <div className="mt-auto flex h-16 items-center px-3">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        // h-10 in both states, not padding: 12px of wrapper padding either side
        // of a 40px control is exactly the 64px of StepNav, and the two top
        // borders meet at the bottom of the screen where any mismatch shows.
        className={`relative flex h-10 items-center rounded-lg border transition-colors ${
          collapsed ? "w-10 justify-center" : "w-full gap-2 px-3"
        } ${
          open
            ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
            : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]"
        }`}
      >
        <ChatIcon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="text-sm font-medium">{label}</span>}
        {pendingCount > 0 &&
          (collapsed ? (
            // No room for a number beside the icon at 40px, so it becomes a dot.
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface-raised)] bg-[var(--color-accent)]" />
          ) : (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-[11px] font-semibold text-[var(--color-on-accent)]">
              {pendingCount}
            </span>
          ))}
      </button>
    </div>
  );
}

function ChevronIcon({ pointsRight }: { pointsRight: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${pointsRight ? "" : "rotate-180"}`}
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
 * Desktop only — below `xl` there isn't room for a permanent 320px column, so
 * MobileSessionDrawer presents the same list from the header instead.
 *
 * `xl` (1280) rather than `lg` (1024). At 1024 this was appearing on a
 * landscape tablet and leaving 704px for the document — less than the same
 * tablet gives you upright, which made turning the device sideways a downgrade.
 *
 * Collapses to a strip of company logos. The collapsed choice is remembered,
 * because a rail you have to re-collapse on every visit is worse than one that
 * never collapsed.
 */
export default function SessionRail() {
  const { sessions, currentSessionId, hydrated, newSession, switchSession } = useJobHuntState();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  /**
   * The stored preference can only be read after mount, so the width animation
   * is withheld until then — otherwise a rail restored as collapsed would be
   * seen sliding shut on every page load.
   */
  const [prefLoaded, setPrefLoaded] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Private-mode storage failure just means the default (expanded) stands.
    }
    setPrefLoaded(true);
  }, []);

  // Published for anything viewport-fixed that has to sit clear of the rail —
  // see --rail-w in globals.css. Written here rather than derived in CSS
  // because the width lives in this component's state.
  useEffect(() => {
    document.documentElement.style.setProperty("--rail-w-open", collapsed ? "68px" : "320px");
  }, [collapsed]);

  /**
   * Kept out of the state updater: StrictMode invokes updaters twice to surface
   * impurity, so a write in there runs twice per click.
   */
  const remember = useCallback((next: boolean) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Non-fatal: the rail still toggles for this session.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      queueMicrotask(() => remember(next));
      return next;
    });
  }, [remember]);

  /**
   * Picking an application out of the collapsed strip opens the rail.
   *
   * The strip is a way to keep the rail out of the way, not a way to work in
   * it: a 44px logo says which application you landed on and nothing else, so a
   * switch made from there left you on a new application with no title, no
   * score and no way to tell it from the one you just left. Opening answers the
   * question the click was really asking.
   *
   * Remembered like any other open, because the rail's stored state is just
   * "the state you left it in" — persisting the toggle but not this would put
   * the two out of step on the next load.
   */
  const openWithSession = useCallback(
    (id: string) => {
      switchSession(id);
      setCollapsed(false);
      remember(false);
    },
    [switchSession, remember]
  );

  const handleNewCollapsed = useCallback(async () => {
    setCreating(true);
    try {
      await newSession();
      router.push("/");
    } finally {
      setCreating(false);
    }
  }, [newSession, router]);

  return (
    <aside
      className={`hidden xl:flex flex-col shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] sticky top-0 h-dvh ${
        collapsed ? "w-[68px]" : "w-[320px]"
      } ${prefLoaded ? "transition-[width] duration-200 ease-out" : ""}`}
      aria-label="Applications"
    >
      {collapsed ? (
        <>
          {/* --app-header-h, not padding: this block's bottom rule is read as
              one line with the app header's, immediately to its left. */}
          <div className="flex h-[var(--app-header-h)] shrink-0 flex-col items-center justify-center gap-2 px-3 border-b border-[var(--color-border-subtle)]">
            <button
              onClick={toggleCollapsed}
              title="Expand applications"
              aria-label="Expand applications"
              aria-expanded={false}
              className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <ChevronIcon pointsRight={false} />
            </button>
            <button
              onClick={handleNewCollapsed}
              disabled={creating}
              title="New application"
              aria-label="New application"
              // Matches the collapse button above it exactly — same 36px box,
              // same corner. These two sit stacked in a 68px rail, and any
              // difference between them reads as a mistake rather than a
              // hierarchy.
              className="btn-primary h-9 w-9 shrink-0 rounded-[var(--radius-sm)] p-0 text-lg leading-none"
            >
              {creating ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-on-accent)] border-t-transparent" />
              ) : (
                "+"
              )}
            </button>
          </div>

          {/* overflow-x-hidden is load-bearing: setting only overflow-y makes
              the computed overflow-x `auto`, so once enough applications bring
              up a vertical scrollbar the 44px tiles no longer fit the 44px
              content box and the rail grows a horizontal scrollbar too. */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 flex flex-col items-center gap-2">
            {hydrated &&
              sessions.map((session) => {
                const company = resolveCompany(session);
                const title = sessionTitle(session);
                const active = session.id === currentSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => openWithSession(session.id)}
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
                        an empty tile would look unclickable. */}
                    {company ? (
                      <CompanyLogo
                        company={company}
                        domain={session.detectedCompanyDomain}
                        variant="tile"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-[var(--color-text-muted)]">
                        {title.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <RefineButton collapsed />
        </>
      ) : (
        <>
          {/*
            Same height and rule as the collapsed state, and as the app header
            beside it — expanding the rail shouldn't move the line.

            The new-application button lives up here rather than below the rule,
            for the same reason the collapsed state stacks its two buttons: the
            band is a fixed --app-header-h, and a lone title left most of it
            empty. Bringing the button up fills it and removes a second rule
            that used to sit a few pixels under the first.
          */}
          <div className="flex h-[var(--app-header-h)] shrink-0 flex-col justify-center gap-2 border-b border-[var(--color-border-subtle)] px-4">
            <div className="flex items-center justify-between gap-2">
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
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <ChevronIcon pointsRight />
                </button>
              </div>
            </div>
            <button
              onClick={handleNewCollapsed}
              disabled={creating}
              // The line that used to sit under this button as body copy. There
              // is no room for it in a fixed band, and it is a first-run hint
              // rather than something you re-read.
              title="Your resume carries over; the job details start fresh."
              className="btn-primary w-full py-2 text-sm"
            >
              {creating ? "Creating…" : "+ New application"}
            </button>
          </div>
          <SessionList showNewButton={false} />
          <RefineButton collapsed={false} />
        </>
      )}
    </aside>
  );
}
