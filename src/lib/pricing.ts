import type { ModelPricing } from "./models";

export type { ModelPricing };

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
