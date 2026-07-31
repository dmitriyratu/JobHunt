import { NextRequest, NextResponse } from "next/server";
import { removeDashTells } from "@/lib/deAiText";
import {
  SHAPE_DESCRIPTION,
  SHAPE_LABEL,
  allowsPageTarget,
  specsFor,
} from "@/lib/documentShape";
import { formatMatchReport } from "@/lib/matchReportPrompt";
import { runGroundingPass } from "@/lib/groundingPass";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { expandCitation, logicalLines } from "@/lib/sourceLines";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type {
  DocumentShape,
  MatchReport,
  ResumeDraft,
  ResumeSection,
  ResumeEntry,
  ResumePageTarget,
} from "@/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are an expert resume and CV writer. Rewrite a candidate's existing career document so that it targets one specific job posting.

THE DOCUMENT YOU ARE PRODUCING: {{SHAPE}}

YOU ARE NOT WRITING A DOCUMENT FROM SCRATCH. You are re-presenting material the candidate already has. Everything you output must be traceable to the document you were given.

THE MATCH REPORT IS YOUR BRIEF. It is a requirement-by-requirement analysis of this candidate against this posting, already weighted by importance. Use it to decide what gets prominence:
- Bullets that evidence a CRITICAL requirement come first within their entry.
- Requirements marked EXCEEDS are ones the candidate is well past. Make the margin visible: the number, the scope, the scale.
- Bullets that evidence nothing in the report are the first candidates to drop.
- Never mention the report, the posting, or the tailoring itself in the output.

THE SECTION LIST IS FIXED. This document has exactly these sections, in this order. You fill them in; you do not choose them.

{{SECTIONS}}

- Return one object per key listed above, using the key string exactly as written, and nothing else. Never invent a section, never retitle one, never reorder them.
- The titles above are printed by the app, not by you. Do not repeat a section title inside its own content.
- A section marked (required) always comes back filled. A section marked (optional) comes back empty when the source document holds nothing that belongs in it, and an empty optional section is dropped before printing. Padding one with material that belongs under another key is worse than leaving it empty.
- Every piece of source material goes under the key whose description covers it, and only there. When two keys could take it, the more specific one wins.

HOW TO FILL A SECTION. A section object carries its key and exactly one content field, the one its layout names. Do not include the other three.
- layout "prose": {"key": ..., "prose": {value, sources}}
- layout "keywords": {"key": ..., "keywords": {value, source}}, where value and source are both lists of {label, items}
- layout "entries": {"key": ..., "entries": [...]}
- layout "list": {"key": ..., "items": [...]}, one plain string per printed line

Give every entry and every bullet an id that is stable and unique across the whole document, e.g. "exp-1" and "exp-1-b2". The review UI and the follow-up chat address them by id.

WHAT YOU MAY NEVER CHANGE. These are copied character-for-character from the source document:
- Employer, hospital, institution and lab names; job titles; degree and programme names; dates; locations.
- Certification, licence and award names.
- Publication and presentation citations: authors, title, journal or meeting, year.
Altering any of these is misrepresentation, not tailoring. If the source is ambiguous, copy it as written rather than tidying it.

WHAT YOU MAY CHANGE:
- Prose sections. Rewrite to lead with what this posting cares about most.
- The grouping and order of a keywords section. See the rules below.
- Which bullets appear under each entry, and their order.
- The wording of each bullet, within the grounding rule below.

SKILLS ARE KEYWORDS, NOT PROSE. A keywords section exists to be skimmed in three seconds and to be matched by keyword search.
- Every entry is 1 to 4 words. "Pediatric Hematology and Oncology" is fine. "Immune checkpoint therapy in pediatric and adolescent lymphomas" is a research topic, not a skill: leave it out.
- Nothing that is a sentence, a paper title, a job title, an employer, an award, a committee, or a volunteer post belongs here. Those belong under one of the section keys above, or nowhere.
- 3 to 5 groups. Category labels are at most 20 characters, ideally one word ("Clinical", "Research", "Languages", "Tools", "Credentials").
- At most 8 entries per group, and at most 24 in total. If the source lists more, keep the ones this posting cares about and drop the rest: an exhaustive keyword list is worse than a selective one. Keywords are the one place you may drop material freely.
- Never add a skill the source document does not already claim.
- "source" is the same skills the document originally listed, in one group with an empty label.

