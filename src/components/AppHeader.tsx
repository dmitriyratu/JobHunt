"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import FeedbackModal from "./FeedbackModal";
import MobileSessionDrawer from "./MobileSessionDrawer";
import SettingsModal from "./SettingsModal";
import StageNav from "./StageNav";

type Props = {
  subtitle: string;
  settings: AppSettings;
  onSettingsSave: (settings: AppSettings) => void;
};

export default function AppHeader({ subtitle, settings, onSettingsSave }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state, newSession } = useJobHuntState();
  const router = useRouter();

  // Home = start a fresh application. If the current session is still an
  // uncommitted draft we're already on a blank one, so don't discard its work.
  const goHome = useCallback(async () => {
    if (state.committed) await newSession();
    router.push("/");
  }, [state.committed, newSession, router]);

  return (
    <>
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
        {/* flex-wrap so the buttons drop to a second line instead of pushing the
            page into horizontal scroll — at 320px the title plus both buttons
            are ~11px wider than the viewport. */}
        <div className="app-container py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <button
            onClick={goHome}
            title="Start a new application"
            className="flex items-center gap-3 text-left rounded-lg -m-1 p-1 hover:bg-[var(--color-surface-overlay)] transition-colors"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)]">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-base tracking-tight">JobHunt</h1>
              {/* The per-page subtitle is the first thing to go on a phone —
                  the journey pills below already say where you are. */}
              <p className="hidden sm:block text-xs text-[var(--color-text-muted)]">{subtitle}</p>
            </div>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSettingsOpen(true)}
              title={
                settings.apiKey ? "OpenAI key saved in this browser" : "Add your OpenAI key"
              }
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">AI settings</span>
              <span className="sm:hidden">Settings</span>
              {!settings.apiKey && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                  title="No API key set"
                />
              )}
            </button>

            <FeedbackModal />

            <MobileSessionDrawer />
          </div>
        </div>

        {/* The journey gets its own centered panel below the title rather than
            competing with the utility buttons for room in the top row. */}
        <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
          {/* justify-start below sm because centring a horizontally scrollable
              flex row clips its leading edge, making the first pill unreachable. */}
          <div className="app-container py-2.5 flex justify-start sm:justify-center">
            <StageNav />
          </div>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={onSettingsSave}
      />
    </>
  );
}
