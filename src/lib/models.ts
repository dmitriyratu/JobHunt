/**
 * Model choice is a property of the *task*, not a user preference.
 *
 * Each of the three AI calls has a different job, and they don't need the same
 * amount of intelligence. Picking per task means the app makes one considered
 * decision per endpoint instead of asking the user to guess a single global
 * setting that has to be right for all three at once.
 */
export type TaskId =
  | "proofread-resume"
  | "triage-document"
  | "extract-job-facts"
  | "analyze-match"
  | "report-chat"
  | "tailor-resume"
  | "verify-grounding"
  | "repair-grounding"
  | "review-facts"
  | "resume-chat"
  | "generate-email";

export type ModelPricing = {
  /** $ per 1,000,000 input (prompt) tokens */
  input: number;
  /** $ per 1,000,000 output (completion) tokens */
  output: number;
};

type ModelSpec = {
  id: string;
  label: string;
  pricing: ModelPricing;
  /** The 5.6 reasoning line only accepts the default temperature (1). */
  supportsTemperature: boolean;
  /**
   * Whether the model thinks before it answers. Reasoning tokens are billed as
   * output and spend the completion budget, so this changes both the cost of a
   * call and how much room it needs — see completionBudget.
   */
  reasoning: boolean;
};

// Verified directly against the live OpenAI API (model id + a real
// chat.completions call), not just the pricing page. Re-check current $/1M
// rates at platform.openai.com/pricing periodically — they change.
const CATALOG = {
  smart: {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    pricing: { input: 5, output: 30 },
    supportsTemperature: false,
    reasoning: true,
  },
  standard: {
    id: "gpt-5.4",
    label: "GPT-5.4",
    pricing: { input: 2.5, output: 15 },
    supportsTemperature: true,
    reasoning: false,
  },
  fast: {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    pricing: { input: 0.75, output: 4.5 },
    supportsTemperature: true,
    reasoning: false,
  },
} satisfies Record<string, ModelSpec>;

export type TaskModel = ModelSpec & {
  /** Human name for this step, for the settings and usage screens. */
  task: string;
  /**
   * Why this model, in the user's terms — printed in Settings.
   *
   * THIS IS CUSTOMER-FACING COPY, and the evidence behind a tier is not. Say
   * what the step does for their document and why it is worth what it costs.
   * Do not say what a model got wrong, that one contradicted itself, or how a
   * bake-off went: someone reading it is deciding whether to trust the output,
   * and an account of models misbehaving is an argument against trusting it,
   * whichever model won.
   *
   * The measurements belong in the comment above each entry, where the next
   * person to reopen the decision will look for them.
   */
  why: string;
};

