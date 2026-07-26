"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import SessionCard from "./SessionCard";
import { useJobHuntState } from "@/lib/useAppState";

/**
 * Lives in the root layout, so it persists unchanged across every step of the
 * journey (resume & job → match report → letter) rather than remounting per
 * page.
 */
export default function SessionRail() {
  const { sessions, currentSessionId, hydrated, newSession, switchSession, deleteSession } =
    useJobHuntState();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const handleNew = useCallback(async () => {
    setCreating(true);
    try {
      await newSession();
      // A brand-new application has nothing to analyze or write yet.
      router.push("/");
    } finally {
      setCreating(false);
    }
  }, [newSession, router]);

  const handleSelect = useCallback(
    (id: string) => {
      switchSession(id);
    },
    [switchSession]
  );

  return (
    <aside className="hidden lg:flex flex-col w-[320px] shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] sticky top-0 h-screen">
      <div className="px-4 py-5 border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Applications</h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            {hydrated ? sessions.length : ""}
          </span>
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
            <SessionCard
              key={session.id}
              session={session}
              expanded={session.id === currentSessionId}
              onSelect={() => handleSelect(session.id)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
      </div>
    </aside>
  );
}
