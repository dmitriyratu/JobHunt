"use client";

import { useEffect, useState } from "react";
import { getCachedLogo, setCachedLogo } from "@/lib/logoCache";

type Props = {
  company: string;
};

/**
 * Company logos come from Wikidata's P154 ("logo image") property, resolved
 * through /api/company-logo. They're almost always wide wordmarks
 * (~250x50 to 250x120), so this renders a fixed-height / auto-width strip
 * rather than squeezing them into a square avatar.
 *
 * Falls back to a plain text label whenever the company isn't in Wikidata
 * (most smaller employers won't be) or the image fails to load.
 */
export default function CompanyLogo({ company }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const name = company.trim();
    if (!name) {
      setUrl(null);
      return;
    }
    setFailed(false);

    const cached = getCachedLogo(name);
    if (cached !== undefined) {
      setUrl(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/company-logo?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : { logoUrl: null }))
      .then((data) => {
        const found: string | null = data.logoUrl ?? null;
        setCachedLogo(name, found);
        if (!cancelled) setUrl(found);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  if (!company.trim()) return null;

  if (!url || failed) {
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
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-5 w-auto max-w-[140px] object-contain object-left"
    />
  );
}
