/**
 * The catalogue of identifiers a contact header can carry.
 *
 * This replaced two fixed fields, `linkedin` and `website`, where the second was
 * labelled "Website or GitHub". That pairing encoded one profession's idea of
 * what a person links to: it asked a physician for a GitHub account and gave
 * them nowhere to put an NPI, asked a professor for a personal site and gave
 * them nowhere to put an ORCID. The fields were not wrong so much as they were
 * an engineer's contact block, printed on every document the app makes.
 *
 * WHAT A "LINK" IS HERE
 * Not necessarily a URL. An NPI number and a bar admission number are
 * identifiers a reader looks up rather than clicks, and they belong in the same
 * row as the clickable ones — so `href` returns null for those and the renderers
 * print them as text. Modelling them as URLs would have meant either fabricating
 * a lookup URL or leaving out the one identifier a credentialing office
 * actually needs.
 *
 * WHAT DECIDES WHICH ARE SHOWN
 * The document shape suggests which kinds the form offers as empty slots (see
 * SHAPE_DEFS.suggestedLinks) — that is the fix for asking a doctor for a GitHub.
 * It deliberately does NOT filter what prints. Every link that has a value is
 * printed, on every shape. Suggesting is a hint about what is worth filling in;
 * silently dropping something the user typed would be a different and much worse
 * behaviour, and "why is my website missing" is a bug report you never want.
 */

export type LinkKind =
  | "linkedin"
  | "github"
  | "website"
  | "portfolio"
  | "orcid"
  | "scholar"
  | "npi"
  | "bar"
  | "reel"
  | "imdb";

export type ProfileLink = {
  kind: LinkKind;
  value: string;
};

type LinkDef = {
  kind: LinkKind;
  /** Form label, and the prefix printed for the identifier kinds. */
  label: string;
  placeholder: string;
  /**
   * The URL this value points at, or null when it is an identifier rather than
   * a destination. Receives the trimmed value and is only called when non-empty.
   */
  href: (value: string) => string | null;
  /** What appears on the page. Defaults to the value itself. */
  display?: (value: string) => string;
  /**
   * Finds this kind in the top of an uploaded resume, for seeding the form.
   *
   * Absent means "never guessed". A bar number is written a dozen ways and a
   * wrong one is worse than a blank, so it is only ever typed by hand.
   */
  pattern?: RegExp;
  /**
   * Turns what the pattern matched into a value worth storing.
   *
   * Only needed where the pattern deliberately accepts a form that is not
   * already the value. Contact lines are typeset as an icon plus a handle, and
   * the icon is a glyph in a symbol font — so what comes out of a PDF is
   * "linkedIn/ jane-doe", with no domain anywhere. Stored verbatim that would
   * link to a host called "jane-doe"; the profile it means is unambiguous, so
   * this puts the domain back.
   */
  normalize?: (raw: string) => string;
};

const stripProtocol = (url: string) =>
  url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");

const asUrl = (value: string) => {
  const bare = stripProtocol(value);
  return bare ? `https://${bare}` : null;
};

/**
 * Order matters twice: it is the order the form lists slots in, and the order
 * the contact line prints in. LinkedIn first because it is the one nearly
 * everyone has; the identifiers last because they are looked up, not clicked.
 */
