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

/**
 * Something true about the candidate that their uploaded document doesn't say.
 *
 * The grounding pass checks every generated line against the file you uploaded,
 * which is what makes a tailored resume defensible — and also what made an
 * incomplete resume impossible to correct. Saying "I do know PostgreSQL, it's
 * just not written down" moved the match report and nothing else: the resume
 * couldn't cite it, and the skill was pruned for having no literal support.
 *
 * A fact fixes that at the source rather than by loosening the check. It is
 * appended to the document text before indexing, so it earns a line id like any
 * other line and is held to the same standard from then on. Nothing downstream
 * needs to know it wasn't typed by the candidate's past self.
 *
 * Stored per browser rather than per application: "I know PostgreSQL" does not
 * stop being true for the next posting, and having to re-state it every time is
 * how it stops being stated at all.
 */
export type AssertedFact = {
  id: string;
  /**
   * One line, written as it would appear on a resume. "PostgreSQL", not "the
   * user says they have used PostgreSQL" — this becomes source text, and the
   * grounding pass may fall back to it verbatim.
   */
  text: string;
  /** ISO timestamp. */
  addedAt: string;
  /**
   * The application whose conversation produced it. Provenance, not scope — the
   * fact applies everywhere; this only says where it came from, so a claim you
   * don't recognise months later can be traced back.
   */
  sessionId: string;
};

export type ProposalAction = "add" | "modify" | "remove";
export type ProposalTarget = "requirement" | "standout" | "fact";

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

/**
 * Carries the claim only, not a whole AssertedFact.
 *
 * The id, the timestamp and the application it came from are minted when you
 * accept, because until then there is nothing to identify — a rejected proposal
 * should leave no trace, and a proposal that sat in the transcript holding a
 * half-filled record would be a fact that exists but was never agreed to.
 */
export type FactProposal = ProposalBase & {
  target: "fact";
  /** Always null: the chat only ever adds. Removing one is done in Your details. */
  before: null;
  after: { text: string } | null;
};

export type MatchReportProposal = RequirementProposal | StandoutProposal | FactProposal;

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
 *
 * Set by the page-fitting pass, never by the writer. Asking the model to hand
 * back everything it rejected cost output tokens proportional to the whole
 * document and was ignored outright at volume; what it left behind is derived
 * from its citations instead. See `omitted`.
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
 * Which hiring convention the document is written to.
 *
 * Not a visual theme — every shape renders through the same LaTeX template.
 * What a shape selects is the section skeleton: which sections may exist, what
 * they are titled, and what order they print in. See documentShape.ts.
 */
export type DocumentShape =
  | "resume"
  | "cv"
  | "academic"
  | "federal"
  | "legal"
  | "creative";

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
  /**
   * 0 to 10: how much this entry argues for the posting it was tailored to,
   * as judged by the writer while it was writing.
   *
   * This is what the page-fitting pass cuts by. It used to be inferred from
   * word overlap between the entry and the job description, which is a bad
   * proxy dressed up as a cheap one — it scored an open-source static analyzer
   * at zero on a posting that listed open-source work as a plus, because the
   * words did not happen to match. The model has already read both documents
   * and ranked the bullets inside each entry; asking it for one more number
   * costs nothing and replaces a guess with a judgement.
   *
   * Optional because documents generated before it existed have no ranking, and
   * discarding those would be worse than falling back.
   */
  relevance?: number;
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
  /** Source lines nothing on the page cites. See TailoredResume.omitted. */
  omitted?: string[];
  /** Roles the page-fitting pass reduced to a single line. */
  collapsed?: CollapsedEntry[];
};

export type TailoredResume = {
  shape: DocumentShape;
  /** Ordered to match the shape's spec; sections with no content are dropped. */
  sections: ResumeSection[];
  /** Null for the shapes that are never trimmed to a page count. */
  pageTarget: ResumePageTarget | null;
  /**
   * Lines of the uploaded document that nothing on the page cites.
   *
   * The record of what this tailoring left behind, derived by diffing the
   * source against every citation rather than reported by the model. The chat
   * reads it to offer material back.
   */
  omitted?: string[];
  /**
   * Entries cut whole to make the page target, kept so they can print as one
   * "Earlier:" line instead of vanishing.
   */
  collapsed?: CollapsedEntry[];
  generatedAt: string;
};

/** A role reduced to a single line: title, employer, and when. */
export type CollapsedEntry = {
  /**
   * The section it was collapsed out of, so its one line prints at the foot of
   * that section rather than wherever the last dated block happens to be. The
   * first version attached them all to whichever entries section printed last,
   * which on a resume is Education — so six collapsed jobs appeared under the
   * degrees.
   */
  sectionKey: string;
  heading: string;
  organization: string;
  startDate: string;
  endDate: string;
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

/**
 * One suspected typo in the uploaded document, offered for a decision.
 *
 * `wrong` is a token that really occurs in the extracted text and `right` is
 * within two edits of it — both enforced in proofread.verifySuggestions, so a
 * suggestion that reached here is applicable by string replacement and cannot
 * be a rewrite wearing a spellcheck's clothes.
 */
export type SpellingSuggestion = {
  /** The token as the document spells it. */
  wrong: string;
  /** What it should be. */
  right: string;
  /** A few words on why, from the model. Empty when it offered none. */
  note: string;
  /** How many times `wrong` occurs. Accepting fixes all of them. */
  count: number;
};

/**
 * One thing the document names two different ways.
 *
 * Every entry in `variants` occurs verbatim in the uploaded text and `preferred`
 * is one of them — both enforced in consistency.verifyVariants — so accepting is
 * a replacement between forms the candidate already wrote, never a new name.
 */
export type NameVariant = {
  /** Each spelling as it appears, and how often. Most frequent first. */
  variants: { text: string; count: number }[];
  /** The one to standardise on. Always present in `variants`. */
  preferred: string;
  /** A few words on what it is, from the model. */
  note: string;
};

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
  /**
   * Typos found in resumeText at upload, still awaiting a decision.
   *
   * Stored rather than held in the upload component so a reload does not throw
   * the list away — it is the only chance to fix the source before every later
   * check starts treating it as ground truth. Accepting or rejecting removes the
   * entry, so an empty list means "nothing outstanding", not "never checked".
   */
  spellingSuggestions: SpellingSuggestion[];
  /**
   * Institutions and programmes the uploaded document spells more than one way,
   * still awaiting a decision. Same lifecycle as spellingSuggestions.
   */
  nameVariants: NameVariant[];
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
  /** Ignored for the shapes that are never trimmed to a page count. */
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
