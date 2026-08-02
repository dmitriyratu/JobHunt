"use client";

/**
 * Where something came from, as a link rather than a wall of URL.
 *
 * A job posting URL is routinely 300+ characters of tracking parameters —
 * `gh_jid`, `utm_*`, `gclid`, a `gbraid` — and none of it is readable. Printed
 * in full it takes six lines, pushes everything below it down, and still tells
 * you less than the host does. So the host is the label and the URL lives on
 * the link, where it is one click instead of a paragraph.
 *
 * Anything that doesn't parse as http(s) is a filename or pasted text. Those
 * are shown as they are, truncated, with the whole string in the tooltip —
 * there is nothing to link to, and a filename is already short enough to read.
 */

type Props = {
  /** A URL, a filename, or pasted text — whatever the document came from. */
  source: string;
  /** Rendered when there is no source at all. */
  fallback?: React.ReactNode;
  /** Classes for whichever element ends up rendering; layout differs per site. */
  className?: string;
};

export default function SourceLink({ source, fallback = null, className = "" }: Props) {
  const trimmed = source.trim();
  if (!trimmed) return <>{fallback}</>;

  let url: URL | null = null;
  try {
    const parsed = new URL(trimmed);
    // Only these two are worth linking. A `javascript:` or `data:` source is
    // not something this app produces, and neither belongs in an href.
    if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed;
  } catch {
    /* not a URL */
  }

  if (!url) {
    return (
      <span className={className} title={trimmed}>
        {trimmed}
      </span>
    );
  }

  return (
    <a
      href={url.href}
      target="_blank"
      rel="noopener noreferrer"
      title={url.href}
      className={`text-[var(--color-accent)] hover:underline ${className}`}
    >
      {url.hostname.replace(/^www\./, "")} ↗
    </a>
  );
}
