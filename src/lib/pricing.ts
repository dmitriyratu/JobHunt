import type { ModelTier } from "./models";

export type ModelPricing = {
  /** $ per 1,000,000 input (prompt) tokens */
  input: number;
  /** $ per 1,000,000 output (completion) tokens */
  output: number;
};

// Approximate rates — OpenAI adjusts pricing periodically, so these are a
// starting point, not a guarantee. Verify against platform.openai.com/pricing
// and adjust in Settings if they've changed.
export const DEFAULT_PRICING: Record<ModelTier, ModelPricing> = {
  premium: { input: 2.5, output: 10 },
  budget: { input: 0.15, output: 0.6 },
};

export function computeCost(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number
): number {
  return (
    (promptTokens / 1_000_000) * pricing.input +
    (completionTokens / 1_000_000) * pricing.output
  );
}
