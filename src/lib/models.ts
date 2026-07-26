/**
 * Model choice is a property of the *task*, not a user preference.
 *
 * Each of the three AI calls has a different job, and they don't need the same
 * amount of intelligence. Picking per task means the app makes one considered
 * decision per endpoint instead of asking the user to guess a single global
 * setting that has to be right for all three at once.
 */
export type TaskId = "analyze-match" | "report-chat" | "generate-email";

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
  },
  standard: {
    id: "gpt-5.4",
    label: "GPT-5.4",
    pricing: { input: 2.5, output: 15 },
    supportsTemperature: true,
  },
  fast: {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 Mini",
    pricing: { input: 0.75, output: 4.5 },
    supportsTemperature: true,
  },
} satisfies Record<string, ModelSpec>;

export type TaskModel = ModelSpec & {
  /** Human name for this step, for the settings and usage screens. */
  task: string;
  /** Why this model — shown in AI settings so the choice isn't a black box. */
  why: string;
};

export const TASK_MODELS = {
  // The analytical core. It reads the full resume and job description, decides
  // which requirements matter and how much, and judges the evidence for each.
  // The refine chat and the letter are both built on top of whatever it
  // produces, so a cheaper model here degrades everything downstream.
  "analyze-match": {
    ...CATALOG.standard,
    task: "Match analysis",
    why: "Reads the whole resume and posting and weighs every requirement. The chat and the letter are both built on this, so it gets the strong model.",
  },

  // The analysis is already done by the time this runs. The model is applying
  // a correction the user stated in plain words to an existing JSON structure
  // — small context, short reply, mechanical edit.
  "report-chat": {
    ...CATALOG.fast,
    task: "Refine chat",
    why: "Applies a correction you've already stated to a report that's already been analysed. Short and mechanical, so it runs on the cheap model.",
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
