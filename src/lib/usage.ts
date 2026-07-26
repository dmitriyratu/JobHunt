import type { UsageStats } from "./structuredCompletion";
import type { ModelTier } from "./models";
import { computeCost, type ModelPricing } from "./pricing";

export const USAGE_STORAGE_KEY = "jobhunt-usage";
const TAB_ID_KEY = "jobhunt-tab-id";

export type UsageEndpoint = "analyze-match" | "report-chat" | "generate-email";

export type UsageEntry = {
  id: string;
  timestamp: string;
  endpoint: UsageEndpoint;
  model: string;
  tier: ModelTier;
  tabId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
};

// One id per browser TAB (distinct from an application Session), for the lifetime of that tab (sessionStorage, not
// localStorage) — a natural fit for "how much did this session cost," and it
// carries across the 3-page flow since they're all the same tab.
export function getTabId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

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
    tabId: getTabId(),
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