ENTRIES ARE POSITIONS A PERSON HELD. In an entries section "heading" is the job title, programme or degree and "organization" is the employer or institution. Nothing else goes in either field unless that section's description above says otherwise.
- One entry per position at one organization over one continuous period. If someone was a Fellow and also Chief Fellow and also Social Chair within the same fellowship, that is ONE entry. Use the senior title, and let the others be bullets if they are worth a line.
- Never emit two entries with the same organization and overlapping dates. A joint appointment across two named institutions is one entry: put both names in "organization".
- A research project, study, paper or grant is NOT a position. "Targeting CD30 to Overcome Resistance to Immune Checkpoint Inhibitors in Hodgkin Lymphoma" is the name of a project: it belongs under the section key whose description names research, or in a BULLET under the position during which it was done. If the candidate held a named research post, the heading is that post ("Research Fellow"), never the project.
- Volunteer events, outreach days, committee seats and one-off service are not positions in an experience section either. They belong under the section key whose description names service and leadership, or in a bullet under the position they happened during.
- Every entry needs real dates. If you cannot find them in the source, leave startDate and endDate empty. Never invent a placeholder, and never write "Current" as a start date: "Current - Current" is not a date range.
- Never repeat the same bullet under two different entries.

BULLETS ARE ACCOMPLISHMENTS, NOT DESCRIPTIONS.
- A bullet that restates its own entry is worthless. Under "Clinical Fellow, Pediatric Hematology and Oncology" at Memorial Sloan Kettering, the bullet "Current clinical fellowship in Pediatric Hematology and Oncology at Memorial Sloan Kettering" says nothing that the two lines above it did not. Never write one.
- Say what was done, built, treated, led, published, or changed, and at what scale.
- If the source genuinely gives you nothing for an entry beyond its existence, emit ZERO bullets for it rather than padding. An entry with no bullets still prints with its heading, organization and dates, which is all the document actually supports.

THE GROUNDING RULE. Every bullet and every prose section carries "sources": the line or lines of the original document it is built from, copied verbatim. This is not optional and it is checked mechanically.
- If you reword a bullet, "value" is your version and "sources" is the one line it came from.
- YOU MAY COMBINE. If two lines of the original describe one piece of work, write them as one strong bullet and cite both: "Built the ledger pipeline" plus "processed $2B annually" becomes "Built the ledger pipeline processing $2B annually", with both lines in "sources". This is the most valuable thing you can do, and it is not invention — every fact is already the candidate's.
- ORPHAN METRICS ARE NOT BULLETS, AND THEY ARE NOT DROPPABLE. A source line that is only a measurement — no verb of its own, or a subject that is a pronoun or the thing named on the line above ("It clears roughly $2B a year", "The pipeline runs in 14 markets", "Reconciliation caught 1,100 mismatched entries") — describes work that another line names. Fold it into that line and cite both. Printing it alone reads as a fragment; leaving it out throws away the strongest evidence the candidate has, because the number IS the evidence. Scan the source for these before you write, and make sure every one of them ends up attached to something.
- Cite only what you actually used, and never more than three lines. Citing a line you did not draw on is a false claim of support, and the check reads exactly what you cite.
- Combining facts does not license inferring between them. "Worked at MSK" and "published in Haematologica" do not together support "published while at MSK" unless the document says so.
- The rewrite may compress, reorder clauses, front-load a metric, or swap a synonym for the posting's vocabulary. It may NOT add a fact absent from the cited lines: no invented numbers, technologies, team sizes, scopes, or outcomes.
- Do not upgrade the candidate's role. "contributed to" does not become "led". "used" does not become "built". "helped migrate" does not become "owned the migration".
- If a bullet is already well aimed, return it untouched with that one line as its only source.
- If you cannot ground a rewrite, return the original unchanged. Unchanged is always better than embellished.
- To cut a bullet, return it with "dropped": true and the original text as both its value and its only source. Do not delete it from the array. Every bullet you keep has "dropped": false.
- A prose section is written from several lines at once. Cite the ones it rests on. Never return an empty "sources" — if you cannot point at what a sentence is built from, do not write that sentence.

