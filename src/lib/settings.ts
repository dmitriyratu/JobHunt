import type { ModelTier } from "@/lib/models";
import { DEFAULT_PRICING, type ModelPricing } from "@/lib/pricing";

export const SETTINGS_STORAGE_KEY = "jobhunt-settings";

export type AppSettings = {
  apiKey: string;
  modelTier: ModelTier;
  monthlyBudgetUsd: number;
  pricing: Record<ModelTier, ModelPricing>;
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  modelTier: "premium",
  monthlyBudgetUsd: 20,
  pricing: DEFAULT_PRICING,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiKey: parsed.apiKey ?? "",
      modelTier: parsed.modelTier === "budget" ? "budget" : "premium",
      monthlyBudgetUsd:
        typeof parsed.monthlyBudgetUsd === "number" && parsed.monthlyBudgetUsd >= 0
          ? parsed.monthlyBudgetUsd
          : DEFAULT_SETTINGS.monthlyBudgetUsd,
      pricing: {
        premium: { ...DEFAULT_PRICING.premium, ...parsed.pricing?.premium },
        budget: { ...DEFAULT_PRICING.budget, ...parsed.pricing?.budget },
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}
