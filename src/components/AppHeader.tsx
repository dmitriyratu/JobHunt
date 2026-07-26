"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { MODEL_TIERS } from "@/lib/models";
import type { AppSettings } from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import SettingsModal from "./SettingsModal";
import StageNav from "./StageNav";
import UsageModal from "./UsageModal";

type Props = {
  subtitle: string;
  settings: AppSettings;
  onSettingsSave: (settings: AppSettings) => void;
};

export default function AppHeader({ subtitle, settings, onSettingsSave }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const { state, newSession } = useJobHuntState();
  const router = useRouter();
  const tierMeta = MODEL_TIERS[settings.modelTier];

  // Home = start a fresh application. If the current session is still an
  // uncommitted draft we're already on a blank one, so don't discard its work.
  const goHome = useCallback(async () => {
    if (state.committed) await newSession();
    router.push("/");
  }, [state.committed, newSession, router]);

  return (
    <>
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
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
            <div>
              <h1 className="font-semibold text-base tracking-tight">JobHunt</h1>
              <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              title={
                settings.apiKey
                  ? `${tierMeta.label} · ${tierMeta.subtitle}`
                  : "Add your OpenAI key and pick a model"
              }
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              AI settings
              {!settings.apiKey && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]"
                  title="No API key set"
                />
              )}
            </button>

            <button
              onClick={() => setUsageOpen(true)}
              title="LLM usage & spend"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)] hover:border-[var(--color-text-muted)] transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14" />
              </svg>
              Usage
            </button>
          </div>
        </div>

        {/* The journey gets its own centered panel below the title rather than
            competing with the utility buttons for room in the top row. */}
        <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
          <div className="max-w-6xl mx-auto px-6 py-2.5 flex justify-center">
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
      <UsageModal
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        adminApiKey={settings.adminApiKey}
      />
    </>
  );
}
