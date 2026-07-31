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

// --- Tailored resume --------------------------------------------------------

export type ChangeResolution = "pending" | "accepted" | "rejected";

/** A tailored value beside the original it replaced. Used by keywords, whose
 * "original" is the whole set the document listed rather than a line of prose. */
export type Tailored<T> = {
  value: T;
  source: T;
};

/**
 * Written text and the lines of the uploaded document it draws on.
 *
 * A LIST, not one line, and that is the whole point. An earlier version carried
 * a single `source`, which quietly forbade the most valuable thing a writer
 * does: taking "Built the ledger pipeline" from one place and "$2B processed
 * annually" from another and making them one bullet. Both facts are the
 * candidate's, but against a single source line the second looks invented, so
 * the grounding check tore it back out. The architecture punished good writing.
 *
 * Citing several lines is therefore allowed, and the check verifies the value
 * against all of them together. What it costs is that citation itself can be
 * gamed — a bullet that cites half the resume can "support" nearly anything —
 * so the prompt caps it and the checker judges the combination rather than each
 * line in isolation.
 *
 * An empty list means nothing was cited. That is not a licence: it is treated
 * as unverifiable and reported, never silently accepted.
 */
export type Grounded = {
  value: string;
  sources: string[];
};

/**
 * `dropped` keeps a bullet in the data with its sources intact rather than
 * deleting it. The rendered document omits it, so this record is the only thing
 * that knows it existed — and the only way the chat can offer to put it back.
 */
export type ResumeBullet = Grounded & {
  id: string;
  dropped: boolean;
};

/**
 * Skills under a short category label ("Languages", "Infrastructure").
 *
 * Grouped rather than one flat run because a single comma-joined line of
 * twenty skills is a wall a reader skips. The label is the only text the model
 * writes here — the skills themselves still have to come from the resume.
 */
export type ResumeSkillGroup = {
  label: string;
  items: string[];
};

/**
 * Which document is being produced. See @/lib/documentShape — the shape picks
 * a fixed list of sections, their titles and their order.
 */
export type DocumentShape = "resume" | "cv";

/** How a section's content is laid out. */
export type SectionLayout = "prose" | "keywords" | "entries" | "list";

/**
 * A dated thing under a section heading: a job, a degree, a research post, a
 * committee seat. One type for all of them, because they render identically
 * and differ only in which section they sit under.
 *
 * Everything except `bullets` is copied verbatim from the uploaded document and
 * never tailored — inventing or "improving" a title, an employer or a date is
 * misrepresentation, not emphasis.
 */
export type ResumeEntry = {
  id: string;
  /** Job title, degree, or project name depending on the section. */
  heading: string;
  /** Employer, institution, lab. */
  organization: string;
  location: string;
  /** Display strings exactly as the source wrote them, e.g. "Mar 2021". */
  startDate: string;
  endDate: string;
  bullets: ResumeBullet[];
};

/**
 * One filled-in section — exactly the content its layout calls for, and nothing
 * else.
 *
 * The model returns one of four variants (see the union schema in
 * /api/tailor-resume) so a publications list is `{key, items}` rather than that
 * plus three empty fields it will never use. Everything but `key` is therefore
 * optional here, and readers default what they need.
 */
export type ResumeSection = {
  key: string;
  prose?: Grounded;
  keywords?: Tailored<ResumeSkillGroup[]>;
  entries?: ResumeEntry[];
  items?: string[];
};

/**
 * What the model returns. Identical to what gets stored — there is no longer a
 * client-side pass that adds fields, so the two are one type.
 */
export type ResumeDraft = {
  sections: ResumeSection[];
};

export type TailoredResume = {
  shape: DocumentShape;
  /** Ordered to match the shape's spec; sections with no content are dropped. */
  sections: ResumeSection[];
  /** Null for a CV, which is never trimmed to a page count. */
  pageTarget: ResumePageTarget | null;
  generatedAt: string;
};

export type ResumePageTarget = 1 | 2;

/**
 * A chat-proposed edit to the LaTeX source, as a find-and-replace patch.
 *
 * Once the .tex is the working copy the old structured proposals — "reword
 * bullet b3 of entry e2" — no longer address anything: hand-editing the source
 * invalidates every id the model was given. A patch is addressed by content
 * instead, which survives arbitrary edits elsewhere in the document.
 *
 * `find` must occur EXACTLY ONCE in the current source. The route checks this
 * and discards anything else, which is the enforceable replacement for the id
 * validation it used to do: a patch that matches twice would silently edit a
 * place the user never saw, and one that matches nothing would apply as a
 * no-op while reporting success.
 */
export type ResumeTexProposal = {
  id: string;
  /** Where this lands, e.g. "Summary" or "Shopify, second bullet" — for the card. */
  location: string;
  /** The exact current text being replaced. Shown as the "now" side of the diff. */
  find: string;
  /** Its replacement. Empty removes the matched text. */
  replace: string;
  rationale: string;
};

export type ResolvedResumeTexProposal = ResumeTexProposal & {
  resolution: ChangeResolution;
};

export type ResumeChatMessage = ChatMessage & {
  proposals?: ResolvedResumeTexProposal[];
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

  // Resume
  tailoredResume: TailoredResume | null;
  /**
   * The LaTeX document, and the working copy from the moment it is first
   * rendered.
   *
   * `tailoredResume` stays alongside it as provenance — it is what carries each
   * bullet's `source` line, and what the letter step reads — but it is no
   * longer what gets printed. Regenerating rebuilds this from a fresh draft and
   * discards hand edits; nothing else overwrites it wholesale.
   */
  resumeTex: string;
  resumeChatMessages: ResumeChatMessage[];
  /**
   * Set when the applicant chose to apply with their original resume. Distinct
   * from "not generated yet": it is a decision, and the journey nav stops
   * asking once it is made.
   */
  resumeSkipped: boolean;
  /**
   * The format the applicant chose in the picker. Null until they have.
   *
   * Separate from `recommendedShape` on purpose: keeping the machine's answer
   * and the human's answer in different fields means an override survives, and
   * the recommendation is still there to show next to it.
   */
  documentShape: DocumentShape | null;
  /**
   * What /api/triage-document read off the posting. Null until it has run.
   * Seeds the picker's default selection; never overwrites a choice already
   * made.
   */
  recommendedShape: DocumentShape | null;
  /** One sentence naming the evidence, so the recommendation isn't a black box. */
  recommendedShapeReason: string;
  /** False when the posting could genuinely have gone either way. */
  recommendedShapeConfident: boolean;
  /** Free-text steer for the tailoring, the resume's answer to letterContext. */
  resumeEmphasis: string;
  /** Ignored for a CV, which is never trimmed to a page count. */
  resumePageTarget: ResumePageTarget;

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
