"use client";

import type { ReactNode } from "react";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import LetterOutput from "@/components/LetterOutput";
import MatchReportView from "@/components/MatchReportView";
import ProposalDiffCard from "@/components/ProposalDiffCard";
import ResumeUpload from "@/components/ResumeUpload";
import SessionCard from "@/components/SessionCard";
import JobFactsAside from "@/components/jobfacts/JobFactsAside";
import { EMPTY_SESSION } from "@/lib/session";
import { FACTS_RICH } from "./jobFacts";
import { LETTER_BODY, LETTER_SUBJECT } from "./letter";
import { MATCH_REPORT } from "./matchReport";
import { POSTING_SOURCE, POSTING_TEXT, POSTING_TITLE } from "./posting";
import { FACT_PROPOSAL } from "./proposals";
import sceneManifest from "./scenes.json";

/**
 * The scenes What's new is photographed from.
 *
 * A scene is the real component, rendered against invented data — see
 * `matchReport.ts` for why the data is invented. Nothing here is a mock or a
 * copy: `MatchReportView` below is the same module the app renders, so a
 * screenshot cannot drift from the product without the product itself changing.
 *
 * Two halves, on purpose:
 *
 *  - `scenes.json` is the manifest — id, prose description, render width, and
 *    any clicks needed to reach the state worth photographing. It is plain JSON
 *    because three different things read it: this module, the screenshot
 *    script, and `scripts/release-notes.mjs`, which shows the descriptions to
 *    the model so it can pick a scene for a release note. Only the last of
 *    those can import a `.tsx`.
 *  - This module maps each id to what to render. `SceneRenderer` is typed as a
 *    total map over the manifest's ids, so adding an entry to the JSON without
 *    a renderer here fails the build rather than failing at screenshot time.
 *
 * Adding a scene when you ship a feature is the one manual step in the whole
 * pipeline. It is usually a dozen lines, and it is what lets the release note
 * for that feature carry a picture.
 */

export type SceneSpec = {
  id: string;
  /** Prose, written for the release-notes model rather than for a developer:
      it is the only thing that tells it which scene fits which change. Often
      contains guidance addressed to the model, which is why it is not reused
      as alt text. */
  description: string;
  /** What the screenshot shows, for someone who cannot see it. Describes the
      picture only — no instructions, no reference to choosing a scene. */
  alt: string;
  /**
   * CSS pixels. The stage is exactly this wide, so a screenshot does not
   * depend on the window that took it.
   *
   * Keep it close to the width the modal will show it at. A scene shot at
   * 960 and displayed in a 630px panel is rendered at two thirds scale, and
   * 11px labels — which most of this app's chrome is — stop being readable
   * before they stop being visible.
   */
  width: number;
  /** Accessible names to click, in order, before the shot — for states that
      only exist after an interaction. Empty for a scene that renders directly. */
  click: string[];
};

export const SCENES = sceneManifest as SceneSpec[];

export type SceneId = (typeof SCENES)[number]["id"];

/**
 * Callbacks are all no-ops. A scene is a photograph, not a working app: the
 * report cannot be re-analyzed and a card cannot be attached to a chat that
 * isn't there. The interactions that do matter — the filter pills — are held in
 * the component's own state and work without any of this.
 */
const noop = () => {};

