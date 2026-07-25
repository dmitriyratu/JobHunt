"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import ResumeUpload from "@/components/ResumeUpload";
import SectionHeader from "@/components/SectionHeader";
import SettingsPanel from "@/components/SettingsPanel";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";

export default function HomePage() {
  const { state, update, setState, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleResumeParsed = useCallback(
    (text: string, filename: string) => {
      update("resumeText", text);
      update("resumeFilename", filename);
    },
    [update]
  );

  const handleJobParsed = useCallback(
    (text: string, source: string) => {
      update("jobDescription", text);
      update("jobSource", source);
    },
    [update]
  );

  const canReachMatch = Boolean(state.resumeText && state.jobDescription);
  const canReachLetter = Boolean(state.resumeText && state.jobDescription && state.matchReport);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        subtitle="Resume & job description"
        canReachMatch={canReachMatch}
        canReachLetter={canReachLetter}
      />

      <SettingsPanel settings={settings} onSave={handleSettingsSave} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <SectionHeader
              step={1}
              title="Your resume"
              subtitle="Upload any format — we'll read and save the full text"
            />
            <ResumeUpload
              resumeText={state.resumeText}
              resumeFilename={state.resumeFilename}
              onParsed={handleResumeParsed}
              onClear={() => {
                update("resumeText", "");
                update("resumeFilename", "");
                setState((prev) => ({ ...prev, matchReport: null, reportChatMessages: [] }));
              }}
            />
          </section>

          <section>
            <SectionHeader
              step={2}
              title="Job description"
              subtitle="Paste text, drop a link, or upload a file"
            />
            <JobDescriptionInput
              jobDescription={state.jobDescription}
              jobSource={state.jobSource}
              onParsed={handleJobParsed}
              onClear={() => {
                update("jobDescription", "");
                update("jobSource", "");
                setState((prev) => ({ ...prev, matchReport: null, reportChatMessages: [] }));
              }}
            />
          </section>
        </div>

        <div className="mt-8 flex flex-col items-end gap-2">
          {canReachMatch ? (
            <Link href="/match" className="btn-primary px-6 py-3">
              Continue to match report →
            </Link>
          ) : (
            <>
              <button disabled className="btn-primary px-6 py-3 opacity-45 cursor-not-allowed">
                Continue to match report →
              </button>
              <p className="text-xs text-[var(--color-text-muted)]">
                Add your resume and a job description to continue
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
