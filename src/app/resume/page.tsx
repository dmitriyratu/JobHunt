"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ChatPanel, { ChatToggle } from "@/components/ChatPanel";
import ContextRecap from "@/components/ContextRecap";
import GenerateResumeModal from "@/components/GenerateResumeModal";
import ResumeChat from "@/components/ResumeChat";
import ResumeDocumentPane from "@/components/ResumeDocumentPane";
import type { FitSummary, GroundingSummary } from "@/components/ChangeAuditModal";
import StepNav from "@/components/StepNav";
import { resumeFilename } from "@/lib/filePaths";
import { saveToDownloads } from "@/lib/saveDownload";
import { buildResumeBlob } from "@/lib/resumeDocx";
import { useChatDock, useRegisterChat } from "@/lib/chatDock";
import { applyTexProposal, renderResumeLatex } from "@/lib/resumeLatex";
import { resolveCompany } from "@/lib/session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";
import { draftToResume } from "@/lib/tailoredResume";
import { useJobHuntState } from "@/lib/useAppState";
import { useLatexCompile } from "@/lib/useLatexCompile";
import { getTaskModel } from "@/lib/models";
import { appendUsageEntry } from "@/lib/usage";
import { allowsPageTarget } from "@/lib/documentShape";
import type { DocumentShape, ResumeChatMessage } from "@/types";

