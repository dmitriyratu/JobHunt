"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { isProfileUsable, type AppSettings } from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import FeedbackModal from "./FeedbackModal";
import HeaderMenu from "./HeaderMenu";
import MobileSessionDrawer from "./MobileSessionDrawer";
import ProfileModal from "./ProfileModal";
import SettingsModal from "./SettingsModal";
import StageNav from "./StageNav";
import ThemeToggle from "./ThemeToggle";
import WhatsNewModal from "./WhatsNewModal";

type Props = {
  subtitle: string;
  settings: AppSettings;
  onSettingsSave: (settings: AppSettings) => void;
};

export default function AppHeader({ subtitle, settings, onSettingsSave }: Props) {
  // The header owns all four panels now. Two of them used to own their own
  // trigger button; those triggers moved into the overflow menu, and a
  // component cannot be both an item in a menu and the panel that item opens.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
          top row absorbs whatever is left. Height only applies from xl, where
          the rail exists to align with — below that the row is free to wrap to
          two lines on a narrow phone. */}
      {/* min-h, not h: at the natural content height the two are identical, so
          the rule still lands where the rail's does — but if a row ever needs
          more than the band allows, the header grows instead of clipping what
          is inside it. A hard height cut the wordmark and the buttons in half
          the moment --app-header-h was set below what the rows measure. */}
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] xl:flex xl:min-h-[var(--app-header-h)] xl:flex-col">
        {/* Two deliberate rows on a phone rather than a ragged wrap.
            Five 44px controls and the wordmark cannot share a 390px line — they
            overflow by about ten pixels, which is how this came to wrap by
            accident — so below `sm` the control group is given the full width
            and spreads across it, which reads as a toolbar instead of as an
            overflow. From `sm` everything is back on one line at the right. */}
        {/* py-3 at every width, not py-3 growing to py-4.
            The row's content is 38px tall — a 36px control, or the wordmark
            over its subtitle — and at py-4 it sat in a 70px box against the
            50px stage band below, which made the lighter of the two bands the
            taller one. 12px a side reads as deliberate rather than roomy, and
            `items-center` is what keeps it even top and bottom. */}
        <div className="app-container py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 xl:min-h-0 xl:flex-1">
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
                size.

                Height, corner and hover all come from `.hdr-btn` — see
                globals.css. Written out per button, these six had drifted to
                three different heights and two different radii, and the drift
                got worse rather than better on a touch screen. */}
            <button
              onClick={() => setProfileOpen(true)}
              title={profileReady ? "The details at the top of your resumes" : "Add your details"}
              className="hdr-btn"
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

            <ThemeToggle />

            {/* Settings, What's new and Feedback live in here. All three are
                set-up and housekeeping rather than things you reach for while
                working, and out on the bar the five of them wrapped the row to
                two lines on a 768px tablet. Whatever inside needs attention
                surfaces as a dot on the trigger. */}
            <HeaderMenu
              needsApiKey={!settings.apiKey}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenWhatsNew={() => setWhatsNewOpen(true)}
              onOpenFeedback={() => setFeedbackOpen(true)}
            />

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

      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