export const LINK_DEFS: LinkDef[] = [
  {
    kind: "linkedin",
    label: "LinkedIn",
    placeholder: "linkedin.com/in/yourname",
    href: asUrl,
    display: stripProtocol,
    // Two forms, canonical first so a real URL is never read as the short one:
    // the full profile URL, or the domainless "linkedin/ jane-doe" a PDF leaves
    // behind once its icon glyph is dropped. The second only fires on an
    // explicit separator, so prose that merely mentions LinkedIn is not a hit.
    pattern:
      /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?|\blinked\s?in\b\s*[/:|]\s*(?:in\/)?([\w%-]{3,})/i,
    normalize: (raw) => (/linkedin\.com/i.test(raw) ? raw : `linkedin.com/in/${raw}`),
  },
  {
    kind: "github",
    label: "GitHub",
    placeholder: "github.com/yourname",
    href: asUrl,
    display: stripProtocol,
    pattern: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?|\bgithub\b\s*[/:|]\s*([\w-]{3,})/i,
    normalize: (raw) => (/github\.com/i.test(raw) ? raw : `github.com/${raw}`),
  },
  {
    kind: "website",
    label: "Website",
    placeholder: "yoursite.com",
    href: asUrl,
    display: stripProtocol,
  },
  {
    kind: "portfolio",
    label: "Portfolio",
    placeholder: "yourwork.com",
    href: asUrl,
    display: stripProtocol,
  },
  {
    kind: "orcid",
    label: "ORCID",
    placeholder: "0000-0002-1825-0097",
    // Accepts either the bare identifier or a pasted orcid.org URL, because
    // both are what people have to hand.
    href: (v) => {
      const id = v.trim().replace(/^.*orcid\.org\//i, "");
      return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(id) ? `https://orcid.org/${id}` : asUrl(v);
    },
    display: (v) => v.trim().replace(/^.*orcid\.org\//i, ""),
    // The check digit may be X, which is why this is not \d{4} four times.
    pattern: /(?:https?:\/\/)?(?:www\.)?orcid\.org\/\d{4}-\d{4}-\d{4}-\d{3}[\dX]|(?<![\d-])\d{4}-\d{4}-\d{4}-\d{3}[\dX](?![\d-])/i,
  },
  {
    kind: "scholar",
    label: "Google Scholar",
    placeholder: "scholar.google.com/citations?user=…",
    href: asUrl,
    display: () => "Google Scholar",
    pattern: /(?:https?:\/\/)?scholar\.google\.[\w.]+\/citations\?[\w=&%-]+/i,
  },
  {
    kind: "npi",
    // An identifier, not a destination: the NPI registry has no stable per-
    // provider URL worth printing, and a credentialing office looks the number
    // up in its own system anyway.
    label: "NPI",
    placeholder: "1234567890",
    href: () => null,
    display: (v) => `NPI ${v.trim()}`,
    // Anchored hard on the label. A bare ten-digit run also matches a phone
    // number written without separators, which is exactly the field above it.
    pattern: /\bNPI\b[\s#:]*(\d{10})\b/i,
  },
  {
    kind: "bar",
    label: "Bar Number",
    placeholder: "MA #123456",
    href: () => null,
    display: (v) => v.trim(),
  },
  {
    kind: "reel",
    label: "Reel",
    placeholder: "vimeo.com/yourreel",
    href: asUrl,
    display: stripProtocol,
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com|youtu\.be)\/[\w/-]+/i,
  },
  {
    kind: "imdb",
    label: "IMDb",
    placeholder: "imdb.com/name/nm0000123",
    href: asUrl,
    display: () => "IMDb",
    pattern: /(?:https?:\/\/)?(?:www\.)?imdb\.com\/name\/nm\d+\/?/i,
  },
];

export const LINK_DEF: Record<LinkKind, LinkDef> = Object.fromEntries(
  LINK_DEFS.map((d) => [d.kind, d])
) as Record<LinkKind, LinkDef>;

export const ALL_LINK_KINDS: LinkKind[] = LINK_DEFS.map((d) => d.kind);

/**
 * The kinds an upload can recognise — those with a `pattern`.
 *
 * The complement is what matters. A bar number or a portfolio URL is only ever
 * typed by hand, so a resume not mentioning one says nothing about whether it
 * is still true; treating that silence as "delete it" would throw away a value
 * no future upload could ever put back.
 */
export const DETECTABLE_LINK_KINDS: LinkKind[] = LINK_DEFS.filter((d) => d.pattern).map(
  (d) => d.kind
);

/** Narrows an untrusted value — a kind stored by a build that had more of them. */
export function isLinkKind(value: unknown): value is LinkKind {
  return ALL_LINK_KINDS.includes(value as LinkKind);
}

/** The URL a link points at, or null when it is an identifier. */
export function linkHref(link: ProfileLink): string | null {
  const value = link.value.trim();
  if (!value) return null;
  return LINK_DEF[link.kind].href(value);
}

/** What the contact line shows for it. */
export function linkDisplay(link: ProfileLink): string {
  const value = link.value.trim();
  if (!value) return "";
  const def = LINK_DEF[link.kind];
  return def.display ? def.display(value) : value;
}

/** Filled links only, in catalogue order, for the renderers. */
export function printableLinks(links: ProfileLink[]): ProfileLink[] {
  const byKind = new Map(links.filter((l) => l.value.trim()).map((l) => [l.kind, l]));
  return ALL_LINK_KINDS.flatMap((kind) => {
    const link = byKind.get(kind);
    return link ? [link] : [];
  });
}

export function getLink(links: ProfileLink[], kind: LinkKind): string {
  return links.find((l) => l.kind === kind)?.value ?? "";
}

/**
 * Sets one kind, dropping it from the list when cleared.
 *
 * Empty links are removed rather than kept as blanks so that "which kinds does
 * this person have" is answerable from the data alone, without every consumer
 * having to filter. The form re-adds an empty slot from the shape's suggestions.
 */
export function setLink(links: ProfileLink[], kind: LinkKind, value: string): ProfileLink[] {
  const rest = links.filter((l) => l.kind !== kind);
  if (!value.trim()) return rest;
  return [...rest, { kind, value }];
}

/**
 * Reads the identifiers out of the top of an uploaded resume.
 *
 * Kinds without a pattern are skipped, and so is anything the email address
 * already accounts for — a personal domain appearing only inside an email is
 * not a website the person listed.
 */
export function extractLinks(head: string, email: string): ProfileLink[] {
  const found: ProfileLink[] = [];

  for (const def of LINK_DEFS) {
    if (!def.pattern) continue;
    const match = head.match(def.pattern);
    if (!match) continue;
    // A capture group means the pattern matched something around the value —
    // a label and its number (NPI), or a handle with the domain left off
    // (LinkedIn, GitHub) — so take the group and let the kind put back
    // whatever the resume dropped.
    const matched = (match[1] ?? match[0]).trim();
    const raw = matched && def.normalize ? def.normalize(matched) : matched;
    if (raw) found.push({ kind: def.kind, value: def.href(raw) ? stripProtocol(raw) : raw });
  }

  // A generic website, only if no more specific link claimed the host. Runs
  // last because "github.com/x" would otherwise be found here as a website too.
  const claimed = found.map((l) => l.value.toLowerCase());

  // Every address in the block, not just the one the caller settled on as *the*
  // email. Resumes routinely carry two — a personal address and an institutional
  // one — and the second one's domain was being offered as a personal website:
  // "alfauht1@mskcc.org" turning into a website called mskcc.org, which is the
  // employer's site, not hers.
  const emails = [...head.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) =>
    m[0].toLowerCase()
  );
  if (email) emails.push(email.toLowerCase());
  const WEBSITE_RE =
    /(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|dev|io|me|net|org|app|xyz|ca|co\.uk)(?:\/[\w./%-]*)?/gi;
  const SPECIFIC_HOSTS = /linkedin\.com|github\.com|orcid\.org|scholar\.google|imdb\.com|vimeo\.com|youtu\.be/i;

  for (const candidate of head.match(WEBSITE_RE) ?? []) {
    const bare = stripProtocol(candidate);
    if (!bare || SPECIFIC_HOSTS.test(bare)) continue;
    if (claimed.some((c) => c.includes(bare.toLowerCase()))) continue;
    if (emails.some((e) => e.endsWith(bare.toLowerCase()))) continue;
    found.push({ kind: "website", value: bare });
    break;
  }

  return found;
}

/**
 * Reads the two fields this catalogue replaced.
 *
 * `website` held whatever was found first and was frequently a GitHub URL — the
 * old extractor preferred it — so the host decides the kind rather than the
 * field name. Runs on every settings load, not once behind a version flag,
 * because the profile is in localStorage on machines this code will never get to
 * migrate on a schedule.
 */
export function migrateLegacyLinks(stored: Record<string, unknown>): ProfileLink[] {
  const out: ProfileLink[] = [];

  const linkedin = typeof stored.linkedin === "string" ? stored.linkedin.trim() : "";
  if (linkedin) out.push({ kind: "linkedin", value: stripProtocol(linkedin) });

  const website = typeof stored.website === "string" ? stored.website.trim() : "";
  if (website) {
    const bare = stripProtocol(website);
    const kind: LinkKind = /^github\.com\//i.test(bare) ? "github" : "website";
    out.push({ kind, value: bare });
  }

  return out;
}
