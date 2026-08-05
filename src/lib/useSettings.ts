"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings as persistSettings,
  type AppSettings,
} from "./settings";

/**
 * The stored settings, and the only supported way to change them.
 *
 * Every page needs these — the API key reaches four different endpoints — and
 * each one used to keep its own copy with its own three-line load-and-save
 * beside it. Identical four times over is not the problem this fixes, though.
 *
 * The problem is that `AppSettings` holds four fields owned by two different
 * dialogs: Account writes the two keys, Your Profile writes the profile and the
 * asserted facts. When a save meant "write this whole object", either dialog
 * could erase the other's work simply by omitting a field — and both had grown
 * a comment saying so, one calling it out as the reason it spreads the entire
 * settings object rather than the field it actually edits.
 *
 * A comment is not a mechanism. This takes a *patch*, merges it against the
 * live value here, and persists the result — so a caller can only ever write
 * what it names, and omitting a field is what it looks like: leaving it alone.
 */

/**
 * Either the fields to change, or a function that reads the current settings
 * and returns them. The function form exists for changes that depend on what is
 * already stored — appending to a list, say — and may return null to mean the
 * value was already right and nothing should be written.
 */
export type SettingsPatch =
  | Partial<AppSettings>
  | ((prev: AppSettings) => Partial<AppSettings> | null);

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  /**
   * Whether the stored value has actually been read.
   *
   * `localStorage` is not available during render, so the first paint is always
   * DEFAULT_SETTINGS and the real value arrives an effect later. Anything that
   * fires an API call has to wait for this — sent against the defaults it would
   * carry no API key and fail for everyone using their own.
   */
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setSettingsLoaded(true);
  }, []);

  const saveSettings = useCallback((patch: SettingsPatch) => {
    setSettings((prev) => {
      const fields = typeof patch === "function" ? patch(prev) : patch;
      if (!fields) return prev;
      const next = { ...prev, ...fields };
      // Persisted outside the updater. React may call this twice under
      // StrictMode, and while writing the same value twice is harmless, the
      // updater is supposed to be pure — see the same note in useTheme.
      queueMicrotask(() => persistSettings(next));
      return next;
    });
  }, []);

  return { settings, settingsLoaded, saveSettings };
}
