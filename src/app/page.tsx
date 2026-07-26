"use client";

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import ResumeUpload from "@/components/ResumeUpload";
import SectionHeader from "@/components/SectionHeader";
import StepNav from "@/components/StepNav";
import { fileKey } from "@/lib/fileStore";
import { JOB_CHANGE_RESET, RESUME_CHANGE_RESET } from "@/lib/session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";

export default function HomePage() {
  const { state, setState, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // Submitting new source material is what invalidates downstream work —
  // navigation never does. Identical content is a no-op so re-uploading the
  // same file doesn't throw away an analysis.
  const handleResumeParsed = useCallback(
    (text: string, filename: string) => {
      setState((prev) => ({
        ...prev,
        resumeText: text,
        resumeFilename: filename,
        ...(text !== prev.resumeText ? RESUME_CHANGE_RESET : {}),
      }));
    },
    [setState],
  );

  const handleJobParsed = useCallback(
    (text: string, source: string, sourceType: "file" | "url" | "text") => {
      setState((prev) => ({
        ...prev,
        jobDescription: text,
        jobSource: source,
        jobSourceType: sourceType,
        ...(text !== prev.jobDescription ? JOB_CHANGE_RESET : {}),
      }));
    },
    [setState],
  );

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
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section>
            <SectionHeader
              step={1}
              title="Your resume"
              subtitle="Upload any format — we'll read and save the full text"
            />
            <ResumeUpload
              key={state.id}
              resumeText={state.resumeText}
              resumeFilename={state.resumeFilename}
              fileKey={fileKey(state.id, "resume")}
              onParsed={handleResumeParsed}
              onClear={() =>
                setState((prev) => ({
                  ...prev,
                  resumeText: "",
                  resumeFilename: "",
                  ...RESUME_CHANGE_RESET,
                }))
              }
            />
          </section>

          <section>
            <SectionHeader
              step={2}
              title="Job description"
              subtitle="Paste text, drop a link, or upload a file"
            />
            <JobDescriptionInput
              key={state.id}
              jobDescription={state.jobDescription}
              jobSource={state.jobSource}
              jobSourceType={state.jobSourceType}
              fileKey={fileKey(state.id, "jobDescription")}
              onParsed={handleJobParsed}
              onClear={() =>
                setState((prev) => ({
                  ...prev,
                  jobDescription: "",
                  jobSource: "",
                  jobSourceType: "",
                  ...JOB_CHANGE_RESET,
                }))
              }
            />
          </section>
        </div>

        <StepNav />
      </main>
    </div>
  );
}
