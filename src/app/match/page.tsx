"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MatchReportView from "@/components/MatchReportView";
import ReportChat from "@/components/ReportChat";
import SectionHeader from "@/components/SectionHeader";
import SettingsPanel from "@/components/SettingsPanel";
import { computeOverallScore } from "@/lib/matchReport";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import type { ReportChatMessage } from "@/types";

export default function MatchPage() {
  const { state, setState, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleAnalyze = useCallback(async () => {
    setAnalyzeError("");
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: state.resumeText,
          jobDescription: state.jobDescription,
          apiKey: settings.apiKey || undefined,
          modelTier: settings.modelTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setState((prev) => ({ ...prev, matchReport: data.report, reportChatMessages: [] }));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [state.resumeText, state.jobDescription, settings, setState]);

  const handleNewChatMessage = useCallback(
    (userMsg: ReportChatMessage, assistantMsg: ReportChatMessage) => {
      setState((prev) => ({
        ...prev,
        reportChatMessages: [...prev.reportChatMessages, userMsg, assistantMsg],
      }));
    },
    [setState]
  );

  const handleAcceptProposal = useCallback(
    (messageIndex: number, proposalId: string) => {
      setState((prev) => {
        const msg = prev.reportChatMessages[messageIndex];
        if (!msg?.proposals || !prev.matchReport) return prev;
        const proposal = msg.proposals.find((p) => p.id === proposalId);
        if (!proposal || proposal.resolution !== "pending") return prev;

        let items = prev.matchReport.items;
        if (proposal.action === "add" && proposal.after) {
          const after = proposal.after;
          items = [...items, after];
        } else if (proposal.action === "modify" && proposal.after) {
          const after = proposal.after;
          items = items.map((item) => (item.id === after.id ? after : item));
        } else if (proposal.action === "remove" && proposal.targetItemId) {
          const targetId = proposal.targetItemId;
          items = items.filter((item) => item.id !== targetId);
        }

        const messages = [...prev.reportChatMessages];
        messages[messageIndex] = {
          ...msg,
          proposals: msg.proposals.map((p) =>
            p.id === proposalId ? { ...p, resolution: "accepted" as const } : p
          ),
        };

        return {
          ...prev,
          matchReport: {
            ...prev.matchReport,
            items,
            overallScore: computeOverallScore(items),
          },
          reportChatMessages: messages,
        };
      });
    },
    [setState]
  );

  const handleRejectProposal = useCallback(
    (messageIndex: number, proposalId: string) => {
      setState((prev) => {
        const msg = prev.reportChatMessages[messageIndex];
        if (!msg?.proposals) return prev;
        const messages = [...prev.reportChatMessages];
        messages[messageIndex] = {
          ...msg,
          proposals: msg.proposals.map((p) =>
            p.id === proposalId ? { ...p, resolution: "rejected" as const } : p
          ),
        };
        return { ...prev, reportChatMessages: messages };
      });
    },
    [setState]
  );

  const canAnalyze = Boolean(state.resumeText && state.jobDescription);
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
        subtitle="Match report"
        canReachMatch={canAnalyze}
        canReachLetter={canReachLetter}
      />

      <SettingsPanel settings={settings} onSave={handleSettingsSave} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!canAnalyze ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Add a resume and a job description first.
            </p>
            <Link href="/" className="btn-primary inline-block px-6 py-3">
              ← Back to resume &amp; job
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section>
                <SectionHeader
                  step={3}
                  title="Match report"
                  subtitle="Weighted by how important each requirement is"
                />
                <MatchReportView
                  report={state.matchReport}
                  canAnalyze={canAnalyze}
                  loading={analyzing}
                  error={analyzeError}
                  onAnalyze={handleAnalyze}
                />
              </section>

              <section>
                <SectionHeader
                  step={4}
                  title="Refine"
                  subtitle="Chat proposes edits, you approve them"
                />
                <ReportChat
                  report={state.matchReport}
                  messages={state.reportChatMessages}
                  resumeText={state.resumeText}
                  jobDescription={state.jobDescription}
                  apiKey={settings.apiKey}
                  modelTier={settings.modelTier}
                  onNewMessage={handleNewChatMessage}
                  onAcceptProposal={handleAcceptProposal}
                  onRejectProposal={handleRejectProposal}
                />
              </section>
            </div>

            <div className="mt-8 flex flex-col items-end gap-2">
              {canReachLetter ? (
                <Link href="/letter" className="btn-primary px-6 py-3">
                  Continue to letter →
                </Link>
              ) : (
                <>
                  <button disabled className="btn-primary px-6 py-3 opacity-45 cursor-not-allowed">
                    Continue to letter →
                  </button>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Analyze a match report above to continue
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
