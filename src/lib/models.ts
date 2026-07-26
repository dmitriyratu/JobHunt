export type ModelTier = "flagship" | "balanced" | "budget";

export type ModelPricing = {
  /** $ per 1,000,000 input (prompt) tokens */
  input: number;
  /** $ per 1,000,000 output (completion) tokens */
  output: number;
};

// Verified directly against the live OpenAI API (model id + a real
// chat.completions call) — not just the pricing page. The 5.6 line are
// reasoning models and only support the default temperature (1); the 5.4
// line supports custom temperature. Verify current $/1M rates at
// platform.openai.com/pricing periodically, since these can change.
export const MODEL_TIERS = {
  flagship: {
    id: "gpt-5.6-sol",
    label: "Flagship",
    subtitle: "GPT-5.6 Sol",
    description: "The smartest model available — best for nuanced writing and judgment calls.",
    cost: "Highest cost",
    pricing: { input: 5, output: 30 },
    supportsTemperature: false,
  },
  balanced: {
    id: "gpt-5.4",
    label: "Balanced",
    subtitle: "GPT-5.4",
    description: "Close to flagship quality at a fraction of the cost — the best everyday default.",
    cost: "Mid cost",
    pricing: { input: 2.5, output: 15 },
    supportsTemperature: true,
  },
  budget: {
    id: "gpt-5.4-mini",
    label: "Budget",
    subtitle: "GPT-5.4 Mini",
    description: "Fast and cheap, still solid for straightforward tasks like chat refinement.",
    cost: "Lowest cost",
    pricing: { input: 0.75, output: 4.5 },
    supportsTemperature: true,
  },
} satisfies Record<
  ModelTier,
  {
    id: string;
    label: string;
    subtitle: string;
    description: string;
    cost: string;
    pricing: ModelPricing;
    supportsTemperature: boolean;
  }
>;

export function getModelForTier(tier?: ModelTier): string {
  if (tier && tier in MODEL_TIERS) {
    return MODEL_TIERS[tier].id;
  }
  return process.env.OPENAI_MODEL ?? MODEL_TIERS.balanced.id;
}

export function tierSupportsTemperature(tier?: ModelTier): boolean {
  if (tier && tier in MODEL_TIERS) {
    return MODEL_TIERS[tier].supportsTemperature;
  }
  return true;
}

export function getPricingForTier(tier?: ModelTier): ModelPricing {
  if (tier && tier in MODEL_TIERS) {
    return MODEL_TIERS[tier].pricing;
  }
  return MODEL_TIERS.balanced.pricing;
}
