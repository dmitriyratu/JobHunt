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

export type AppState = {
  resumeText: string;
  resumeFilename: string;
  jobDescription: string;
  jobSource: string;
  matchReport: MatchReport | null;
  reportChatMessages: ReportChatMessage[];
  letterContext: string;
  generatedEmail: string;
  recipientName: string;
  companyName: string;
};

export const initialAppState: AppState = {
  resumeText: "",
  resumeFilename: "",
  jobDescription: "",
  jobSource: "",
  matchReport: null,
  reportChatMessages: [],
  letterContext: "",
  generatedEmail: "",
  recipientName: "",
  companyName: "",
};
