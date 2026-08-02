"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  loadTheme,
  saveTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "./theme";

/**
 * The current theme, and a toggle that persists it.
 *
 * Split out of theme.ts because the root layout is a server component and
 * imports the bootstrap script from there — Next.js refuses a module that
 * imports useState once anything on the server reaches it. See the note at the
 * top of theme.ts.
 *
 * `ready` is false until the effect has read localStorage. Server render and
 * first client render have to produce the same markup, so the control that
 * reports the theme waits for this. The page itself is already correct by then
 * — the bootstrap script set the attribute before React ever ran.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setThemeState(loadTheme());
    setReady(true);
  }, []);

  // Another tab changed it. A null key means the whole store was cleared.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const next = loadTheme();
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    saveTheme(next);
    applyTheme(next);
  }, []);

  // The updater stays pure — persisting and touching the DOM from inside it
  // would run twice under StrictMode.
  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      queueMicrotask(() => {
        saveTheme(next);
        applyTheme(next);
      });
      return next;
    });
  }, []);

  return { theme, ready, setTheme, toggle };
}
