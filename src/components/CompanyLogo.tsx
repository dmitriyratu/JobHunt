"use client";

import { useEffect, useState } from "react";
import { getCachedLogo, setCachedLogo } from "@/lib/logoCache";

type Props = {
  company: string;
  /**
   * The company's own domain, when the match report detected one. Optional
   * because a card exists from the moment an application is created, long
   * before anything has been analyzed — it only ever adds a place to look.
   */
  domain?: string;
  /**
   * "inline" is a fixed-height strip that flows with text.
   * "tile" fills a caller-sized box and falls back to initials rather than a
   * name, so the box stays the same size whether or not a logo was found.
   */
  variant?: "inline" | "tile";
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Company logos are resolved through /api/company-logo: Wikidata's P154 ("logo
 * image") property first, then the company's own favicon. A Wikidata mark is
 * almost always a wide wordmark (~250x50 to 250x120), so this renders a fixed-
 * height / auto-width strip rather than squeezing them into a square avatar; a
 * favicon is square and simply sits inside the same box.
 *
 * Falls back to a plain text label when neither has anything, or when the image
 * fails to load.
 */
export default function CompanyLogo({ company, domain = "", variant = "inline" }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const name = company.trim();
    if (!name) {
      setUrl(null);
      return;
    }
    setFailed(false);

    const cached = getCachedLogo(name, domain);
    if (cached !== undefined) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    const query = new URLSearchParams({ name });
    if (domain) query.set("domain", domain);
    fetch(`/api/company-logo?${query}`)
      // A 500 or a 429 off our own route says nothing about whether this
      // company has a logo, so it is answered as an unreliable miss rather than
      // a real one and never reaches the cache.
      .then((r) => (r.ok ? r.json() : { logoUrl: null, reliable: false }))
      .then((data) => {
        const found: string | null = data.logoUrl ?? null;
        if (found || data.reliable !== false) setCachedLogo(name, found, domain);
        if (!cancelled) setUrl(found);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [company, domain]);

  if (!company.trim()) return null;

  if (!url || failed) {
    if (variant === "tile") {
      return (
        <span
          className="text-sm font-semibold text-[var(--color-text-muted)]"
          aria-label={company}
        >
          {initials(company)}
        </span>
      );
    }
    return (
      <span className="text-xs font-medium text-[var(--color-text-secondary)]">{company}</span>
    );
  }

  return (
    // Plain <img>: next/image would require whitelisting every possible
    // company logo host up front, which isn't knowable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={company}
      // A found URL is cached indefinitely, so one that turns out not to render
      // has to be taken back out — otherwise this company shows initials on
      // every reload forever and the lookup is never tried again.
      onError={() => {
        setFailed(true);
        setCachedLogo(company.trim(), null, domain);
      }}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={
        variant === "tile"
          ? "max-h-full max-w-full object-contain"
          : "h-5 w-auto max-w-[140px] object-contain object-left"
      }
    />
  );
}
