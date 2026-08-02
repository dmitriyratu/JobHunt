/**
 * Theme storage and resolution. No React, and deliberately no "use client".
 *
 * The root layout is a server component and imports THEME_BOOTSTRAP from here,
 * which pins this module from both sides:
 *
 *  - It cannot be marked "use client". Every export of a client module becomes
 *    a client reference when the server imports it, so the layout would get a
 *    proxy where it expects a string.
 *  - It cannot contain hooks either. Next.js rejects a module that so much as
 *    imports useState once a server component pulls it in, whether or not the
 *    export being used touches it.
 *
 * So the hook lives next door in useTheme.ts, which is a client module and
 * imports from here.
 */

export const THEME_STORAGE_KEY = "jobhunt-theme";

/**
 * Two themes, no third "follow the system" state, and light is the default.
 *
 * The OS preference is deliberately not consulted at all. Everyone starts on
 * light and stays there until they say otherwise, which makes the app's
 * out-of-the-box appearance one fixed thing rather than a property of the
 * visitor's machine.
 */
export type Theme = "light" | "dark";

/**
 * The pre-hydration bootstrap, as a string.
 *
 * Has to run before first paint, so it goes in the document head as a blocking
 * inline script rather than in a component — by the time React mounts, the page
 * has already been painted once, and a light flash on the way into a dark app
 * is exactly what people notice.
 *
 * It lives here, beside the key and the query it depends on, because the only
 * thing worse than duplicated logic is duplicated logic where one copy is
 * inside a string literal that nothing type-checks.
 */
export const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});document.documentElement.dataset.theme=p==="dark"?"dark":"light";}catch(_){document.documentElement.dataset.theme="light";}})();`;

/** Anything that isn't an explicitly stored "dark" is light. */
export function loadTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private-mode Safari throws on write. The theme still applies for this
    // session; it just won't survive a reload, which beats crashing.
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
};
