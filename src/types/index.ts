export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RequirementImportance = "critical" | "important" | "nice-to-have";
export type MatchStatus = "match" | "partial" | "gap";

/**
 * How far past the bar you clear a requirement you already match.
 *
 * `status` alone is binary, so someone with 12 years and someone with 5.1
 * both land on "match" against a "5+ years" requirement. That flattening lost
 * the single most persuasive thing about a candidate, so overshoot is tracked
 * separately. Only meaningful when status is "match"; normalised to "meets"
 * otherwise.
 */
export type RequirementStrength = "meets" | "exceeds";

export type MatchReportItem = {
  id: string;
  requirement: string;
  importance: RequirementImportance;
  status: MatchStatus;
  strength: RequirementStrength;
  evidence: string;
  note: string;
};

/**
 * Something genuinely rare or highly prized in the candidate's background that
 * the posting never asked for.
 *
 * Requirements flow job-description → resume, so anything the posting didn't
 * think to ask about (a patent, a founded company, a widely used open-source
 * project) had no representation at all. Standouts are the reverse channel.
 */
export type StandoutItem = {
  id: string;
  /** The credential itself, stated plainly. */
  credential: string;
  /** Supporting evidence drawn from the resume — never invented. */
  evidence: string;
  /** Why a hiring team would prize it, even unasked. */
  whyValuable: string;
};

export type MatchReport = {
  items: MatchReportItem[];
  /** May be absent on reports saved before standouts existed — read via `?? []`. */
  standouts: StandoutItem[];
  overallScore: number;
  summary: string;
  generatedAt: string;
  sourceSnapshot: {
    resumeLength: number;
    jobDescLength: number;
  };
};

/** A report entry the chat can be asked about — a requirement or a standout. */
export type ReportEntry = MatchReportItem | StandoutItem;

export type ProposalAction = "add" | "modify" | "remove";
export type ProposalTarget = "requirement" | "standout";

type ProposalBase = {
  id: string;
  action: ProposalAction;
  targetItemId: string | null;
  rationale: string;
};

export type RequirementProposal = ProposalBase & {
  target: "requirement";
  before: MatchReportItem | null;
  after: MatchReportItem | null;
};

export type StandoutProposal = ProposalBase & {
  target: "standout";
  before: StandoutItem | null;
  after: StandoutItem | null;
};

export type MatchReportProposal = RequirementProposal | StandoutProposal;

export type ResolvedProposal = MatchReportProposal & {
  resolution: "pending" | "accepted" | "rejected";
};

export type ReportChatMessage = ChatMessage & {
  proposals?: ResolvedProposal[];
};

export type JobSourceType = "file" | "url" | "text" | "";

export type Session = {
  // Metadata — owned by the store, never written directly by callers.
  id: string;
  createdAt: string;
  updatedAt: string;
  /**
   * False while this is still a scratch draft on page 1. Drafts are hidden
   * from the applications rail and only become real entries once the user
   * advances to the match report.
   */
  committed: boolean;

  // Source material
  resumeText: string;
  resumeFilename: string;
  jobDescription: string;
  jobSource: string;
  jobSourceType: JobSourceType;

  // Analysis
  matchReport: MatchReport | null;
  reportChatMessages: ReportChatMessage[];
  /** Written only by analyze-match — derived, not user-editable. */
  detectedCompany: string;
  detectedJobTitle: string;
  /** Bare domain (e.g. "netflix.com") used to fetch the company logo. */
  detectedCompanyDomain: string;

  // Letter
  letterContext: string;
  recipientName: string;
  /** Manual fallback, used only when detectedCompany is empty. */
  companyName: string;
  generatedSubject: string;
  /** HTML (TipTap) */
  generatedBody: string;
};
