import { MODEL_TIERS, type ModelTier } from "@/lib/models";

export const SETTINGS_STORAGE_KEY = "jobhunt-settings";

export type AppSettings = {
  apiKey: string;
  modelTier: ModelTier;
  /**
   * Optional OpenAI *Admin* key (sk-admin-...) with the api.usage.read scope.
   * Only used to read authoritative spend from OpenAI's Admin API; a normal
   * project key is rejected there with a 403.
   */
  adminApiKey: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  modelTier: "balanced",
  adminApiKey: "",
};

function isModelTier(value: unknown): value is ModelTier {
  return typeof value === "string" && value in MODEL_TIERS;
}

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiKey: parsed.apiKey ?? "",
      modelTier: isModelTier(parsed.modelTier) ? parsed.modelTier : DEFAULT_SETTINGS.modelTier,
      adminApiKey: parsed.adminApiKey ?? "",
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
