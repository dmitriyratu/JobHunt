export const SETTINGS_STORAGE_KEY = "jobhunt-settings";

/**
 * Model choice deliberately lives in code (see @/lib/models), not here — each
 * endpoint picks the model its job needs. The only thing the user configures
 * is credentials.
 */
export type AppSettings = {
  apiKey: string;
  /**
   * Optional OpenAI *Admin* key (sk-admin-...) with the api.usage.read scope.
   * Only used to read authoritative spend from OpenAI's Admin API; a normal
   * project key is rejected there with a 403.
   */
  adminApiKey: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  adminApiKey: "",
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // A previously stored `modelTier` is simply ignored — the extra key is
    // harmless and disappears on the next save.
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      apiKey: parsed.apiKey ?? "",
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
