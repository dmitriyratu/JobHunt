"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import SectionHeader from "@/components/SectionHeader";
import StepNav from "@/components/StepNav";
import JobFactsPanel from "@/components/jobfacts/JobFactsPanel";
import { BASE_RESUME_EVENT, loadBaseResume, type BaseResume } from "@/lib/baseResume";
import { fileKey } from "@/lib/fileStore";
import { JOB_CHANGE_RESET } from "@/lib/session";
import { useJobHuntState } from "@/lib/useAppState";
import { useSettings } from "@/lib/useSettings";
import { appendUsageEntry } from "@/lib/usage";

/**
 * Identifies one attempt to read one posting.
 *
 * The text itself, not its length. Length was standing in for the text and is
 * wrong in exactly the case that matters most: replacing a posting with a
 * corrected copy of itself — a re-paste with a fixed typo, the same listing
 * fetched from a different URL — usually lands on the same character count, and
 * the new posting was then treated as already attempted and never read. The
 * company and the salary stayed those of the outgoing job.
 *
 * Held only for the life of the page, and only for postings actually tried, so
 * keeping whole descriptions here costs a few kilobytes and removes an entire
 * class of collision.
 */
function factsKey(sessionId: string, jobDescription: string): string {
  return `${sessionId}:${jobDescription}`;
}

/**
 * Where an application starts: the posting, and nothing else.
 *
 * This used to ask for a resume too, as step 1 of 4. It was the same question
 * every time — a resume changes a few times a year, a posting changes every
 * time — and the app already knew the answer, because each new application
 * copied the last one's text forward. The resume lives under Your Profile now
 * (see @/lib/baseResume), which is where the contact block read out of it
 * already lived.
 *
 * What remains here is the seeding: an application takes a copy of the saved
 * resume when it starts, so the analysis it produces stays an answer about the
 * document it was actually run against.
 */
