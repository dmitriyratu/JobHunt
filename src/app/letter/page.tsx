"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ContextRecap from "@/components/ContextRecap";
import EmailOutput from "@/components/EmailOutput";
import SettingsPanel from "@/components/SettingsPanel";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import { appendUsageEntry } from "@/lib/usage";

export default function LetterPage() {
  const { state, update, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerateError("");
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: state.resumeText,
          jobDescription: state.jobDescription,
          matchReport: state.matchReport,
          letterContext: state.letterContext || undefined,
          recipientName: state.recipientName || undefined,
          companyName: state.companyName || undefined,
          apiKey: settings.apiKey || undefined,
          modelTier: settings.modelTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      update("generatedEmail", data.email);
      if (data.usage) {
        appendUsageEntry({
          endpoint: "generate-email",
          model: data.usage.model,
          tier: settings.modelTier,
          usage: data.usage,
          pricing: settings.pricing[settings.modelTier],
        });
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [
    state.resumeText,
    state.jobDescription,
    state.matchReport,
    state.letterContext,
    state.recipientName,
    state.companyName,
    settings,
    update,
  ]);

  const canGenerate = Boolean(state.resumeText && state.jobDescription);
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
        subtitle="Write your outreach letter"
        canReachMatch={canReachMatch}
        canReachLetter={canReachLetter}
      />

      <SettingsPanel settings={settings} onSave={handleSettingsSave} />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {!state.resumeText || !state.jobDescription ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              You need a resume and job description before writing a letter.
            </p>
            <Link href="/" className="btn-primary inline-block px-6 py-3">
              ← Back to resume &amp; job
            </Link>
          </div>
        ) : !state.matchReport ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Analyze a match report before writing a letter.
            </p>
            <Link href="/match" className="btn-primary inline-block px-6 py-3">
              ← Back to match report
            </Link>
          </div>
        ) : (
          <>
            <ContextRecap
              resumeFilename={state.resumeFilename}
              resumeText={state.resumeText}
              jobSource={state.jobSource}
              jobDescription={state.jobDescription}
              report={state.matchReport}
            />

            <EmailOutput
              email={state.generatedEmail}
              loading={generating}
              error={generateError}
              canGenerate={canGenerate}
              recipientName={state.recipientName}
              companyName={state.companyName}
              letterContext={state.letterContext}
              onRecipientNameChange={(v) => update("recipientName", v)}
              onCompanyNameChange={(v) => update("companyName", v)}
              onLetterContextChange={(v) => update("letterContext", v)}
              onGenerate={handleGenerate}
            />
          </>
        )}
      </main>
    </div>
  );
}
