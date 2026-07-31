"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import MatchReportView from "@/components/MatchReportView";
import ChatPanel, { ChatToggle } from "@/components/ChatPanel";
import ReportChat from "@/components/ReportChat";
import SectionHeader from "@/components/SectionHeader";
import StepNav from "@/components/StepNav";
import { useChatDock, useRegisterChat } from "@/lib/chatDock";
import { computeOverallScore } from "@/lib/matchReport";
import { ANALYSIS_RESET } from "@/lib/session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { useJobHuntState } from "@/lib/useAppState";
import { appendUsageEntry } from "@/lib/usage";
import type { ReportChatMessage } from "@/types";

export default function MatchPage() {
  const { state, setState, hydrated, commitSession } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [attachedItemId, setAttachedItemId] = useState<string | null>(null);
  // Shared with the applications rail, which is where the toggle lives.
  const { open: chatOpen, setOpen: setChatOpen, toggle: toggleChat } = useChatDock();

  useEffect(() => {
    setSettings(loadSettings());
    setSettingsLoaded(true);
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // A ref, not the `analyzing` state — setState is async and the auto-analyze
  // effect can re-run before it lands.
  const analyzingRef = useRef(false);

  const runAnalyze = useCallback(async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setState((prev) => ({
        ...prev,
        ...ANALYSIS_RESET,
        matchReport: data.report,
        detectedCompany: data.company ?? "",
        detectedJobTitle: data.jobTitle ?? "",
        detectedCompanyDomain: data.companyDomain ?? "",
      }));
      if (data.usage) {
        appendUsageEntry({
          endpoint: "analyze-match",
          model: data.usage.model,
          sessionId: state.id,
          usage: data.usage,
        });
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
    // state.id is load-bearing: without it a stale closure would file this
    // application's spend against whichever one was open when the callback
    // was created.
  }, [state.id, state.resumeText, state.jobDescription, settings, setState]);

  // Latest-ref so the auto-analyze effect doesn't depend on the callback
  // identity (which changes whenever state/settings do).
  const analyzeRef = useRef(runAnalyze);
  useEffect(() => {
    analyzeRef.current = runAnalyze;
  });

  const canAnalyze = Boolean(state.resumeText && state.jobDescription);
  const autoKey = `${state.id}|${state.resumeText.length}|${state.jobDescription.length}`;
  const autoTriedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !settingsLoaded) return; // settings load in an effect; firing earlier would use DEFAULT_SETTINGS
    if (!canAnalyze) return;
    if (state.matchReport) return;
    if (analyzingRef.current) return;
    if (autoTriedRef.current === autoKey) return;
    // Claimed synchronously, before the await — this is what makes React's
    // double-invoked effects (StrictMode) fire the analysis only once.
    autoTriedRef.current = autoKey;
    void analyzeRef.current();
  }, [hydrated, settingsLoaded, canAnalyze, state.matchReport, autoKey]);

  // Reaching the match report is what turns a page-1 draft into a real
  // application in the rail. Keyed on arrival rather than on a specific button
  // so it works however the user navigated here.
  useEffect(() => {
    if (!hydrated || !canAnalyze || state.committed) return;
    commitSession();
  }, [hydrated, canAnalyze, state.committed, commitSession]);

  // Badged on the toggle so a proposal made while the panel is closed isn't
  // stranded behind it.
  const pendingProposals = state.reportChatMessages.reduce(
    (n, m) => n + (m.proposals?.filter((p) => p.resolution === "pending").length ?? 0),
    0
  );

  useRegisterChat({
    available: state.matchReport !== null,
    label: "Refine",
    pendingCount: pendingProposals,
  });

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
        // Reports saved before standouts existed have no array here.
        let standouts = prev.matchReport.standouts ?? [];

        if (proposal.target === "standout") {
          if (proposal.action === "add" && proposal.after) {
            const after = proposal.after;
            standouts = [...standouts, after];
          } else if (proposal.action === "modify" && proposal.after) {
            const after = proposal.after;
            standouts = standouts.map((s) => (s.id === after.id ? after : s));
          } else if (proposal.action === "remove" && proposal.targetItemId) {
            const targetId = proposal.targetItemId;
            standouts = standouts.filter((s) => s.id !== targetId);
          }
        } else if (proposal.action === "add" && proposal.after) {
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
            standouts,
            // Standouts and overshoot are persuasion material, not extra fit —
            // the score still measures only what the posting asked for.
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

  if (!hydrated) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <AppHeader
        subtitle="Match report"
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

      <main className="app-container py-8">
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
          // Full width: the report is a long table of requirements and
          // evidence, and the assistant floats over it rather than taking a
          // column from it.
          <section>
            <div className="mb-2 flex items-start justify-between gap-3">
                <SectionHeader
                  step={3}
                  title="Match report"
                  subtitle="Weighted by how important each requirement is"
                />
                {/* Below lg the applications rail is hidden, and with it the
                    assistant's toggle — so it falls back to the page. */}
                {state.matchReport && (
                  <div className="lg:hidden">
                    <ChatToggle
                      label="Refine"
                      open={chatOpen}
                      pendingCount={pendingProposals}
                      onClick={toggleChat}
                    />
                  </div>
                )}
              </div>
              <MatchReportView
                report={state.matchReport}
                canAnalyze={canAnalyze}
                loading={analyzing}
                error={analyzeError}
                onAnalyze={runAnalyze}
                attachedItemId={attachedItemId}
                onAttachItem={(id) => {
                  const next = attachedItemId === id ? null : id;
                  setAttachedItemId(next);
                  // Open the panel when attaching, or the click looks inert.
                  if (next) setChatOpen(true);
                }}
              />
          </section>
        )}

        <StepNav />
      </main>

      {state.matchReport && chatOpen && (
        <ChatPanel
          title="Refine"
          subtitle="Correct or question this report"
          onClose={() => setChatOpen(false)}
        >
          <ReportChat
            report={state.matchReport}
            messages={state.reportChatMessages}
            resumeText={state.resumeText}
            jobDescription={state.jobDescription}
            apiKey={settings.apiKey}
            sessionId={state.id}
            attachedItem={
              state.matchReport.items.find((i) => i.id === attachedItemId) ??
              (state.matchReport.standouts ?? []).find((s) => s.id === attachedItemId) ??
              null
            }
            onClearAttachment={() => setAttachedItemId(null)}
            onNewMessage={handleNewChatMessage}
            onAcceptProposal={handleAcceptProposal}
            onRejectProposal={handleRejectProposal}
          />
        </ChatPanel>
      )}
    </div>
  );
}