export default function HomePage() {
  const { state, setState, hydrated } = useJobHuntState();
  // The facts extraction below waits on settingsLoaded: fired before the stored
  // key is read it would send none and fail for everyone using their own.
  const { settings, settingsLoaded, saveSettings } = useSettings();
  // The resume on file, and whether it has been read yet — null means "nothing
  // saved" only once the second is true, and seeding depends on telling those
  // apart.
  const [baseResume, setBaseResume] = useState<BaseResume | null>(null);
  const [baseLoaded, setBaseLoaded] = useState(false);

  useEffect(() => {
    setBaseResume(loadBaseResume());
    setBaseLoaded(true);
    // The dialog that owns the resume lives in the header, so a first upload
    // has to reach this page some other way. It seeds the open application
    // itself; this is for the draft that was already sitting here empty.
    const reload = () => setBaseResume(loadBaseResume());
    window.addEventListener(BASE_RESUME_EVENT, reload);
    return () => window.removeEventListener(BASE_RESUME_EVENT, reload);
  }, []);

  /**
   * Gives a new application its copy of the resume on file, once.
   *
   * newSession already seeds from it, so this covers the applications nothing
   * seeded: the first one in a fresh store, the replacement made when you
   * delete the last one, and the draft that was open when a first resume was
   * uploaded. Once per application, because an empty resume is also what
   * removing one leaves behind — re-seeding there would make removal impossible.
   */
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!hydrated || !baseLoaded || !state.id) return;
    if (!baseResume || state.resumeText) return;
    if (seededRef.current.has(state.id + baseResume.savedAt)) return;
    seededRef.current.add(state.id + baseResume.savedAt);
    setState((prev) => ({
      ...prev,
      resumeText: baseResume.text,
      resumeFilename: baseResume.filename,
    }));
  }, [hydrated, baseLoaded, baseResume, state.id, state.resumeText, setState]);

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

  /**
   * Reading the posting's terms, once per posting.
   *
   * Deliberately not part of loading the posting. Parsing a URL is already the
   * slowest thing on this page, and the button that says "Load Job Description"
   * should finish when the job description is loaded — not hold for a model call
   * whose entire output is optional decoration on a document you can already
   * read. So the text lands first and the panel fills in beside it.
   *
   * Failure is silent in the same spirit: the panel offers a retry and nothing
   * else changes. Nothing downstream reads these facts, so an extraction that
   * never succeeds costs the application nothing but the panel.
   */
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState("");
  const attemptedRef = useRef<Set<string>>(new Set());

  const extractFacts = useCallback(
    async (sessionId: string, jobDescription: string, key: string) => {
      setFactsLoading(true);
      setFactsError("");
      try {
        const res = await fetch("/api/extract-job-facts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobDescription, apiKey: settings.apiKey || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not read the posting's details");
        // Guarded on the posting rather than fired blind: switching applications
        // mid-call would otherwise write one posting's salary onto another's.
        setState((prev) =>
          prev.id === sessionId && prev.jobDescription === jobDescription
            ? {
                ...prev,
                jobFacts: data.facts,
                // Seeded, never overwritten. Both fields are also written by the
                // match analysis and are editable by hand on this page, and of
                // the three writers this is the only one with nothing behind it
                // — it runs first, so anything already there came from a later
                // pass or from the reader, and both outrank it.
                detectedJobTitle: prev.detectedJobTitle || (data.jobTitle ?? ""),
                detectedCompany: prev.detectedCompany || (data.company ?? ""),
              }
            : prev,
        );
        if (data.usage) {
          appendUsageEntry({
            endpoint: "extract-job-facts",
            model: data.usage.model,
            sessionId,
            usage: data.usage,
          });
        }
      } catch (err) {
        // Cleared from the attempted set so the retry button can run again.
        attemptedRef.current.delete(key);
        setFactsError(err instanceof Error ? err.message : "Could not read the posting's details");
      } finally {
        setFactsLoading(false);
      }
    },
    [settings.apiKey, setState],
  );

  // Runs for a posting that has just been loaded and for one saved before this
  // step existed, and exactly once for each: the key is the application plus the
  // text, so replacing the posting re-reads it and re-opening one does not.
  useEffect(() => {
    if (!hydrated || !settingsLoaded || !state.id) return;
    if (!state.jobDescription || state.jobFacts) return;
    const key = factsKey(state.id, state.jobDescription);
    if (attemptedRef.current.has(key)) return;
    attemptedRef.current.add(key);
    void extractFacts(state.id, state.jobDescription, key);
  }, [
    hydrated,
    settingsLoaded,
    state.id,
    state.jobDescription,
    state.jobFacts,
    extractFacts,
  ]);

  const retryFacts = useCallback(() => {
    if (!state.id || !state.jobDescription) return;
    const key = factsKey(state.id, state.jobDescription);
    attemptedRef.current.add(key);
    void extractFacts(state.id, state.jobDescription, key);
  }, [state.id, state.jobDescription, extractFacts]);

  // Drives the layout switch below, and gates the panel that only makes sense
  // once there is a posting for it to be about.
  const hasPosting = Boolean(state.jobDescription);

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
        subtitle="Job Description"
        settings={settings}
        onSettingsSave={saveSettings}
      />

      {/* See the resume step: the content block grows so the sticky footer has
          a bottom to sit at on a page shorter than the window. */}
      <main className="app-container py-8 flex flex-1 flex-col">
        {/* One column while this is still a text box to fill in, two once it
            holds a posting.

            The empty state stays narrow for the reason it always did: a lone
            input stretched across a desktop is a long way for the eye to travel.
            But once the posting is loaded the page is no longer an input — it is
            a document with terms attached, and the terms only earn a column of
            their own when there is something to put in it. Switching on content
            rather than on a breakpoint is what keeps both true. */}
        <section className={`flex-1 mx-auto w-full ${hasPosting ? "max-w-5xl" : "max-w-3xl"}`}>
          {/* Above the columns, not inside the left one. Kept in the left column
              the header pushed the posting card down and the panel beside it
              started level with the *header* — so the two cards the eye reads as
              a pair had tops 80px apart. The step number belongs to the step,
              not to one of its two columns. */}
          <SectionHeader
            step={1}
            title="Job Description"
            subtitle="Paste text, drop a link, or upload a file"
          />

          <div
            className={
              hasPosting
                ? "lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-5 lg:items-start"
                : ""
            }
          >
            <div className="min-w-0">
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
                jobTitle={state.detectedJobTitle}
                onJobTitleChange={(value) =>
                  setState((prev) => ({ ...prev, detectedJobTitle: value }))
                }
                // Hand-corrected text is a different posting as far as anything
                // downstream is concerned, so it goes through the same door the
                // loader does — reset matrix included.
                onTextEdit={(text) =>
                  setState((prev) => ({
                    ...prev,
                    jobDescription: text,
                    ...JOB_CHANGE_RESET,
                  }))
                }
              />
            </div>

            {/* Below the posting on a phone, beside it from `lg`. Beneath is the
                right order there: the panel is about the posting, and a phone
                that led with the terms would put the summary above the thing it
                summarises. */}
            {hasPosting && (
              <div className="mt-4 min-w-0 lg:mt-0">
                <JobFactsPanel
                  facts={state.jobFacts}
                  loading={factsLoading}
                  error={factsError}
                  onRetry={retryFacts}
                  onChange={(next) => setState((prev) => ({ ...prev, jobFacts: next }))}
                />
              </div>
            )}
          </div>
        </section>

        <StepNav />
      </main>
    </div>
  );
}
