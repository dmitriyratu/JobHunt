import type { UsageStats } from "./structuredCompletion";
import type { ModelTier } from "./models";
import { computeCost, type ModelPricing } from "./pricing";

export const USAGE_STORAGE_KEY = "jobhunt-usage";

export type UsageEndpoint = "analyze-match" | "report-chat" | "generate-email";

export type UsageEntry = {
  id: string;
  timestamp: string;
  endpoint: UsageEndpoint;
  model: string;
  tier: ModelTier;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

export function loadUsageLog(): UsageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UsageEntry[]) : [];
  } catch {
    return [];
  }
}

function saveUsageLog(entries: UsageEntry[]): void {
  localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(entries));
}

export function appendUsageEntry(params: {
  endpoint: UsageEndpoint;
  model: string;
  tier: ModelTier;
  usage: UsageStats;
  pricing: ModelPricing;
}): UsageEntry[] {
  const entry: UsageEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    endpoint: params.endpoint,
    model: params.model,
    tier: params.tier,
    promptTokens: params.usage.promptTokens,
    completionTokens: params.usage.completionTokens,
    totalTokens: params.usage.totalTokens,
    costUsd: computeCost(params.pricing, params.usage.promptTokens, params.usage.completionTokens),
  };
  const entries = [...loadUsageLog(), entry];
  saveUsageLog(entries);
  return entries;
}

export function clearUsageLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USAGE_STORAGE_KEY);
}
