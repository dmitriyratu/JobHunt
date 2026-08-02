"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ContextRecap from "@/components/ContextRecap";
import GenerateEmailModal from "@/components/GenerateEmailModal";
import LetterOutput from "@/components/LetterOutput";
import StepNav from "@/components/StepNav";
import { plainTextToHtml } from "@/lib/plainTextToHtml";
import { resolveCompany } from "@/lib/session";
import { resumeToPlainText } from "@/lib/tailoredResume";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import { appendUsageEntry } from "@/lib/usage";

export default function LetterPage() {
  const { state, update, patch, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

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
          companyName: resolveCompany(state) || undefined,
          tailoredResumeText: state.tailoredResume
            ? resumeToPlainText(state.tailoredResume)
            : undefined,
          apiKey: settings.apiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      patch({
        generatedSubject: data.subject ?? "",
        generatedBody: plainTextToHtml(data.body ?? ""),
      });
      if (data.usage) {
        // The running total lives in the step bar now and refreshes off the
        // event this fires, so there's nothing to hold here.
        appendUsageEntry({
          endpoint: "generate-email",
          model: data.usage.model,
          sessionId: state.id,
          usage: data.usage,
        });
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
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        subtitle="Write your outreach letter"
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

      {/* See the resume step: the content block grows so the sticky footer has
          a bottom to sit at on a page shorter than the window. */}
      <main className="app-container py-8 flex flex-1 flex-col">
        <div className="flex-1 space-y-6">
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
            {/* Same shape as the resume step: what's carried over and the one
                action on a single line, so the letter itself gets the width.
                Both sides are --recap-h tall, so the row reads as one band. */}
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-full sm:min-w-[16rem] sm:flex-1">
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
              </div>

              <button
                onClick={() => setComposerOpen(true)}
                disabled={!canGenerate || generating}
                // See the matching control on the resume page: button-sized and
                // matched to the recap card's collapsed header via --recap-h,
                // and the full width of the column on a phone, where a half-wide
                // slab under a full-width card read as an unfinished row.
                className="btn-primary h-12 w-full self-start whitespace-nowrap px-6 sm:h-[var(--recap-h)] sm:w-auto sm:shrink-0"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating…
                  </span>
                ) : state.generatedBody ? (
                  "Regenerate email"
                ) : (
                  "Generate email"
                )}
              </button>
            </div>

            {!state.matchReport && (
              <div className="glass-panel flex items-center justify-between gap-3 p-4">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  No match report yet — the letter is much stronger with one.
                </p>
                <Link href="/match" className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                  Run the analysis
                </Link>
              </div>
            )}

            {generateError && (
              <div className="rounded-lg border border-[var(--color-danger)]/20 bg-[var(--color-danger-muted)] px-4 py-3">
                <p className="text-sm text-[var(--color-danger)]">{generateError}</p>
              </div>
            )}

            {/* Keyed on the session so the rich-text editor drops its internal
                document when you switch applications. */}
            <LetterOutput
              key={state.id}
              subject={state.generatedSubject}
              body={state.generatedBody}
              onSubjectChange={(v) => update("generatedSubject", v)}
              onBodyChange={(html) => update("generatedBody", html)}
            />
          </>
        )}

        </div>

        <StepNav />
      </main>

      <GenerateEmailModal
        open={composerOpen}
        recipientName={state.recipientName}
        letterContext={state.letterContext}
        companyName={resolveCompany(state)}
        hasBody={Boolean(state.generatedBody)}
        onRecipientNameChange={(v) => update("recipientName", v)}
        onLetterContextChange={(v) => update("letterContext", v)}
        onGenerate={() => {
          setComposerOpen(false);
          void handleGenerate();
        }}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  );
}
