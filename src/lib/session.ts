import type { Session } from "@/types";

export function createSession(carryOver?: Partial<Session>): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    committed: false,
    resumeText: "",
    resumeFilename: "",
    jobDescription: "",
    jobSource: "",
    jobSourceType: "",
    jobFacts: null,
    tailoredResume: null,
    resumeTex: "",
    resumeChatMessages: [],
    resumeSkipped: false,
    documentShape: null,
    recommendedShape: null,
    recommendedShapeReason: "",
    recommendedShapeConfident: true,
    resumeEmphasis: "",
    resumePageTarget: 1,
    matchReport: null,
    reportChatMessages: [],
    detectedCompany: "",
    detectedJobTitle: "",
    detectedCompanyDomain: "",
    letterContext: "",
    recipientName: "",
    companyName: "",
    generatedSubject: "",
    generatedBody: "",
    ...carryOver,
  };
}

// Stable identity pre-hydration — a fresh object each render would churn
// every consumer's useCallback/useEffect dependency arrays on first paint.
export const EMPTY_SESSION: Session = Object.freeze({
  id: "",
  createdAt: "",
  updatedAt: "",
  committed: false,
  resumeText: "",
  resumeFilename: "",
  jobDescription: "",
  jobSource: "",
  jobSourceType: "" as const,
  jobFacts: null,
  tailoredResume: null,
  resumeTex: "",
  resumeChatMessages: [],
  resumeSkipped: false,
  documentShape: null,
  recommendedShape: null,
  recommendedShapeReason: "",
  recommendedShapeConfident: true,
  resumeEmphasis: "",
  resumePageTarget: 1 as const,
  matchReport: null,
  reportChatMessages: [],
  detectedCompany: "",
  detectedJobTitle: "",
  detectedCompanyDomain: "",
  letterContext: "",
  recipientName: "",
  companyName: "",
  generatedSubject: "",
  generatedBody: "",
});

// --- Reset matrix -----------------------------------------------------------
// Navigation never resets anything. Only a genuine submit on a page
// invalidates the pages after it.

/** Resume changed: the analysis and everything built on it is stale. */
export const RESUME_CHANGE_RESET = {
  matchReport: null,
  reportChatMessages: [],
  tailoredResume: null,
  resumeTex: "",
  resumeChatMessages: [],
  generatedSubject: "",
  generatedBody: "",
} satisfies Partial<Session>;

/** Job changed: the above, plus everything job-identity-specific. */
export const JOB_CHANGE_RESET = {
  ...RESUME_CHANGE_RESET,
  // A different posting is a fresh decision about whether to tailor at all.
  resumeSkipped: false,
  // The recommendation is read off the posting, so a new posting has to be
  // re-read — and the format the user picked for the old one no longer stands.
  // Deliberately absent from RESUME_CHANGE_RESET: uploading a different resume
  // doesn't change what this employer expects to receive.
  documentShape: null,
  recommendedShape: null,
  recommendedShapeReason: "",
  recommendedShapeConfident: true,
  detectedCompany: "",
  detectedJobTitle: "",
  detectedCompanyDomain: "",
  companyName: "",
  recipientName: "",
  letterContext: "",
  resumeEmphasis: "",
  // Read off the outgoing posting, so they say nothing about the new one. Left
  // standing they would be the most confident-looking thing on the page and the
  // only stale one: a salary from a job you are no longer looking at.
  jobFacts: null,
} satisfies Partial<Session>;

/**
 * Report replaced: chat proposals reference item ids that no longer exist, and
 * the tailored resume was built from the outgoing report's weighting.
 */
export const ANALYSIS_RESET = {
  reportChatMessages: [],
  tailoredResume: null,
  resumeTex: "",
  resumeChatMessages: [],
  generatedSubject: "",
  generatedBody: "",
} satisfies Partial<Session>;

// --- Derived display helpers ------------------------------------------------

export function resolveCompany(session: Session): string {
  return session.detectedCompany.trim() || session.companyName.trim();
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function sessionTitle(session: Session): string {
  const title = session.detectedJobTitle.trim();
  const company = resolveCompany(session);
  if (title && company) return `${title} · ${company}`;
  if (title) return title;
  if (company) return company;

  // Before analysis runs there's no title/company yet. The job description's
  // first line is usually the posting's own headline ("Machine Learning
  // Scientist 5 — Netflix"), which beats a bare host like "linkedin.com".
  const firstLine = session.jobDescription.split("\n").map((l) => l.trim()).find(Boolean);
  if (firstLine) return firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;

  if (session.jobSourceType === "url") {
    const host = hostnameOf(session.jobSource);
    if (host) return host;
  }
  if (session.jobSource.trim()) return session.jobSource.trim();

  return "New application";
}

export type SessionStage = "draft" | "analyzed" | "tailored" | "letter";

// Checked in reverse journey order: the stage is how far you got, so the
// furthest artefact wins even if you doubled back and skipped one.
export function sessionStage(session: Session): SessionStage {
  if (session.generatedBody) return "letter";
  if (session.tailoredResume) return "tailored";
  if (session.matchReport) return "analyzed";
  return "draft";
}

export const STAGE_LABEL: Record<SessionStage, string> = {
  draft: "Draft",
  analyzed: "Analyzed",
  tailored: "Resume ready",
  letter: "Letter drafted",
};

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