{{LENGTH}}

HOW BULLETS READ. This is a different register from prose:
- Start with a past-tense verb. "Rebuilt", "Led", "Cut", "Shipped", "Owned".
- No first person. No "I", no "my", no "responsible for".
- Not full sentences. No trailing period is required, and do not write one.
- Lead with the outcome or the number when there is one. "Cut settlement lag from 40 minutes to 90 seconds by rebuilding the ledger on Go and Kafka" beats "Worked on the payments ledger, which improved performance".
- One line each where possible. Two at the absolute most.

WRITE LIKE A PERSON, NOT LIKE AN LLM. Recruiters see AI-written documents constantly and the tells below get them binned:
- NEVER use em dashes or en dashes. Use a comma, a colon, or two sentences. Plain hyphens in words are fine.
- Do not use these words at all: delve, leverage, robust, seamless, holistic, spearheaded, pivotal, testament to, landscape, realm, resonate, passionate, thrilled, honed, adept, synergy, streamlined, "instrumental in", "played a key role".
- No rule-of-three adjective lists ("fast, reliable, and scalable").
- No filler qualifiers: "successfully", "effectively", "various", "numerous", "cutting-edge", "state-of-the-art".
- A prose section is 2 to 3 lines, no first person, and contains no adjective that isn't doing work.

Return the complete structure for the sections you have chosen: every entry and every bullet.`;

/** The page budget only exists for a resume; a CV is never trimmed to fit. */
const RESUME_LENGTH_RULE = `LENGTH. The candidate wants this to fit {{PAGE_TARGET}}. As a working budget, one page is about 18 to 22 total bullets across all entries; two pages about 34 to 40. Cut from the oldest and least relevant entries first. An entry from fifteen years ago may legitimately keep only one bullet. Never drop an entry entirely, and never drop the most recent position below three bullets.`;

const CV_LENGTH_RULE = `LENGTH. A CV has no page target and nothing is cut for space. Dropping a publication, a presentation, a post or an award to save room is a defect on a document whose entire purpose is to be complete. Return every position, degree, licence, publication, presentation, award and language the source document contains, under the key whose description covers it. Mark a bullet "dropped": true only if you would never print it at all, which on a CV is close to nothing: tighten wording instead of deleting material.

COMPLETENESS ALSO MEANS PUTTING THINGS IN THE RIGHT PLACE. A research study or named project gets its own entry in the research section, never an entry in clinical experience. A one-day volunteer event, an outreach day or a committee seat gets its own entry in the leadership and service section, never an entry in clinical experience. Clinical experience is for positions delivering patient care and nothing else.`;

/**
 * The section skeleton, handed to the model as the only list of keys it may
 * fill. The hint is passed through verbatim: it is written for the model, and
 * paraphrasing it here would let the prompt and the spec drift apart.
 */
function sectionBrief(shape: DocumentShape): string {
  return specsFor(shape)
    .map(
      (spec) =>
        `- key "${spec.key}" | title "${spec.title}" | layout ${spec.layout} | ${
          spec.core ? "required" : "optional"
        } | band ${spec.band}\n  ${spec.hint}`
    )
    .join("\n");
}

/**
 * How the model is told to choose and order sections.
 *
 * The catalogue is deliberately larger than any one document should use, so the
 * instruction that matters is the one about leaving sections out. The band
 * numbers are explained rather than enforced here — orderSectionKeys re-sorts
 * by band regardless of what comes back — but a model that understands the
 * spine produces a better within-band order than one that is silently corrected.
 */
const SECTION_SELECTION_RULE = `CHOOSING SECTIONS. The list above is a catalogue of every section this document may contain, not a checklist. Return only the sections this posting and this candidate actually justify.
- Sections marked required: always return them, unless the source document genuinely contains nothing for them.
- Sections marked optional: return one only when the source document has real material for it AND the posting gives a reason to show it. An optional section with one thin entry is worse than no section.
- Never invent a key. A key not on the list above is discarded, and its content is lost with it.

