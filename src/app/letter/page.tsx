"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ContextRecap from "@/components/ContextRecap";
import EmailOutput from "@/components/EmailOutput";
import SessionCostSummary from "@/components/SessionCostSummary";
import StepNav from "@/components/StepNav";
import { getPricingForTier } from "@/lib/models";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { resolveCompany } from "@/lib/session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import { appendUsageEntry, loadUsageLog, type UsageEntry } from "@/lib/usage";

export default function LetterPage() {
  const { state, update, patch, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [usageEntries, setUsageEntries] = useState<UsageEntry[]>([]);

  useEffect(() => {
    setSettings(loadSettings());
    setUsageEntries(loadUsageLog());
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
          companyName: resolveCompany(state) || undefined,
          apiKey: settings.apiKey || undefined,
          modelTier: settings.modelTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      patch({
        generatedSubject: data.subject ?? "",
        generatedBody: plainTextToHtml(data.body ?? ""),
      });
      if (data.usage) {
        const entries = appendUsageEntry({
          endpoint: "generate-email",
          model: data.usage.model,
          tier: settings.modelTier,
          usage: data.usage,
          pricing: getPricingForTier(settings.modelTier),
        });
        setUsageEntries(entries);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [state, settings, patch]);

  const canGenerate = Boolean(state.resumeText && state.jobDescription);

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
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

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
        ) : (
          <>
            <ContextRecap
              resumeFilename={state.resumeFilename}
              resumeText={state.resumeText}
              jobSource={state.jobSource}
              jobDescription={state.jobDescription}
              report={state.matchReport}
              jobTitle={state.detectedJobTitle}
              detectedCompany={state.detectedCompany}
              companyName={state.companyName}
              onCompanyNameChange={(v) => update("companyName", v)}
            />

            {!state.matchReport && (
              <div className="glass-panel p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  No match report yet — the letter is much stronger with one.
                </p>
                <Link href="/match" className="btn-secondary text-xs py-1.5 px-3 shrink-0">
                  Run the analysis
                </Link>
              </div>
            )}

            <EmailOutput
              key={state.id}
              subject={state.generatedSubject}
              body={state.generatedBody}
              loading={generating}
              error={generateError}
              canGenerate={canGenerate}
              recipientName={state.recipientName}
              letterContext={state.letterContext}
              onRecipientNameChange={(v) => update("recipientName", v)}
              onLetterContextChange={(v) => update("letterContext", v)}
              onSubjectChange={(v) => update("generatedSubject", v)}
              onBodyChange={(html) => update("generatedBody", html)}
              onGenerate={handleGenerate}
            />

            {state.generatedBody && <SessionCostSummary entries={usageEntries} adminApiKey={settings.adminApiKey} />}
          </>
        )}

        <StepNav />
      </main>
    </div>
  );
}
