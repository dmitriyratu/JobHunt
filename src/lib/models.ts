export type ModelTier = "premium" | "budget";

export const MODEL_TIERS = {
  premium: {
    id: "gpt-4o" as const,
    label: "Smart",
    subtitle: "GPT-4o",
    description: "Best writing quality and nuance. Use for important applications.",
    cost: "Higher cost",
  },
  budget: {
    id: "gpt-4o-mini" as const,
    label: "Fast",
    subtitle: "GPT-4o mini",
    description: "Solid results at a fraction of the price. Great for drafts and chat.",
    cost: "Much cheaper",
  },
} satisfies Record<
  ModelTier,
  {
    id: string;
    label: string;
    subtitle: string;
    description: string;
    cost: string;
  }
>;

export function getModelForTier(tier?: ModelTier): string {
  if (tier && tier in MODEL_TIERS) {
    return MODEL_TIERS[tier].id;
  }
  return process.env.OPENAI_MODEL ?? MODEL_TIERS.premium.id;
}