const RENDERERS: Record<string, () => ReactNode> = {
  "match-report": () => (
    <MatchReportView
      report={MATCH_REPORT}
      canAnalyze={false}
      loading={false}
      error=""
      onAnalyze={noop}
      attachedItemId={null}
      onAttachItem={noop}
    />
  ),
  // Same render; the filtered state is reached by the manifest's click rather
  // than by a second copy of the props.
  "match-report-filtered": () => RENDERERS["match-report"](),

  /**
   * Both input panels are photographed empty.
   *
   * They read from the file store by key, and a scene has no store behind it —
   * so a "document already chosen" state would render its preview against a
   * file that isn't there. Empty is also the more useful picture: it is the
   * state someone is actually looking at when they need to be told what to do.
   * `fixture-*` keys are deliberately ones nothing will ever have written.
   */
  "job-description-input": () => (
    <JobDescriptionInput
      jobDescription=""
      jobSource=""
      jobSourceType=""
      fileKey="fixture-job"
      onParsed={noop}
      onClear={noop}
      jobTitle=""
      onJobTitleChange={noop}
      onTextEdit={noop}
    />
  ),

  /**
   * The other half of the panel above: a posting already loaded.
   *
   * Safe to photograph with text, unlike the empty variant's reasoning about
   * the file store — nothing here reads a stored file, because the source is a
   * URL rather than an upload.
   */
  "job-description-loaded": () => (
    <JobDescriptionInput
      jobDescription={POSTING_TEXT}
      jobSource={POSTING_SOURCE}
      jobSourceType="url"
      fileKey="fixture-job"
      onParsed={noop}
      onClear={noop}
      jobTitle={POSTING_TITLE}
      onJobTitleChange={noop}
      onTextEdit={noop}
    />
  ),

  /**
   * The terms panel, twice: as it reads and as it corrects.
   *
   * `onChange` is what decides which. Without it the panel draws no edit
   * affordance at all, so the first scene is the honest read-only picture; with
   * it, the manifest's click opens the pay editor and the second scene shows the
   * thing that cannot be photographed any other way — the pencils themselves are
   * hover-only, and a screenshot has no pointer.
   */
  "job-facts-panel": () => <JobFactsAside facts={FACTS_RICH} sticky={false} />,

  "job-facts-panel-editing": () => (
    <JobFactsAside facts={FACTS_RICH} sticky={false} onChange={noop} />
  ),

  /**
   * One card out of the applications rail, at the rail's real width.
   *
   * Built from EMPTY_SESSION rather than a fixture of its own: the card reads a
   * handful of fields out of a Session and ignores the rest, and spreading the
   * blank one means a field added to Session later can't leave this failing to
   * compile for want of a value nothing here renders.
   *
   * `updatedAt` is deliberately months old. Anything inside thirty days renders
   * as "3d ago", which counts up between the day a release is photographed and
   * the day someone reads its note — a picture that ages is a picture that
   * disagrees with the one beside it.
   */
  "application-card": () => (
    <SessionCard
      session={{
        ...EMPTY_SESSION,
        id: "fixture-session",
        committed: true,
        updatedAt: "2026-06-12T10:00:00.000Z",
        createdAt: "2026-06-12T09:00:00.000Z",
        detectedJobTitle: "Staff Software Engineer, Payments Infrastructure",
        detectedCompany: "Northwind",
        jobFacts: FACTS_RICH,
        matchReport: MATCH_REPORT,
      }}
      active={false}
      expanded={false}
      onSelect={noop}
      onDelete={noop}
    />
  ),

  "resume-upload": () => (
    <ResumeUpload resumeText="" resumeFilename="" fileKey="fixture-resume" onParsed={noop} />
  ),

  "letter-output": () => (
    <LetterOutput
      subject={LETTER_SUBJECT}
      body={LETTER_BODY}
      onSubjectChange={noop}
      onBodyChange={noop}
    />
  ),

  "fact-proposal": () => (
    <ProposalDiffCard proposal={FACT_PROPOSAL} onAccept={noop} onReject={noop} />
  ),
};

export function findScene(id: string): SceneSpec | undefined {
  return SCENES.find((scene) => scene.id === id);
}

/**
 * The stage a scene is photographed on.
 *
 * Fixed and covering the viewport so it sits outside `AppShell`'s flex row —
 * otherwise the session rail beside it would decide how wide the scene came
 * out, and the width would depend on app state rather than on the manifest.
 * Padding is deliberate: the screenshot crops to `#scene`, and a card with a
 * shadow needs a little room around it or the shadow is sliced off.
 */
export function SceneStage({ id }: { id: string }) {
  const scene = findScene(id);
  const render = RENDERERS[id];

  if (!scene || !render) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--color-surface)] p-8">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No scene called &ldquo;{id}&rdquo;. Known scenes:{" "}
          {SCENES.map((s) => s.id).join(", ")}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[var(--color-surface)] p-6">
      <div id="scene" style={{ width: scene.width }} className="mx-auto">
        {render()}
      </div>
    </div>
  );
}