ORDERING. Return the sections in the order you want them read. The order is honoured within a band and ignored between bands: band 0 always prints before band 1, and so on, so the document keeps its spine no matter what you return. What you control is the order inside a band. Use it. If the posting is research-led, research comes before the other band-3 sections; if it is a teaching post, teaching leads its band. Rank by what this specific posting asks for, most relevant first.`;

// --- Schema -----------------------------------------------------------------
// Strict mode wants every property named in `required` and
// additionalProperties:false at every level, nested ones included. A section is
// an anyOf over the four layouts, so each one carries only the content field it
// actually uses.

const BULLET_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Stable slug, unique across the document." },
    value: { type: "string", description: "The bullet as it should appear." },
    sources: {
      type: "array",
      description:
        "The line or lines from the uploaded document this draws on, verbatim. One for a reword, two or three when combining facts. Never more than three.",
      items: { type: "string" },
    },
    dropped: {
      type: "boolean",
      description: "True to cut this bullet from the document. Keep value and source filled.",
    },
  },
  required: ["id", "value", "sources", "dropped"],
  additionalProperties: false,
} as const;

const SKILL_GROUP_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Short category, e.g. 'Clinical'." },
    items: { type: "array", items: { type: "string" } },
  },
  required: ["label", "items"],
  additionalProperties: false,
} as const;

const ENTRY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    heading: {
      type: "string",
      description: "Job title, programme or degree, copied from the source.",
    },
    organization: { type: "string", description: "Employer, institution or lab." },
    location: { type: "string" },
    startDate: { type: "string", description: "As the source wrote it, e.g. 'July 2024'." },
    endDate: { type: "string" },
    bullets: { type: "array", items: BULLET_SCHEMA },
  },
  required: ["id", "heading", "organization", "location", "startDate", "endDate", "bullets"],
  additionalProperties: false,
} as const;

/**
 * The keys of this shape that use a given layout.
 *
 * Each variant's `key` is restricted to exactly these, which is what stops a
 * section from arriving in the wrong shape. gpt-5.6-sol returned
 * `{"key":"experience","prose":{"value":"","sources":[]}}` — a free-string key
 * let it answer the entries section in the prose variant, the empty prose was
 * dropped as contentless, and the resume came back with no jobs on it. An enum
 * makes that unrepresentable rather than merely discouraged.
 */
function keysWithLayout(shape: DocumentShape, layout: string): string[] {
  return specsFor(shape)
    .filter((spec) => spec.layout === layout)
    .map((spec) => spec.key);
}

const keySchema = (shape: DocumentShape, layout: string) =>
  ({
    type: "string",
    enum: keysWithLayout(shape, layout),
    description: "Exactly one of the section keys given in the instructions.",
  }) as const;

/**
 * One variant per layout, built for one shape.
 *
 * A section used to be a single object carrying all four content fields, three
 * of which came back empty every time — a publications list shipped an empty
 * prose object, an empty keywords object and an empty entries array before
 * getting to its items. That was a workaround for strict mode wanting one
 * shape; `anyOf` expresses it properly, and the variants are distinguishable by
 * their key and their content field together.
 */
const sectionSchema = (shape: DocumentShape) => ({
  // A layout no key in this shape uses would produce `enum: []`, which the API
  // rejects — so the variant goes away with the keys.
  anyOf: [
    {
      type: "object",
      description: "A prose section, e.g. a summary.",
      properties: {
        key: keySchema(shape, "prose"),
        prose: {
          type: "object",
          properties: {
            value: { type: "string" },
            sources: {
              type: "array",
              description:
                "The lines of the uploaded document this is built from, verbatim. A summary draws on several; cite the ones it actually rests on.",
              items: { type: "string" },
            },
          },
          required: ["value", "sources"],
          additionalProperties: false,
        },
      },
      required: ["key", "prose"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "A keywords section, e.g. skills.",
      properties: {
        key: keySchema(shape, "keywords"),
        keywords: {
          type: "object",
          properties: {
            value: { type: "array", items: SKILL_GROUP_SCHEMA },
            source: {
              type: "array",
              items: SKILL_GROUP_SCHEMA,
              description: "The original list as the document gave it, one group, empty label.",
            },
          },
          required: ["value", "source"],
          additionalProperties: false,
        },
      },
      required: ["key", "keywords"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "An entries section: dated positions, degrees or projects.",
      properties: {
        key: keySchema(shape, "entries"),
        entries: { type: "array", items: ENTRY_SCHEMA },
      },
      required: ["key", "entries"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "A list section: one plain string per printed line.",
      properties: {
        key: keySchema(shape, "list"),
        items: { type: "array", items: { type: "string" } },
      },
      required: ["key", "items"],
      additionalProperties: false,
    },
  ].filter((variant) => (variant.properties.key.enum as readonly string[]).length > 0),
});

const resumeSchema = (shape: DocumentShape) =>
  ({
    type: "object",
    properties: {
      sections: {
        type: "array",
        description: "One object per section key given in the instructions, in that order.",
        items: sectionSchema(shape),
      },
    },
    required: ["sections"],
    additionalProperties: false,
  }) as const;

// --- Structural clean-up ----------------------------------------------------
// The prompt asks for all of this; these are the parts worth enforcing, because
// a duplicated entry or a bullet that restates its own heading is visible
// garbage on a document the user is about to send to an employer.

/** Words too generic to make a bullet say anything the headings didn't. */
const FILLER = new Set([
  "a", "an", "the", "and", "or", "of", "in", "at", "for", "to", "with", "on", "as",
  "current", "currently", "ongoing", "present", "role", "position", "serving",
  "serve", "served", "working", "work", "is", "was", "are", "were", "be", "being",
  "this", "that", "my", "i", "new", "program", "programme",
  // Verbs that describe holding the post rather than doing anything in it.
  // Without these, "Completed general pediatrics residency at Children's
  // Hospital of Michigan" reads as informative because of the word "completed".
  "completed", "complete", "finished", "attended", "obtained", "received",
  "participated", "undertook", "undertaking", "appointed", "selected",
]);

/** Crude stem so "fellowship" and "Fellow" collide. */
function stem(word: string): string {
  return word.slice(0, 5);
}

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w))
    .map(stem);
}

/**
 * True when a bullet says nothing its own heading didn't already say.
 *
 * Requires EVERY content word to be accounted for by the heading, organization
 * or location, so "Led pediatric hematology clinics" survives (nothing supplies
 * "led") while "Current clinical fellowship in Pediatric Hematology and
 * Oncology at Memorial Sloan Kettering Cancer Center" does not.
 */
function restatesHeading(
  bullet: string,
  entry: Pick<ResumeEntry, "heading" | "organization" | "location">
): boolean {
  const tokens = contentTokens(bullet);
  if (tokens.length === 0) return true;
  const heading = new Set(
    contentTokens(`${entry.heading} ${entry.organization} ${entry.location}`)
  );
  return tokens.every((t) => heading.has(t));
}

function normKey(...parts: string[]): string {
  return parts.map((p) => p.trim().toLowerCase().replace(/\s+/g, " ")).join("|");
}

/** Years mentioned in a free-text date like "July 2024" or "2025 - 2026". */
function yearsOf(...parts: string[]): number[] {
  return parts
    .join(" ")
    .match(/\b(19|20)\d{2}\b/g)
    ?.map(Number) ?? [];
}

/** "Present", "Current", "Ongoing": an end date the source left running. */
function isOngoing(endDate: string): boolean {
  return endDate.trim() !== "" && yearsOf(endDate).length === 0;
}

/**
 * Whether two organization strings name the same place.
 *
 * Exact matching is not enough: the model writes the same joint appointment as
 * "Memorial Sloan Kettering Cancer Center / NewYork-Presbyterian Hospital /
 * Weill Cornell Medical Center" under one heading and "...NewYork-Presbyterian,
 * Weill Cornell Medical Center" under another. Token overlap catches that
 * without matching two genuinely different employers.
 */
function sameEmployer(a: string, b: string): boolean {
  const norm = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2)
    );
  const A = norm(a);
  const B = norm(b);
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

/**
 * A title held *during* another position at the same place: "Chief Fellow,
 * 2026-2027" sitting inside "Clinical Fellow, July 2024 to June 2027". These
 * arrive as separate entries and read as job-hopping through three jobs at one
 * hospital.
 *
 * A range still running ("July 2024 to Present") is open at the top, so it can
 * contain a later stint but cannot itself sit inside one that already closed:
 * a job starting the month the previous one ended is a promotion, not a title
 * held during it.
 */
function isNestedWithin(
  inner: Pick<ResumeEntry, "organization" | "startDate" | "endDate">,
  outer: Pick<ResumeEntry, "organization" | "startDate" | "endDate">
): boolean {
  if (!sameEmployer(inner.organization, outer.organization)) return false;
  const i = yearsOf(inner.startDate, inner.endDate);
  const o = yearsOf(outer.startDate, outer.endDate);
  if (i.length === 0 || o.length === 0) return false;
  const outerOpen = isOngoing(outer.endDate);
  if (isOngoing(inner.endDate) && !outerOpen) return false;
  const outerEnd = outerOpen ? Infinity : Math.max(...o);
  return Math.min(...i) >= Math.min(...o) && Math.max(...i) <= outerEnd;
}

/**
 * Merges entries the model split that are really one position, and drops
 * bullets that only restate their heading.
 *
 * Exact key matches merge: same organization over the same dates, or the same
 * heading over the same dates at two named institutions (a joint appointment).
 * Only dated entries take that path, because two undated research projects at
 * one lab are two projects, not one duplicated post. Anything else needing
 * arithmetic on free text like "July 2024" is left alone rather than guessed at.
 *
 * `seenBullets` is shared across every section so the same fact told twice, once
 * under a fellowship and once under a research post, only prints once.
 */
function consolidateEntries(
  entries: ResumeEntry[],
  seenBullets: Set<string> = new Set()
): ResumeEntry[] {
  const out: ResumeEntry[] = [];
  const byOrgDates = new Map<string, number>();
  const byHeadingDates = new Map<string, number>();

  for (const entry of entries) {
    const dated = yearsOf(entry.startDate, entry.endDate).length > 0;
    const orgKey = normKey(entry.organization, entry.startDate, entry.endDate);
    const headingKey = normKey(entry.heading, entry.startDate, entry.endDate);

    let target = dated
      ? byOrgDates.get(orgKey) ?? byHeadingDates.get(headingKey)
      : undefined;

    // Longest-running position at that organization wins, so a fellowship
    // absorbs the Chief Fellow and committee titles held inside it rather than
    // the reverse.
    if (target === undefined) {
      const nested = out.findIndex(
        (o) => isNestedWithin(entry, o) || isNestedWithin(o, entry)
      );
      if (nested !== -1) {
        const outer = out[nested];
        if (isNestedWithin(outer, entry) && !isNestedWithin(entry, outer)) {
          // The one already stored is the shorter stint; promote this one.
          outer.heading = entry.heading;
          outer.startDate = entry.startDate;
          outer.endDate = entry.endDate;
        }
        target = nested;
      }
    }

    if (target !== undefined) {
      const existing = out[target];
      // A joint appointment written two different ways stays one organization.
      if (
        normKey(existing.organization) !== normKey(entry.organization) &&
        !sameEmployer(existing.organization, entry.organization)
      ) {
        existing.organization = `${existing.organization} / ${entry.organization}`;
      }
      existing.bullets = [...existing.bullets, ...entry.bullets];
      continue;
    }

    const index = out.push({ ...entry, bullets: [...entry.bullets] }) - 1;
    if (dated) {
      byOrgDates.set(orgKey, index);
      byHeadingDates.set(headingKey, index);
    }
  }

  return out.map((entry) => {
    const dated = yearsOf(entry.startDate, entry.endDate).length > 0;
    return {
      ...entry,
      // "Current - Current" and other date-shaped noise: if neither end names a
      // year, no date is better than a wrong one.
      startDate: dated ? entry.startDate : "",
      endDate: dated ? entry.endDate : "",
      bullets: entry.bullets.filter((b) => {
        if (restatesHeading(b.value, entry)) return false;
        const key = normKey(b.value);
        if (seenBullets.has(key)) return false;
        seenBullets.add(key);
        return true;
      }),
    };
  });
}

type TailorRequest = {
  resumeText: string;
  jobDescription: string;
  matchReport?: MatchReport | null;
  emphasis?: string;
  shape?: DocumentShape;
  pageTarget?: ResumePageTarget;
  apiKey?: string;
};

const PAGE_TARGET_LABEL: Record<ResumePageTarget, string> = {
  1: "one page",
  2: "two pages",
};

function buildSystemPrompt(shape: DocumentShape, pageTarget: ResumePageTarget | null): string {
  const length =
    pageTarget === null
      ? CV_LENGTH_RULE
      : RESUME_LENGTH_RULE.replace("{{PAGE_TARGET}}", PAGE_TARGET_LABEL[pageTarget]);

  return SYSTEM_PROMPT.replace(
    "{{SHAPE}}",
    `${SHAPE_LABEL[shape]}. ${SHAPE_DESCRIPTION[shape]}`
  )
    .replace("{{SECTIONS}}", `${sectionBrief(shape)}\n\n${SECTION_SELECTION_RULE}`)
    .replace("{{LENGTH}}", length);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TailorRequest;
    const { resumeText, jobDescription, matchReport, emphasis, apiKey } = body;
    const shape: DocumentShape = body.shape === "cv" ? "cv" : "resume";
    // A CV is never trimmed to a page count, so it carries no target at all
    // rather than a target the prompt is told to ignore.
    const pageTarget: ResumePageTarget | null = allowsPageTarget(shape)
      ? body.pageTarget === 2
        ? 2
        : 1
      : null;

    if (!resumeText?.trim()) {
      return NextResponse.json(
        { error: "Resume is required. Upload your resume first." },
        { status: 400 }
      );
    }

    if (!jobDescription?.trim()) {
      return NextResponse.json({ error: "Job description is required." }, { status: 400 });
    }

    const client = getOpenAIClient(apiKey);
    const taskModel = getTaskModel("tailor-resume");

    const contextParts = [
      "## Candidate Document (the only source of truth for facts)\n" + resumeText.trim(),
      "## Job Description\n" + jobDescription.trim(),
    ];

    if (matchReport) {
      contextParts.push("## Match Report\n" + formatMatchReport(matchReport));
    }

    if (emphasis?.trim()) {
      contextParts.push(
        "## What the candidate wants emphasised\n" +
          emphasis.trim() +
          "\n\nHonour this where the document supports it. It does not license inventing anything."
      );
    }

    const userPrompt = `${contextParts.join("\n\n")}\n\nProduce the tailored document now.`;

    const { result, usage } = await createStructuredCompletion<ResumeDraft>(client, {
      model: taskModel.id,
      schemaName: "tailored_resume",
      schema: resumeSchema(shape),
      temperature: 0.4,
      supportsTemperature: taskModel.supportsTemperature,
      reasoning: taskModel.reasoning,
      // A full document is several times the size of an email: every section,
      // every entry, every bullet and every bullet's source line come back. A
      // CV carries publication and presentation lists on top of that.
      maxTokens: shape === "cv" ? 8000 : 4000,
      messages: [
        { role: "system", content: buildSystemPrompt(shape, pageTarget) },
        { role: "user", content: userPrompt },
      ],
    });

    if (!result?.sections?.length) {
      return NextResponse.json(
        { error: "Model returned a document with no sections. Try again." },
        { status: 502 }
      );
    }

    // Same treatment the letter gets: dashes are the single loudest AI tell,
    // and they survive an explicit instruction not to use them often enough
    // to be worth stripping mechanically.
    // Line breaks inside a value would render as a paragraph split mid-thought
    // in the document, so they are collapsed here rather than trusted to the
    // prompt.
    const clean = (s: string) => removeDashTells(s ?? "").replace(/\s*\n+\s*/g, " ").trim();

    // One set for the whole document: a bullet repeated under two entries is
    // the same fact told twice, whichever sections they sit in.
    const seenBullets = new Set<string>();

    /**
     * The cited lines, tidied and capped.
     *
     * The cap is enforced here rather than trusted to the prompt: citation is
     * what the grounding check reads, so a bullet that cites ten lines can
     * "support" almost anything. Three is enough to combine two facts and give
     * one of them context.
     */
    // The uploaded document as whole lines, so a citation cut short by the
    // wrapping in the source can be grown back to the bullet it came from.
    const sourceLines = logicalLines(resumeText);

    // A leading list marker is part of how the source document was laid out, not
    // part of the line. Left on, "- Wrote the guide" never matches the value
    // "Wrote the guide", so a verbatim copy looks rewritten and gets checked.
    const citations = (raw: string[] | undefined, cap: number) => {
      const seen = new Set<string>();
      return (raw ?? [])
        .map((s) => expandCitation(s.trim().replace(/^[-*•]\s+/, ""), sourceLines))
        .filter((s) => s && !seen.has(s) && seen.add(s))
        // Expansion can collapse two citations onto one line, which is a
        // duplicate rather than a second piece of evidence.
        .slice(0, cap);
    };

    // A bullet rests on one line, or two or three when it combines. A summary
    // rests on the document: capping it at three left the figures in its fourth
    // and fifth citations unsupported, and the check duly stripped them.
    const BULLET_CITATIONS = 3;
    const PROSE_CITATIONS = 8;

    // Each variant carries one content field, so the others stay undefined
    // rather than being filled with empties.
    const sections: ResumeSection[] = result.sections.map((section) => ({
      key: section.key,
      prose: section.prose && {
        value: clean(section.prose.value),
        sources: citations(section.prose.sources, PROSE_CITATIONS),
      },
      keywords: section.keywords && {
        value: section.keywords.value ?? [],
        source: section.keywords.source ?? [],
      },
      entries:
        section.entries &&
        consolidateEntries(
          section.entries.map((entry) => ({
            ...entry,
            bullets: (entry.bullets ?? []).map((b) => ({
              ...b,
              value: clean(b.value),
              sources: citations(b.sources, BULLET_CITATIONS),
              dropped: Boolean(b.dropped),
            })),
          })),
          seenBullets
        ),
      items: section.items?.map(clean).filter(Boolean),
    }));

    // Verified before it is returned, so nothing ungrounded reaches the .tex.
    // A clean document costs one small call; one with problems costs a repair
    // and a re-check. See runGroundingPass — it never throws, so a checker
    // failure leaves the draft exactly as the model wrote it.
    const { sections: grounded, report: grounding } = await runGroundingPass(
      client,
      sections,
      jobDescription
    );

    return NextResponse.json({
      draft: { sections: grounded } satisfies ResumeDraft,
      shape,
      pageTarget,
      grounding: {
        checked: grounding.checked,
        repaired: grounding.repaired,
        reverted: grounding.reverted,
        skillsRemoved: grounding.skillsRemoved,
        unverified: grounding.unverified,
      },
      usage: {
        model: taskModel.id,
        ...usage,
      },
      // Reported separately so each pass is attributed to its own model rather
      // than folded into the tailoring's cost.
      groundingUsage: grounding.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to tailor resume";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
