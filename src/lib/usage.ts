import type { UsageStats } from "./structuredCompletion";
import { getTaskModel, type TaskId } from "./models";
import { computeCost } from "./pricing";

export const USAGE_STORAGE_KEY = "jobhunt-usage";
const TAB_ID_KEY = "jobhunt-tab-id";

/** Each endpoint is one task, so the two names index the same thing. */
export type UsageEndpoint = TaskId;

export type UsageEntry = {
  id: string;
  timestamp: string;
  endpoint: UsageEndpoint;
  model: string;
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

/**
 * Pricing is derived from the endpoint rather than passed in: the endpoint
 * fully determines the model, so the two can't drift apart. Cost is baked in
 * here at record time so historical entries stay accurate if rates change.
 */
export function appendUsageEntry(params: {
  endpoint: UsageEndpoint;
  model: string;
  usage: UsageStats;
}): UsageEntry[] {
  const pricing = getTaskModel(params.endpoint).pricing;
  const entry: UsageEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    endpoint: params.endpoint,
    model: params.model,
    tabId: getTabId(),
    promptTokens: params.usage.promptTokens,
    completionTokens: params.usage.completionTokens,
    totalTokens: params.usage.totalTokens,
    costUsd: computeCost(pricing, params.usage.promptTokens, params.usage.completionTokens),
  };
  const entries = [...loadUsageLog(), entry];
  saveUsageLog(entries);
  return entries;
}

export function clearUsageLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USAGE_STORAGE_KEY);
}
