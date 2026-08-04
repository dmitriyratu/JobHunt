"use client";

import { useTheme } from "@/lib/useTheme";

/**
 * A plain two-position switch.
 *
 * Shows the theme you would get by clicking, not the one you are in — the same
 * convention as every other light/dark control, and the only one that makes a
 * single icon unambiguous.
 */

function SunIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-4 w-4"
      aria-hidden
    >
      <circle cx="10" cy="10" r="3.75" />
      <path
        strokeLinecap="round"
        d="M10 1.75v1.9M10 16.35v1.9M18.25 10h-1.9M3.65 10h-1.9M15.83 4.17l-1.34 1.34M5.51 14.49l-1.34 1.34M15.83 15.83l-1.34-1.34M5.51 5.51 4.17 4.17"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-4 w-4"
      aria-hidden
    >
      <path strokeLinejoin="round" d="M16.5 11.75A7 7 0 0 1 8.25 3.5a7 7 0 1 0 8.25 8.25Z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, ready, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      // Square, and the same height as the labelled controls beside it — see
      // `.hdr-btn` in globals.css.
      className="hdr-btn hdr-btn-icon"
    >
      {/* Held blank for the one frame before the stored theme is read, so
          server and first client render agree. The page itself is already in
          the right theme by now — the bootstrap script set it before paint. */}
      <span className={ready ? "" : "invisible"}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}