export const TASK_MODELS = {
  // Reads the uploaded document once, at upload, for misspellings the candidate
  // typed. Nothing downstream can do this: every later check asks whether the
  // tailored document matches the upload, so a typo in the upload is the right
  // answer to every question the app knows how to ask.
  //
  // Not the cheap model, and the gap is in the one place that matters. Measured
  // on a real clinical CV with five misspellings planted in words the document
  // actually contains: fast found three, twice running; standard found four.
  // The two fast missed included "Ketering" inside "Memorial Sloan Ketering
  // Cancer Center" — a proper noun, in an employer name, which is exactly the
  // class of field that gets copied character-for-character into the finished
  // document and that no later check can question. A typo in prose is
  // embarrassing; a typo in the employer's name is the document being wrong
  // about where someone worked.
  //
  // Neither tier produced a single false positive on the untouched CV, so this
  // is buying recall, not restraint. Restraint comes from the prompt and from
  // verifySuggestions. Half a cent, once per upload.
  "proofread-resume": {
    ...CATALOG.standard,
    task: "Resume proofread",
    why: "Reads your uploaded resume once for typos, and for institutions spelled more than one way, and offers each as something to accept or reject. A misspelling in an employer's name is copied straight through to the finished document, so this one runs on a stronger model.",
  },

  // One question with two answers, decided from the opening of each document:
  // does this posting expect a resume or an academic/clinical CV? The signals
  // are explicit words — "residency", "tenure-track", "publications" — not
  // anything that needs reasoning about, so the smallest model reads them as
  // well as a larger one would.
  "triage-document": {
    ...CATALOG.fast,
    task: "Document triage",
    why: "Decides whether the posting wants a resume or a CV. One question read off explicit signals in the posting, so it runs on the cheapest model.",
  },

  // Copies ten stated facts out of the posting — pay, location, setup, dates.
  // Transcription, not judgement: every field is either sitting in the text or
  // is left empty, and the one call worth making is the refusal to guess, which
  // is a prompt instruction rather than something a bigger model does better.
  //
  // The cheapest tier for the further reason that this runs on every posting
  // that loads, including the ones abandoned thirty seconds later, and it is the
  // first spend an application incurs. A step that fires before the user has
  // decided they care should cost about a tenth of a cent.
  "extract-job-facts": {
    ...CATALOG.fast,
    task: "Posting terms",
    why: "Reads the pay, location, setup and dates out of the posting so they sit beside it and on the application card. It only ever copies what the posting states — anything it doesn't say is shown as not stated — so it runs on the cheapest model.",
  },

  // The analytical core: reads the full resume and job description, decides
  // which requirements matter and how much, and judges the evidence for each.
  //
  // Runs on the fast model on measured evidence, not on a hunch. Across 8
  // resume-by-posting pairs (2 genuine fits, 6 deliberate mismatches) the fast
  // model separated good fits from bad ones identically to the strong one
  // (61.0 vs 61.2 points), grounded its extracted requirements in the posting
  // slightly better (0.94 vs 0.91), matched it on run-to-run stability, and
  // extracted company and job title identically on every run — at 3.6x less
  // cost and half the latency on the step that blocks the whole flow.
  //
  // Known trade: it is a little stingier with partial credit, occasionally
  // passing on a transferable skill the strong model would have credited.
  "analyze-match": {
    ...CATALOG.fast,
    task: "Match analysis",
    why: "Reads your whole resume and the posting, then weighs every requirement and judges the evidence for each. The fast model handles this as well as anything pricier, so the step that gates the rest stays quick.",
  },

  // The analysis is already done by the time this runs. The model is applying
  // a correction the user stated in plain words to an existing JSON structure
  // — small context, short reply, mechanical edit.
  "report-chat": {
    ...CATALOG.fast,
    task: "Refine chat",
    why: "Applies a correction you've already stated to a report that's already been analysed. Short and mechanical, so it runs on the cheap model.",
  },

  // The most demanding step in the app, and still the cheap model — measured,
  // not assumed, because it is the obvious place to want a better writer.
  //
  // Over 8 generations per tier from one resume and posting, fast and standard
  // were level on everything that can be counted: bullets kept (11.3 vs 11.8),
  // lines reverted by the grounding check (2.3 vs 2.0), and the two that matter
  // most — how often it welds two of the candidate's own lines into one bullet
  // (4.8 vs 3.0) and how many of the source's stranded figures survive into the
  // document (3.0/4 vs 2.8/4). Fast leads both, at two thirds the price and the
  // same latency.
  //
  // Blind pairwise judging agrees, and it was run on the case built to break
  // the cheap model: a career-changer whose evidence is buried mid-sentence in
  // descriptive bullets rather than stranded on its own line. Every pair judged
  // in both orders, and the judge was order-consistent throughout. On the clean
  // resume the two tiers tie 4-4 over 8 judgements. On the hard one fast takes
  // it 6-2.
  //
  // Read the judge's reasons rather than the tally: standard loses by
  // generalising. It reduces a quantified outcome to a description and drops
  // "less relevant" detail that was the candidate's best evidence. Fast keeps
  // the concrete thing on the page. That is the opposite of what more
  // capability was supposed to buy, and it is the whole case for this line.
  //
  // The reasoning tier is not an option here at all: gpt-5.6-sol exhausted a
  // 12,000-token completion budget on reasoning alone in 5 of 7 attempts, and
  // the 2 that answered returned a document with no bullets in it.
  //
  // Worth knowing before anyone re-opens this: the first version of the judge
  // harness ran both generations concurrently against the same shared model
  // entry, so one overwrote the other's model and it compared a tier against
  // itself. It reported 4-2 for standard. Change the tier on this evidence, not
  // on that number.
  "tailor-resume": {
    ...CATALOG.fast,
    task: "Resume tailoring",
    why: "Rewrites and reorders the lines you already wrote so they answer this posting. The fast model is the best of the three here at combining your own lines and keeping your numbers on the page, so the longest step is also a cheap one.",
  },

  // The one place cheap intelligence measurably failed.
  //
  // This used to run on the fast model, justified by the plausible argument
  // that each judgement is local and short. Never tested. An audit of thirteen
  // decisions across three documents found eleven of them wrong — and wrong in
  // the most expensive direction, deleting a $430,000 saving, a pair of
  // build-time figures and an EMEA remit that were sitting verbatim in the very
  // lines the checker had been shown. One rewrote "on-call rotation owner" down
  // to "participated in", making the document less true than the resume it came
  // from.
  //
  // The failure mode was not strictness. Replayed head to head, the fast model
  // files NON-findings into the findings array — reasons ending "omission is
  // allowed, so no issue" and "No finding." — which every caller downstream
  // reads as a violation. It reasons correctly and puts the answer in the wrong
  // box, and a tightened prompt did not fix it. The standard model produced
  // four findings across the same documents, every one defensible, with no
  // self-contradiction; the reasoning tier was sharper still but missed things
  // the standard model caught, at three and a half times the price.
  //
  // Three tenths of a cent per document. Set against reverting a candidate's
  // best number, it is not a close call.
  "verify-grounding": {
    ...CATALOG.standard,
    task: "Grounding check",
    why: "Reads every rewritten line against the lines it came from, so nothing on the page claims more than your document supports. This is the check that decides whether your own words get changed, so it runs on a stronger model.",
  },

  // The one place the expensive model earns its price. It only runs when a
  // rewrite has already failed the check, on those few lines alone, and the job
  // is genuinely hard: keep what the tailoring gained while removing a claim the
  // source doesn't support. The alternative to doing it well is falling back to
  // the candidate's own wording, so this is buying back real value.
  "repair-grounding": {
    ...CATALOG.smart,
    task: "Grounding repair",
    why: "Rewrites the few lines that failed the grounding check, keeping the tailoring but dropping the unsupported claim. Rare, small, and worth the better model.",
  },

  // The cheap tier, and deliberately, on the same kind of judgement that cost
  // verify-grounding its cheap tier one paragraph above.
  //
  // The difference is what happens when it is wrong. verify-grounding's output
  // moves text: a bad finding there deleted a $430,000 saving. This one's output
  // is re-checked in code before it can withhold anything — every word of the
  // field has to appear in the lines the model cited — so a wrong answer either
  // fails that check and leaves the warning standing, or names lines that really
  // do contain the field, in which case withholding it was right. The expensive
  // direction is closed off by the caller rather than bought from the model, and
  // this runs only when a warning already exists.
  "review-facts": {
    ...CATALOG.fast,
    task: "Copied-field review",
    why: "Reads each warning about an employer, title or date against your uploaded document and withholds the ones it can point at your own lines for. Its clearances are re-checked word by word in code, so this step runs cheap.",
  },

  // Same shape as report-chat: applying a correction the user stated in plain
  // words to a resume that has already been tailored. Short context, small
  // reply, and the route rejects anything structurally invalid before it can
  // reach the document.
  "resume-chat": {
    ...CATALOG.fast,
    task: "Resume chat",
    why: "Turns a plain-words correction into a specific edit on a resume that's already been tailored. Small and mechanical, so it runs on the cheap model.",
  },

  // The match report hands this one its outline, so the hard reasoning is
  // done — but this is the text you actually send, and prose quality is the
  // entire deliverable.
  "generate-email": {
    ...CATALOG.standard,
    task: "Letter writing",
    why: "The match report is already its outline, but this is the text you actually send — prose quality is the whole point.",
  },
} satisfies Record<TaskId, TaskModel>;

export function getTaskModel(task: TaskId): TaskModel {
  return TASK_MODELS[task];
}
