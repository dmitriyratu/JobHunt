"use client";

import { useEffect } from "react";

/**
 * Holds the page still while a dialog is open.
 *
 * `overscroll-behavior: contain` on the dialog's own scroller stops the wheel
 * chaining outward once you reach the end of it — see .modal-overlay in
 * globals.css — but it cannot help over the scrim, and that is the other half
 * of the same complaint. The overlay is only a scroll container while it has
 * something to scroll, and the panel is capped to fit inside it, so a wheel out
 * there resolves to the document and moves the page behind the dialog. Nothing
 * declarative fixes that; the page has to actually stop scrolling.
 *
 * Hiding overflow takes the scrollbar away with it, and losing that width would
 * shift the whole page sideways at the moment a dialog opens — under a
 * translucent scrim, where it is very visible. So the width it occupied is
 * added back as padding. Zero on overlay scrollbars (every touch device, and
 * macOS by default), which is why it is measured rather than assumed.
 *
 * Reference-counted, because dialogs do overlap: the expanded document preview
 * opens over the profile dialog, and the first of the two to close must not
 * hand the page back while the other is still up.
 */

let locks = 0;
let restore: { overflow: string; paddingRight: string } | null = null;

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    if (locks === 0) {
      const gutter = window.innerWidth - root.clientWidth;
      restore = { overflow: root.style.overflow, paddingRight: root.style.paddingRight };
      root.style.overflow = "hidden";
      if (gutter > 0) root.style.paddingRight = `${gutter}px`;
    }
    locks += 1;

    return () => {
      locks -= 1;
      if (locks === 0 && restore) {
        root.style.overflow = restore.overflow;
        root.style.paddingRight = restore.paddingRight;
        restore = null;
      }
    };
  }, [active]);
}
