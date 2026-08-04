"use client";

import { useCallback, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ConfirmDetailsModal from "@/components/ConfirmDetailsModal";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import NameVariantReview from "@/components/NameVariantReview";
import ResumeUpload from "@/components/ResumeUpload";
import SectionHeader from "@/components/SectionHeader";
import SpellingReview from "@/components/SpellingReview";
import StepNav from "@/components/StepNav";
import { applyVariant, applyVariants } from "@/lib/consistency";
import { seedProfile, type SeededField } from "@/lib/contactExtract";
import { fileKey } from "@/lib/fileStore";
import { applySuggestion, applySuggestions } from "@/lib/proofread";
import { JOB_CHANGE_RESET, RESUME_CHANGE_RESET } from "@/lib/session";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type ResumeProfile,
} from "@/lib/settings";
import { appendUsageEntry } from "@/lib/usage";
import { useJobHuntState } from "@/lib/useAppState";
import type { NameVariant, Session, SpellingSuggestion } from "@/types";

export default function HomePage() {
  const { state, setState, hydrated } = useJobHuntState();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  // Which proofread row is being looked at, so the preview can mark it. Not in
  // the session: it is where the eye is, not part of the application.
  const [highlight, setHighlight] = useState("");
  // What the last upload read out of the resume, waiting to be confirmed. Null
  // whenever there is nothing to ask about, which is the usual case on a
  // re-upload — the profile is already filled in by then.
  const [pendingDetails, setPendingDetails] = useState<{
    profile: ResumeProfile;
    found: SeededField[];
    filename: string;
  } | null>(null);

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
    async (text: string, filename: string) => {
      // Read before the text is committed, so the document and everything found
      // in it arrive together. This is also the only moment the checks CAN run:
      // from here on the text is ground truth, and every later check is asking
      // whether the tailored document matches it rather than whether it is
      // right. Silent on failure — an upload must never fail because a
      // proofread did — and awaited either way, so the upload card does not
      // claim to be finished while this is still going.
      let findings: { suggestions?: unknown[]; nameVariants?: unknown[] } = {};
      try {
        const res = await fetch("/api/proofread-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, apiKey: settings.apiKey || undefined }),
        });
        const data = await res.json();
        if (res.ok) {
          findings = data;
          if (data.usage) {
            appendUsageEntry({
              endpoint: "proofread-resume",
              model: data.usage.model,
              sessionId: state.id,
              usage: data.usage,
            });
          }
        }
      } catch {
        /* an upload that works beats a proofread that does */
      }

      setState((prev) => ({
        ...prev,
        resumeText: text,
        resumeFilename: filename,
        spellingSuggestions: (findings.suggestions ?? []) as Session["spellingSuggestions"],
        nameVariants: (findings.nameVariants ?? []) as Session["nameVariants"],
        ...(text !== prev.resumeText ? RESUME_CHANGE_RESET : {}),
      }));

      // Fills only blanks, so this is safe to run on every upload — a value
      // you corrected by hand always outranks the regex. Nothing is saved yet:
      // the contact block is the one part of a generated resume the model never
      // writes, and it is read from the part of a PDF that extraction mangles
      // most, so it goes past the user first. Asked on every upload that had a
      // contact block to read, not only one that filled a blank — a new resume
      // is exactly when a details change comes in, and the second upload of the
      // day fills nothing precisely because the first one already did.
      const seeded = seedProfile(settings.profile, text);
      if (seeded.detected) {
        setPendingDetails({ profile: seeded.profile, found: seeded.filled, filename });
      }
    },
    [setState, settings.apiKey, settings.profile, state.id],
  );

  const handleConfirmDetails = useCallback((profile: ResumeProfile) => {
    setPendingDetails(null);
    setSettings((prev) => {
      const next = { ...prev, profile };
      saveSettings(next);
      return next;
    });
  }, []);

  /**
   * A typo fix, applied to the extracted text.
   *
   * Editing resumeText is editing the source of truth, so this carries the same
   * consequence a re-upload does: anything already built from the old wording
   * was built from a document that no longer exists. In the normal flow that
   * costs nothing — the list appears at upload, before there is an analysis to
   * lose.
   */
  const handleAcceptSpelling = useCallback(
    (suggestion: SpellingSuggestion) => {
      // The word is about to stop existing; a mark pointing at it would have
      // nothing to point at.
      setHighlight((prev) => (prev === suggestion.wrong ? "" : prev));
      setState((prev) => ({
        ...prev,
        resumeText: applySuggestion(prev.resumeText, suggestion),
        spellingSuggestions: prev.spellingSuggestions.filter(
          (s) => s.wrong !== suggestion.wrong
        ),
        ...RESUME_CHANGE_RESET,
      }));
    },
    [setState]
  );

  const handleAcceptAllSpelling = useCallback(() => {
    setHighlight("");
    setState((prev) => ({
      ...prev,
      resumeText: applySuggestions(prev.resumeText, prev.spellingSuggestions),
      spellingSuggestions: [],
      ...RESUME_CHANGE_RESET,
    }));
  }, [setState]);

  // Rejecting touches nothing but the list. The word was already what the
  // candidate wrote.
  const handleRejectSpelling = useCallback(
    (suggestion: SpellingSuggestion) => {
      setState((prev) => ({
        ...prev,
        spellingSuggestions: prev.spellingSuggestions.filter(
          (s) => s.wrong !== suggestion.wrong
        ),
      }));
    },
    [setState]
  );

  const handleRejectAllSpelling = useCallback(() => {
    setHighlight("");
    setState((prev) => ({ ...prev, spellingSuggestions: [] }));
  }, [setState]);

  // Same shape as the typo handlers, and the same consequence: unifying a name
  // rewrites the extracted text, which is the document every later check reads.
  const handleAcceptVariant = useCallback(
    (issue: NameVariant) => {
      setHighlight("");
      setState((prev) => ({
        ...prev,
        resumeText: applyVariant(prev.resumeText, issue),
        nameVariants: prev.nameVariants.filter((v) => v.preferred !== issue.preferred),
        ...RESUME_CHANGE_RESET,
      }));
    },
    [setState]
  );

  const handleAcceptAllVariants = useCallback(() => {
    setHighlight("");
    setState((prev) => ({
      ...prev,
      resumeText: applyVariants(prev.resumeText, prev.nameVariants),
      nameVariants: [],
      ...RESUME_CHANGE_RESET,
    }));
  }, [setState]);

  const handleRejectVariant = useCallback(
    (issue: NameVariant) => {
      setState((prev) => ({
        ...prev,
        nameVariants: prev.nameVariants.filter((v) => v.preferred !== issue.preferred),
      }));
    },
    [setState]
  );

  const handleRejectAllVariants = useCallback(() => {
    setHighlight("");
    setState((prev) => ({ ...prev, nameVariants: [] }));
  }, [setState]);

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
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        subtitle="Resume & job description"
        settings={settings}
        onSettingsSave={handleSettingsSave}
      />

      {/* See the resume step: the content block grows so the sticky footer has
          a bottom to sit at on a page shorter than the window. */}
      <main className="app-container py-8 flex flex-1 flex-col">
        {/* Two columns when there is room for two, one when there isn't —
            decided by the width this block actually has rather than by the
            width of the window. `lg:grid-cols-2` was reading the viewport, and
            on a landscape tablet the applications rail took 320px out of that
            viewport after the fact: the columns came out 316px each, narrower
            than the single column the same tablet gets held upright. */}
        <div className="auto-grid [--col-min:26rem] flex-1 gap-6 items-start content-start">
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
              highlight={highlight}
              onParsed={handleResumeParsed}
              onClear={() =>
                setState((prev) => ({
                  ...prev,
                  resumeText: "",
                  resumeFilename: "",
                  spellingSuggestions: [],
                  nameVariants: [],
                  ...RESUME_CHANGE_RESET,
                }))
              }
            />
            <SpellingReview
              suggestions={state.spellingSuggestions}
              resumeText={state.resumeText}
              selected={highlight}
              onSelect={(s) => setHighlight(s.wrong)}
              onAccept={handleAcceptSpelling}
              onReject={handleRejectSpelling}
              onAcceptAll={handleAcceptAllSpelling}
              onRejectAll={handleRejectAllSpelling}
            />
            <NameVariantReview
              issues={state.nameVariants}
              selected={highlight}
              onSelect={setHighlight}
              onAccept={handleAcceptVariant}
              onReject={handleRejectVariant}
              onAcceptAll={handleAcceptAllVariants}
              onRejectAll={handleRejectAllVariants}
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

      <ConfirmDetailsModal
        open={pendingDetails !== null}
        filename={pendingDetails?.filename ?? ""}
        found={pendingDetails?.found ?? []}
        profile={pendingDetails?.profile ?? settings.profile}
        shape={state.documentShape ?? state.recommendedShape}
        onConfirm={handleConfirmDetails}
        onDismiss={() => setPendingDetails(null)}
      />
    </div>
  );
}
