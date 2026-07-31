"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useJobHuntState } from "@/lib/useAppState";
import SessionCard from "./SessionCard";

type Props = {
  /**
   * Called after an action that navigates or changes the current application,
   * so a container that overlays the page (the phone drawer) can dismiss itself
   * instead of hiding the result of the tap.
   */
  onNavigate?: () => void;
};

/**
 * The new-application button and the list of saved applications.
 *
 * Shared by the desktop rail and the phone drawer so the two can't drift apart
 * — the rail is `hidden lg:flex`, which previously left a phone with no way to
 * create or switch applications at all.
 */
export default function SessionList({ onNavigate }: Props) {
  const { sessions, currentSessionId, hydrated, newSession, switchSession, deleteSession } =
    useJobHuntState();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  /**
   * Which card is showing its details. Deliberately separate from
   * `currentSessionId`: the active application stays highlighted at all times,
   * but its details collapse as soon as you look elsewhere, so the list stays
   * scannable rather than having one permanently open card.
   */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement | null>(null);

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
      onNavigate?.();
    } finally {
      setCreating(false);
    }
  }, [newSession, router, onNavigate]);

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
    <>
      <div className="px-4 pt-4 pb-4 border-b border-[var(--color-border-subtle)]">
        <button onClick={handleNew} disabled={creating} className="btn-primary w-full">
          {creating ? "Creating…" : "+ New application"}
        </button>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Your resume carries over; the job details start fresh.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-2">
        {hydrated && sessions.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)] text-center py-6">
            No applications yet. They appear here once you reach the match report.
          </p>
        )}
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
  );
}
