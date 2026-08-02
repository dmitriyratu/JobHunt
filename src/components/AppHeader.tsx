"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { isProfileUsable, type AppSettings } from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import FeedbackModal from "./FeedbackModal";
import MobileSessionDrawer from "./MobileSessionDrawer";
import ProfileModal from "./ProfileModal";
import SettingsModal from "./SettingsModal";
import StageNav from "./StageNav";
import ThemeToggle from "./ThemeToggle";

type Props = {
  subtitle: string;
  settings: AppSettings;
  onSettingsSave: (settings: AppSettings) => void;
};

export default function AppHeader({ subtitle, settings, onSettingsSave }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { state, newSession } = useJobHuntState();
  const router = useRouter();
  const profileReady = isProfileUsable(settings.profile);

  // Home = start a fresh application. If the current session is still an
  // uncommitted draft we're already on a blank one, so don't discard its work.
  const goHome = useCallback(async () => {
    if (state.committed) await newSession();
    router.push("/");
  }, [state.committed, newSession, router]);

  return (
    <>
      {/* A fixed --app-header-h so the bottom rule lands exactly where the
          applications rail's does; the stage bar below is content-sized and the
          top row absorbs whatever is left. Height only applies from lg, where
          the rail exists to align with — below that the row is free to wrap to
          two lines on a narrow phone. */}
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] lg:flex lg:h-[var(--app-header-h)] lg:flex-col">
        {/* Two deliberate rows on a phone rather than a ragged wrap.
            Five 44px controls and the wordmark cannot share a 390px line — they
            overflow by about ten pixels, which is how this came to wrap by
            accident — so below `sm` the control group is given the full width
            and spreads across it, which reads as a toolbar instead of as an
            overflow. From `sm` everything is back on one line at the right. */}
        <div className="app-container py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 lg:min-h-0 lg:flex-1">
          <button
            onClick={goHome}
            title="Start a new application"
            className="flex min-w-0 items-center gap-2.5 sm:gap-3 text-left rounded-[var(--radius-control)] -m-1 p-1 hover:bg-[var(--color-surface-overlay)] transition-colors"
          >
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] shadow-[var(--shadow-accent)]">
              <svg className="h-5 w-5 text-[var(--color-on-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-base tracking-tight leading-tight">JobHunt</h1>
              {/* Kept at every width now. The controls have a line of their own
                  on a phone, which leaves the brand row with room to spare, and
                  the journey meter below names the step you are on but not what
                  the page is for. */}
              <p className="truncate text-xs text-[var(--color-text-muted)]">{subtitle}</p>
            </div>
          </button>

          <div className="flex w-full items-center justify-between gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-2">
            {/* Its own control rather than a Settings tab: this is the one thing
                in here you revisit per application.

                Both this label and Settings' collapse to icon-only below sm.
                This row was already at the edge of wrapping on a phone before a
                fourth control joined it, and the icons carry the meaning at that
                size. Checked on a desktop viewport only — verify the phone
                layout in devtools before changing the widths here. */}
            <button
              onClick={() => setProfileOpen(true)}
              title={profileReady ? "The details at the top of your resumes" : "Add your details"}
              className="flex h-9 items-center gap-1.5 text-xs font-medium px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors [@media(pointer:coarse)]:h-11"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="hidden sm:inline">Your details</span>
              {!profileReady && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                  title="Details not filled in"
                />
              )}
            </button>

            <button
              onClick={() => setSettingsOpen(true)}
              title={
                settings.apiKey ? "OpenAI key saved in this browser" : "Add your OpenAI key"
              }
              className="flex h-9 items-center gap-1.5 text-xs font-medium px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors [@media(pointer:coarse)]:h-11"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
              {!settings.apiKey && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                  title="No API key set"
                />
              )}
            </button>

            <FeedbackModal />

            <ThemeToggle />

            <MobileSessionDrawer />
          </div>
        </div>

        {/* The journey gets its own band below the title rather than competing
            with the utility buttons for room in the top row. Full width on a
            phone — the meter divides the screen into four equal segments, which
            is what keeps every step named — and centred by StageNav itself once
            there is room to spare. */}
        <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
          <div className="app-container py-2">
            <StageNav />
          </div>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={onSettingsSave}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        settings={settings}
        onSave={onSettingsSave}
        // A chosen shape outranks the recommendation, matching how the picker
        // itself resolves them.
        shape={state.documentShape ?? state.recommendedShape}
      />
    </>
  );
}
