import { specFor, orderSectionKeys, allowsPageTarget } from "./documentShape";
import type {
  DocumentShape,
  ResumeBullet,
  ResumeDraft,
  ResumeEntry,
  ResumePageTarget,
  ResumeSection,
  Grounded,
  ResumeSkillGroup,
  TailoredResume,
} from "@/types";

// --- Skills -----------------------------------------------------------------

/** Every skill across all groups, in reading order. */
export function flattenSkills(groups: ResumeSkillGroup[]): string[] {
  return groups.flatMap((g) => g.items);
}

/** "Languages: Go, SQL · Infra: Kafka, AWS" — for diffs and prompt context. */
export function formatSkillGroups(groups: ResumeSkillGroup[]): string {
  return groups
    .map((g) => (g.label.trim() ? `${g.label.trim()}: ${g.items.join(", ")}` : g.items.join(", ")))
    .join("  ·  ");
}

// --- Section access ---------------------------------------------------------

/**
 * The bullets that print. A dropped one stays in the data with its source
 * intact so the chat can offer it back — nothing else remembers it existed.
 */
export function visibleBullets(bullets: ResumeBullet[] = []): ResumeBullet[] {
  return bullets.filter((b) => !b.dropped);
}

export function sectionByKey(
  resume: TailoredResume,
  key: string
): ResumeSection | undefined {
  return resume.sections.find((s) => s.key === key);
}

/** Whether a section has anything worth printing under its heading. */
export function sectionHasContent(section: ResumeSection): boolean {
  return Boolean(
    section.prose?.value.trim() ||
      section.keywords?.value.some((g) => g.items.length > 0) ||
      section.entries?.length ||
      section.items?.some((i) => i.trim())
  );
}

export function allEntries(resume: TailoredResume): ResumeEntry[] {
  return resume.sections.flatMap((s) => s.entries ?? []);
}

// --- Chronology -------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * A date string as a sortable number, or null if there is nothing to read.
 *
 * Dates are display strings copied verbatim from the uploaded document, so this
 * has to cope with "July 2021", "2021", "07/2021", "Expected June 2027" and
 * "Present" alike. It deliberately reads loosely and gives up quietly: a date
 * it cannot parse must not reorder anything, which is why the caller treats
 * null as "leave where it is" rather than as a zero.
 */
export function dateOrder(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  // An open-ended role outranks every finished one.
  if (/\b(present|current|ongoing|now|to date)\b/.test(text)) return Number.MAX_SAFE_INTEGER;

  const year = text.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;

  const month =
    Object.entries(MONTHS).find(([m]) => text.includes(m))?.[1] ??
    Number(text.match(/\b(\d{1,2})\s*[/-]\s*(?:19|20)\d{2}\b/)?.[1] ?? 0);

  return Number(year[0]) * 12 + (month || 0);
}

/**
 * Entries newest first.
 *
 * Reverse chronology is the one ordering rule every resume and CV convention
 * agrees on, and the model gets it wrong often enough to matter — one generated
 * CV listed education oldest-first and clinical experience in no order at all.
 * Asking the prompt more firmly does not fix that reliably; sorting here does.
 *
 * An entry is ranked by when it ended, falling back to when it started, so a
 * current role sorts above a finished one that started later. Entries with no
 * readable date keep their original position relative to each other and follow
 * the dated ones, which is what an undated project or a named initiative wants.
 */
export function sortEntriesByDate(entries: ResumeEntry[]): ResumeEntry[] {
  const keyed = entries.map((entry, i) => ({
    entry,
    i,
    rank: dateOrder(entry.endDate) ?? dateOrder(entry.startDate),
  }));

  return keyed
    .sort((a, b) => {
      if (a.rank === null && b.rank === null) return a.i - b.i;
      if (a.rank === null) return 1;
      if (b.rank === null) return -1;
      return b.rank - a.rank || a.i - b.i;
    })
    .map((k) => k.entry);
}

// --- Construction -----------------------------------------------------------

/**
 * Turns what the model returned into what the app stores.
 *
 * Little more than ordering and pruning now: the stored shape and the returned
 * shape are the same type, so there is no field-adding pass.
 *
 * The order the model emitted its sections in is the signal for how it wants
 * this particular document to read, so it is kept — but only as far as
 * orderSectionKeys allows, which is within a band. Anything it invented that
 * isn't in the catalogue is discarded there too. Sections the model omitted
 * entirely are simply absent: on a catalogue this size, "no publications" is a
 * legitimate answer and printing an empty heading is worse than printing
 * nothing.
 *
 * The resulting array is the document's running order, and every renderer
 * iterates it rather than re-deriving an order of its own.
 */
export function draftToResume(
  draft: ResumeDraft,
  shape: DocumentShape,
  pageTarget: ResumePageTarget | null
): TailoredResume {
  const returned = new Map((draft.sections ?? []).map((s) => [s.key, s]));
  const order = orderSectionKeys(
    shape,
    (draft.sections ?? []).map((s) => s.key)
  );

  const sections = order
    .map((key): ResumeSection => {
      const got = returned.get(key);
      if (!got) return { key };
      return {
        key,
        prose: got.prose,
        keywords: got.keywords,
        entries: got.entries ? sortEntriesByDate(got.entries) : undefined,
        items: got.items?.filter((i) => i.trim()),
      };
    })
    .filter(sectionHasContent);

  return {
    shape,
    sections,
    pageTarget: allowsPageTarget(shape) ? pageTarget : null,
    // Carried through rather than recomputed: both are the route's findings
    // about this generation, and the client has neither the source document nor
    // the page count to derive them from.
    omitted: draft.omitted ?? [],
    collapsed: draft.collapsed ?? [],
    generatedAt: new Date().toISOString(),
  };
}

