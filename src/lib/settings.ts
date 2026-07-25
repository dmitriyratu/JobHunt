import type { ModelTier } from "@/lib/models";

export const SETTINGS_STORAGE_KEY = "jobhunt-settings";

export type AppSettings = {
  apiKey: string;
  modelTier: ModelTier;
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  modelTier: "premium",
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
