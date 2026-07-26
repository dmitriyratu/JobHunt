export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type RequirementImportance = "critical" | "important" | "nice-to-have";
export type MatchStatus = "match" | "partial" | "gap";

export type MatchReportItem = {
  id: string;
  requirement: string;
  importance: RequirementImportance;
  status: MatchStatus;
  evidence: string;
  note: string;
};

export type MatchReport = {
  items: MatchReportItem[];
  overallScore: number;
  summary: string;
  generatedAt: string;
  sourceSnapshot: {
    resumeLength: number;
    jobDescLength: number;
  };
};

export type ProposalAction = "add" | "modify" | "remove";

export type MatchReportProposal = {
  id: string;
  action: ProposalAction;
  targetItemId: string | null;
  before: MatchReportItem | null;
  after: MatchReportItem | null;
  rationale: string;
};

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