// --- Legacy migration -------------------------------------------------------

/** The pre-simplification value shape: `change` and `resolution` alongside the pair. */
type LegacyField<T> = {
  value: T;
  source: T;
  change?: string;
  resolution?: string;
};

/** Written text as any generation stored it: one `source`, or a `sources` list. */
type LegacyGrounded = {
  value?: string;
  source?: string;
  sources?: string[];
  change?: string;
  resolution?: string;
};

type LegacyBullet = LegacyGrounded & { id: string; dropped?: boolean };

function asGroups(value: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(value)) return [];
  if (value.every((v) => typeof v === "string")) return [{ label: "", items: value as string[] }];
  return (value as ResumeSkillGroup[]).filter((g) => g && typeof g === "object" && Array.isArray(g.items));
}

/**
 * Brings a stored value onto the current shape: a written value and the lines
 * it draws on.
 *
 * `source` was a single string before combining was allowed, so a stored one
 * becomes a list of one. An empty string becomes an empty list rather than a
 * list containing "" — the difference matters, because a cited empty line would
 * read as evidence.
 */
function asGrounded(field: LegacyGrounded | undefined): Grounded {
  if (!field) return { value: "", sources: [] };
  if (Array.isArray(field.sources)) {
    return { value: field.value ?? "", sources: field.sources.filter(Boolean) };
  }
  const single = (field.source ?? "").trim();
  return { value: field.value ?? "", sources: single ? [single] : [] };
}

/**
 * Collapses a stored bullet onto the current shape.
 *
 * `dropped` used to be two fields: change === "dropped" said the model cut it,
 * and resolution === "rejected" said the user had put it back. Nothing sets the
 * second any more, so the pair reduces to the one boolean that was ever read.
 */
function asBullet(b: LegacyBullet): ResumeBullet {
  return {
    id: b.id,
    ...asGrounded(b),
    dropped: b.dropped ?? (b.change === "dropped" && b.resolution !== "rejected"),
  };
}

/**
 * Brings a stored resume onto the current shape.
 *
 * One generation back every value carried `change` and `resolution`, and skills
 * were a bare string[]; those still arrive and are still repaired below, because
 * the repair is written back — useAppState normalises on load and the store is
 * persisted on the next save, so a document is only ever one visit away from
 * being current.
 *
 * Two generations back a resume had fixed `summary`/`skills`/`roles`/`education`
 * fields instead of a `sections` array. That converter has been removed: it was
 * reachable only by a store last written between the 26th and 31st of July that
 * has not been opened since, and rebuilding a whole document shape to serve it
 * cost more than the case was worth. Such a resume now reads as null — the
 * application shows as not yet generated and regenerating it produces a current
 * one, which is a clean failure rather than a renderer meeting fields it does
 * not know.
 *
 * Bumping STORE_VERSION would also have retired it, and is still the wrong tool:
 * loadStore discards the entire store on a version mismatch, so it would take
 * every saved application with it.
 */
export function normalizeTailoredResume(
  resume: TailoredResume | null
): TailoredResume | null {
  if (!resume) return null;
  if (!Array.isArray(resume.sections)) return null;

  return {
    ...resume,
    shape: resume.shape ?? "resume",
    sections: resume.sections.map((s) => {
      const legacy = s as ResumeSection & {
        prose?: LegacyGrounded;
        keywords?: LegacyField<unknown>;
        entries?: (ResumeEntry & { bullets?: LegacyBullet[] })[];
      };
      return {
        key: s.key,
        prose: legacy.prose ? asGrounded(legacy.prose) : undefined,
        keywords: legacy.keywords
          ? {
              value: asGroups(legacy.keywords.value),
              source: asGroups(legacy.keywords.source),
            }
          : undefined,
        entries: legacy.entries?.map((e) => ({
          ...e,
          bullets: (e.bullets ?? []).map(asBullet),
        })),
        items: s.items,
      };
    }),
  };
}

// --- Rendering --------------------------------------------------------------

/**
 * The resolved document as plain text, for handing to the letter prompt so the
 * email and the attachment argue the same case.
 */
export function resumeToPlainText(resume: TailoredResume): string {
  const parts: string[] = [];

  // resume.sections is already the document's running order; re-deriving one
  // here would make the plain text disagree with the .tex about what the
  // document says and in what order.
  for (const section of resume.sections) {
    const spec = specFor(resume.shape, section.key);
    if (!spec) continue;

    const lines: string[] = [];
    const prose = section.prose?.value.trim();
    if (prose) lines.push(prose);

    const keywords = section.keywords?.value ?? [];
    if (keywords.length) lines.push(formatSkillGroups(keywords));

    for (const entry of section.entries ?? []) {
      const dates = [entry.startDate, entry.endDate].filter(Boolean).join(" - ");
      const head = [entry.heading, entry.organization].filter(Boolean).join(", ");
      lines.push(`${head}${dates ? ` (${dates})` : ""}`);
      for (const b of visibleBullets(entry.bullets)) lines.push(`- ${b.value}`);
    }

    for (const item of section.items ?? []) lines.push(`- ${item}`);

    if (lines.length) parts.push(`${spec.title.toUpperCase()}\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}
