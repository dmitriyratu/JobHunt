export async function copyPlainText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text).catch(() => {});
}

/**
 * Writes both flavors so pasting into Gmail/Outlook keeps formatting while a
 * plain-text field still gets something sane. Falls back to plain text where
 * ClipboardItem isn't available.
 */
export async function copyRichText(html: string, text: string): Promise<void> {
  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return;
    }
  } catch {
    /* fall through to plain text */
  }
  await copyPlainText(text);
}