export default function ResumePage() {
  const { state, update, patch, setState, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [downloading, setDownloading] = useState(false);
  // The last file written, with whether it went to a real folder — the pane
  // offers to open it, and there is nothing to open behind a browser download.
  const [saved, setSaved] = useState<{ path: string; usedFolders: boolean } | null>(null);
  // Shared with the applications rail, which is where the toggle lives.
  const { open: chatOpen, setOpen: setChatOpen, toggle: toggleChat } = useChatDock();
  const [engineHint, setEngineHint] = useState("");
  const [triageError, setTriageError] = useState("");
  const [triageNonce, setTriageNonce] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  // What the grounding pass did to the last generation, so corrections
  // aren't made silently behind the applicant. The per-line decisions are kept,
  // not just the counts: the API has always sent them and this dropped them on
  // the floor, which left "2 were put back to your own wording" with no way to
  // find out which two. See ChangeAuditModal.
  const [grounding, setGrounding] = useState<GroundingSummary | null>(null);
  // What the page-fitting pass cut to hit the length target. Reported for the
  // same reason grounding is: the document says less than the model wrote, and
  // the applicant should know before they send it.
  const [fit, setFit] = useState<FitSummary | null>(null);
  // Copied fields the uploaded document doesn't state. The only notice on the
  // pane about something that might not be true, so it is never cleared
  // silently — a regeneration resets it along with everything else.
  const [factIssues, setFactIssues] = useState<
    { where: string; field: string; value: string }[]
  >([]);

  const { resumeTex } = state;
  const compile = useLatexCompile(resumeTex, Boolean(resumeTex) && !engineHint);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Asked once on mount so a machine with no TeX engine says so up front,
  // rather than letting the first keystroke fail with what reads like a
  // problem in the document.
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/compile-latex")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && !d.available) setEngineHint(d.hint ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSettingsSave = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // --- Document triage ------------------------------------------------------

  /**
   * Reads the posting to decide resume vs CV, once per application.
   *
   * Runs on arrival rather than at generation because the answer is needed
   * before then: the tailoring route builds its section schema from the shape,
   * and the Length control only applies to one of the two. Gated on a null
   * shape, so switching between saved applications doesn't re-spend on one
   * that has already been read.
   */
  const { id: sessionId, resumeText, jobDescription, recommendedShape } = state;
  const needsTriage =
    Boolean(resumeText.trim() && jobDescription.trim()) && recommendedShape === null;

  // A failure belongs to the application it happened on. This is component
  // state and switching applications doesn't remount the page, so without the
  // reset the picker tells the next application its posting couldn't be read —
  // on an application that has no posting, and for which nothing was ever
  // requested.
  useEffect(() => {
    setTriageError("");
  }, [sessionId]);

  useEffect(() => {
    if (!hydrated || !needsTriage) return;

    let cancelled = false;
    setTriageError("");

    void (async () => {
      try {
        const res = await fetch("/api/triage-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resumeText,
            jobDescription,
            apiKey: settings.apiKey || undefined,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not pick a document type");

        patch({
          recommendedShape: data.shape,
          recommendedShapeReason: data.rationale ?? "",
          recommendedShapeConfident: data.confident !== false,
        });

        if (data.usage) {
          appendUsageEntry({
            endpoint: "triage-document",
            model: data.usage.model,
            sessionId,
            usage: data.usage,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setTriageError(err instanceof Error ? err.message : "Could not pick a document type");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // settings.apiKey is read, not depended on: it is already loaded by the
    // time this can run, and re-firing on a settings save would re-spend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, needsTriage, resumeText, jobDescription, sessionId, patch, triageNonce]);

  const handleRetryTriage = useCallback(() => {
    setTriageError("");
    setTriageNonce((n) => n + 1);
  }, []);

  // --- Generation -----------------------------------------------------------

  /**
   * Generates against an explicitly chosen shape.
   *
   * The shape is a parameter rather than read from state because it arrives
   * from the picker in the same tick this runs — a setState wouldn't have
   * landed yet, and generating against the previous shape would build the
   * document from the wrong section skeleton.
   */
  const runGenerate = useCallback(
    async (shape: DocumentShape) => {
    setGenerateError("");
    setSaved(null);
    setGrounding(null);
    setFit(null);
    setFactIssues([]);
    setGenerating(true);
    try {
      const res = await fetch("/api/tailor-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: state.resumeText,
          jobDescription: state.jobDescription,
          matchReport: state.matchReport,
          emphasis: state.resumeEmphasis || undefined,
          shape,
          pageTarget: allowsPageTarget(shape) ? state.resumePageTarget : undefined,
          // Sent so the route can typeset and measure. The page count is only
          // knowable from a compiled document, and the header is part of what
          // fills the first page, so it has to be the real profile.
          profile: settings.profile,
          apiKey: settings.apiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tailoring failed");

      // The structured draft is generated first and kept: it carries each
      // bullet's source line, which is what makes the rewrites checkable, and
      // it is what the letter step reads. The .tex is rendered from it once,
      // and is the working copy from here on.
      const resume = draftToResume(data.draft, shape, data.pageTarget ?? null);

      // The transcript's patches refer to source text that no longer exists.
      patch({
        tailoredResume: resume,
        resumeTex: renderResumeLatex(resume, settings.profile),
        resumeChatMessages: [],
        resumeSkipped: false,
        documentShape: shape,
      });

      if (data.usage) {
        appendUsageEntry({
          endpoint: "tailor-resume",
          model: data.usage.model,
          sessionId: state.id,
          usage: data.usage,
        });
      }

      // The grounding pass runs one or three calls of its own; each is
      // attributed to the model that made it rather than folded into the
      // tailoring's cost.
      for (const call of data.groundingUsage ?? []) {
        appendUsageEntry({
          endpoint: call.model === getTaskModel("repair-grounding").id
            ? "repair-grounding"
            : "verify-grounding",
          model: call.model,
          sessionId: state.id,
          usage: call.usage,
        });
      }

      // Only present when the copied-field check found something for the
      // reviewer to read.
      for (const call of data.factUsage ?? []) {
        appendUsageEntry({
          endpoint: "review-facts",
          model: call.model,
          sessionId: state.id,
          usage: call.usage,
        });
      }

      setGrounding(data.grounding ?? null);
      setFit(data.fit ?? null);
      setFactIssues(data.factIssues ?? []);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Tailoring failed");
    } finally {
      setGenerating(false);
    }
    },
    [state, settings, patch]
  );

  const handlePickShape = useCallback(
    (shape: DocumentShape) => {
      setPickerOpen(false);
      void runGenerate(shape);
    },
    [runGenerate]
  );

  const handleTexChange = useCallback(
    (next: string) => update("resumeTex", next),
    [update]
  );

  // --- Chat -----------------------------------------------------------------

  const handleNewChatMessage = useCallback(
    (userMsg: ResumeChatMessage, assistantMsg: ResumeChatMessage) =>
      setState((prev) => ({
        ...prev,
        resumeChatMessages: [...prev.resumeChatMessages, userMsg, assistantMsg],
      })),
    [setState]
  );

  const handleAcceptProposal = useCallback(
    (messageIndex: number, proposalId: string) =>
      setState((prev) => {
        const msg = prev.resumeChatMessages[messageIndex];
        if (!msg?.proposals) return prev;
        const proposal = msg.proposals.find((p) => p.id === proposalId);
        if (!proposal || proposal.resolution !== "pending") return prev;

        // The passage may have been edited since the proposal was made. Marking
        // it accepted anyway would claim a change the document never got.
        const nextTex = applyTexProposal(prev.resumeTex, proposal);
        if (nextTex === null) return prev;

        const messages = [...prev.resumeChatMessages];
        messages[messageIndex] = {
          ...msg,
          proposals: msg.proposals.map((p) =>
            p.id === proposalId ? { ...p, resolution: "accepted" as const } : p
          ),
        };

        return { ...prev, resumeTex: nextTex, resumeChatMessages: messages };
      }),
    [setState]
  );

  const handleRejectProposal = useCallback(
    (messageIndex: number, proposalId: string) =>
      setState((prev) => {
        const msg = prev.resumeChatMessages[messageIndex];
        if (!msg?.proposals) return prev;
        const messages = [...prev.resumeChatMessages];
        messages[messageIndex] = {
          ...msg,
          proposals: msg.proposals.map((p) =>
            p.id === proposalId ? { ...p, resolution: "rejected" as const } : p
          ),
        };
        return { ...prev, resumeChatMessages: messages };
      }),
    [setState]
  );

  // --- Download -------------------------------------------------------------

  /** Shared spine for both formats. */
  const saveAs = useCallback(
    async (build: () => Promise<Blob>, extension: string) => {
      setDownloading(true);
      setSaved(null);
      try {
        const blob = await build();
        const result = await saveToDownloads(
          blob,
          resolveCompany(state),
          state.detectedJobTitle,
          resumeFilename(settings.profile.fullName, extension)
        );
        setSaved(result);
      } catch (err) {
        setGenerateError(err instanceof Error ? err.message : "Could not save the file");
      } finally {
        setDownloading(false);
      }
    },
    [state, settings.profile]
  );

  const handleDownloadPdf = useCallback(() => {
    if (!compile.pdfUrl) return;
    // The bytes already on screen, not a fresh compile — you send what you
    // reviewed.
    return saveAs(() => fetch(compile.pdfUrl).then((r) => r.blob()), "pdf");
  }, [compile.pdfUrl, saveAs]);

  const handleDownloadDocx = useCallback(() => {
    if (!state.tailoredResume) return;
    const resume = state.tailoredResume;
    return saveAs(() => buildResumeBlob(resume, settings.profile), "docx");
  }, [state.tailoredResume, settings.profile, saveAs]);

  // --- Skipping -------------------------------------------------------------

  const handleSkip = useCallback(() => {
    update("resumeSkipped", true);
  }, [update]);

  const canGenerate = Boolean(state.resumeText && state.jobDescription);
  const hasResume = Boolean(state.resumeTex);
  // Badged on the toggle: a suggestion made while the panel is closed would
  // otherwise sit unseen behind it.
  const pendingProposals = state.resumeChatMessages.reduce(
    (n, m) =>
      n +
      (m.proposals?.filter(
        (p) => p.resolution === "pending" && state.resumeTex.includes(p.find)
      ).length ?? 0),
    0
  );

  useRegisterChat({ available: hasResume, label: "Refine", pendingCount: pendingProposals });

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
        subtitle="Tailor your resume"
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

      {/* A column, with the content block below set to grow.
          `sticky bottom-0` only pins while there is something to scroll, so on
          a page shorter than the window — the generating state is a spinner in
          a small panel — the footer fell back to its place in the flow and sat
          mid-screen with the min-h-dvh slack beneath it. Growing the content
          pushes the bar to the bottom, where sticky then has nothing to do. */}
      <main className="app-container py-8 flex flex-1 flex-col">
        <div className="flex-1 space-y-6">
        {!canGenerate ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              You need a resume and job description before tailoring one.
            </p>
            <Link href="/" className="btn-primary inline-block px-6 py-3">
              ← Back to resume &amp; job
            </Link>
          </div>
        ) : (
          <>
            {/* Everything that isn't the document lives on one line, so the
                document itself gets the whole width beneath it.

                items-start, not items-stretch: the recap grows tall when it is
                expanded, and a stretched button grew with it. The button is
                given the recap's *collapsed* height instead — 78px, which is
                fixed because that header is always exactly two single-line rows
                (the summary truncates rather than wrapping) inside p-5 and a
                1px border.

                On a phone the row stacks and the two controls share a line of
                their own at equal width. Wrapped, they came out ragged and
                different heights — a 44px secondary beside a 56px primary — and
                the pair read as unrelated rather than as this step's actions. */}
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

              <div className="flex w-full items-stretch gap-2 sm:w-auto">
                {/* Below lg the applications rail is hidden, and with it the
                    assistant's toggle — so it falls back to the page. */}
                {hasResume && (
                  <ChatToggle
                    label="Refine"
                    open={chatOpen}
                    pendingCount={pendingProposals}
                    onClick={toggleChat}
                    className="h-12 flex-1 sm:h-[var(--recap-h)] sm:flex-none lg:hidden"
                  />
                )}

                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={generating}
                  // Exactly as tall as the recap card's collapsed header, via the
                  // shared --recap-h. self-start rather than centred so the two
                  // stay aligned when the card is expanded and grows downwards.
                  className="btn-primary h-12 flex-1 self-start whitespace-nowrap px-6 sm:h-[var(--recap-h)] sm:flex-none"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Tailoring…
                    </span>
                  ) : hasResume ? (
                    "Regenerate resume"
                  ) : (
                    "Generate resume"
                  )}
                </button>
              </div>
            </div>

            {!state.matchReport && (
              <div className="glass-panel flex items-center justify-between gap-3 p-4">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  No match report yet — without one the tailoring is guesswork.
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

            {!hasResume && !state.resumeSkipped && (
              <p className="text-center">
                <button
                  onClick={handleSkip}
                  className="text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
                >
                  Skip this — apply with my original resume
                </button>
              </p>
            )}

            {state.resumeSkipped && !hasResume && (
              <p className="rounded-lg bg-[var(--color-surface-overlay)] px-3 py-2 text-center text-[11px] text-[var(--color-text-secondary)]">
                Skipped. The letter will argue from your original resume. Generate one any time
                to change your mind.
              </p>
            )}

            <ResumeDocumentPane
              key={state.id}
              tex={state.resumeTex}
              onTexChange={handleTexChange}
              compile={compile}
              pageTarget={
                state.documentShape && allowsPageTarget(state.documentShape)
                  ? state.resumePageTarget
                  : null
              }
              loading={generating}
              hasResume={hasResume}
              engineHint={engineHint}
              downloading={downloading}
              saved={saved}
              grounding={grounding}
              fit={fit}
              resume={state.tailoredResume}
              factIssues={factIssues}
              onDownloadPdf={handleDownloadPdf}
              onDownloadDocx={handleDownloadDocx}
            />

          </>
        )}

        </div>

        <StepNav />
      </main>

      {hasResume && chatOpen && (
        <ChatPanel
          title="Refine"
          subtitle="Ask for changes to this resume"
          onClose={() => setChatOpen(false)}
        >
          <ResumeChat
            key={state.id}
            tex={state.resumeTex}
            resume={state.tailoredResume}
            messages={state.resumeChatMessages}
            resumeText={state.resumeText}
            jobDescription={state.jobDescription}
            apiKey={settings.apiKey}
            sessionId={state.id}
            onNewMessage={handleNewChatMessage}
            onAcceptProposal={handleAcceptProposal}
            onRejectProposal={handleRejectProposal}
          />
        </ChatPanel>
      )}

      <GenerateResumeModal
        open={pickerOpen}
        profile={settings.profile}
        emphasis={state.resumeEmphasis}
        pageTarget={state.resumePageTarget}
        recommended={state.recommendedShape}
        recommendedReason={state.recommendedShapeReason}
        recommendedConfident={state.recommendedShapeConfident}
        current={state.documentShape}
        // The message itself, not a boolean: "couldn't read the posting" reads
        // as a fault in the posting whatever went wrong, when the cause is
        // usually a missing API key or a rate limit and is worth naming.
        recommendationError={triageError}
        // False when nothing was ever going to be read — no posting saved, or
        // the resume upload was skipped. Distinguished from a failure so the
        // picker doesn't sit on a spinner that will never resolve.
        recommendationPending={needsTriage}
        onRetryRecommendation={handleRetryTriage}
        // Saved as you type, so a correction made here survives whether or not
        // you go on to generate.
        onProfileChange={(profile) => handleSettingsSave({ ...settings, profile })}
        onEmphasisChange={(v) => update("resumeEmphasis", v)}
        onPageTargetChange={(v) => update("resumePageTarget", v)}
        onGenerate={handlePickShape}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
