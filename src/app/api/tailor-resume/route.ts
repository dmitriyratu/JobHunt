import { NextRequest, NextResponse } from "next/server";
import { removeDashTells, stripFiller } from "@/lib/deAiText";
import {
  SHAPE_DESCRIPTION,
  SHAPE_LABEL,
  allowsPageTarget,
  prefersLatestTitle,
  specsFor,
  toShape,
} from "@/lib/documentShape";
import { formatMatchReport } from "@/lib/matchReportPrompt";
import { usedCitations } from "@/lib/grounding";
import { runGroundingPass } from "@/lib/groundingPass";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { fitToPages } from "@/lib/fitToPages";
import { checkFacts } from "@/lib/factCheck";
import { reviewFacts } from "@/lib/factTriage";
import { formatIndexed, indexSource, resolveCitations, unusedLines } from "@/lib/sourceIndex";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type { ResumeProfile } from "@/lib/settings";
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
- ORDER IS THE RANKING, and it is the main thing you do here. Within every group put the skills this posting cares about first, and order the groups the same way. This works exactly like the bullet ordering below, and it is load-bearing for the same reason: if the document runs long the app thins the grid from the END of each group, so what you put last is what goes.
- Reordering is almost always the right move, not dropping. A skill the posting does not name is not noise — postings are written by people who assume the reader can join up "cloud infrastructure" and "AWS, Terraform, EKS", and a keyword search cannot. A skill that is off the page cannot be matched by anyone, for this role or a later one at the same company. Put it late in its group instead.
- At most 10 entries per group, and at most 36 in total. If the source lists more, first regroup and relabel so related skills share a row; drop only what this posting could not possibly have a use for, weakest last. A skill this posting names is never dropped.
- Never add a skill the source document does not already claim.
- "source" is the same skills the document originally listed, in one group with an empty label.

ENTRIES ARE POSITIONS A PERSON HELD. In an entries section "heading" is the job title, programme or degree and "organization" is the employer or institution. Nothing else goes in either field unless that section's description above says otherwise.
- One entry per position at one organization over one continuous period. If someone was a Fellow and also Chief Fellow and also Social Chair within the same fellowship, that is ONE entry. Use the senior title, and let the others be bullets if they are worth a line.
- Never emit two entries with the same organization and overlapping dates. A joint appointment across two named institutions is one entry: put both names in "organization".
- A research project, study, paper or grant is NOT a position. "Targeting CD30 to Overcome Resistance to Immune Checkpoint Inhibitors in Hodgkin Lymphoma" is the name of a project: it belongs under the section key whose description names research, or in a BULLET under the position during which it was done. If the candidate held a named research post, the heading is that post ("Research Fellow"), never the project.
- A source document almost always follows a project title with a sentence or two about the project. That prose is a BULLET on the entry whose title it sits under. It is never an entry of its own and never a heading: a heading that ends in a full stop is always this mistake, and it costs the real next project its name as well as printing a sentence where a title belongs.
- Volunteer events, outreach days, committee seats and one-off service are not positions in an experience section either. They belong under the section key whose description names service and leadership, or in a bullet under the position they happened during.
- Every entry needs real dates. If you cannot find them in the source, leave startDate and endDate empty. Never invent a placeholder, and never write "Current" as a start date: "Current - Current" is not a date range.
- Never repeat the same bullet under two different entries.

RANK EVERY ENTRY, AND RANK ITS BULLETS. Two orderings matter, and you are the only one who can supply them.
- "relevance" on each entry, 0 to 10, is how much that entry argues for THIS posting. The role the posting is essentially describing is a 10. Real experience with nothing to do with it — a retail job on a platform engineering application — is a 0. Judge the work, not the recency: a 2016 role that did exactly this job outranks a 2024 role that did not.
- Within an entry, put the bullets in the order you want them read, strongest evidence for this posting first.
- Both are load-bearing. If the finished document runs longer than the candidate asked for, the app shortens it by taking the last bullets from the lowest-ranked entries, and by reducing a 0 to a single line of history. It never rewrites anything. So a lazy ranking is not a small mistake: it decides what a hiring manager sees.

BULLETS ARE ACCOMPLISHMENTS, NOT DESCRIPTIONS.
- A bullet that restates its own entry is worthless. Under "Clinical Fellow, Pediatric Hematology and Oncology" at Memorial Sloan Kettering, the bullet "Current clinical fellowship in Pediatric Hematology and Oncology at Memorial Sloan Kettering" says nothing that the two lines above it did not. Never write one.
- Say what was done, built, treated, led, published, or changed, and at what scale.
- If the source genuinely gives you nothing for an entry beyond its existence, emit ZERO bullets for it rather than padding. An entry with no bullets still prints with its heading, organization and dates, which is all the document actually supports.
- The exception is a project, study or grant, where the heading is a name rather than a role. The sentence the source writes beneath such a title states the question, the method or the finding, and that is precisely what its bullets are for. A bullet is only a worthless description when it restates a job title the two lines above it already gave.

THE GROUNDING RULE. Every bullet and every prose section carries "sources": the ID or IDs of the lines of the candidate's document it is built from. This is not optional and it is checked mechanically.
- The candidate's document is given to you below with an ID in front of every line, like [Labc123]. "sources" is a list of those IDs and nothing else. Do not copy the line text into "sources", do not paraphrase it, do not invent an ID.
- If you reword a bullet, "value" is your version and "sources" is the ID of the one line it came from.
- YOU MAY COMBINE. If two lines describe one piece of work, write them as one strong bullet and cite both IDs: [La1] "Built the ledger pipeline" plus [Lb2] "processed $2B annually" becomes "Built the ledger pipeline processing $2B annually", with sources ["La1","Lb2"]. This is the most valuable thing you can do, and it is not invention — every fact is already the candidate's.
- ORPHAN METRICS ARE NOT BULLETS, AND THEY ARE NOT DROPPABLE. A source line that is only a measurement — no verb of its own, or a subject that is a pronoun or the thing named on the line above ("It clears roughly $2B a year", "The pipeline runs in 14 markets", "Reconciliation caught 1,100 mismatched entries") — describes work that another line names. Fold it into that line and cite both. Printing it alone reads as a fragment; leaving it out throws away the strongest evidence the candidate has, because the number IS the evidence. Scan the source for these before you write, and make sure every one of them ends up attached to something.
- Cite only what you actually used, and never more than three IDs. Citing a line you did not draw on is a false claim of support, and the check reads exactly what you cite.
- Combining facts does not license inferring between them. "Worked at MSK" and "published in Haematologica" do not together support "published while at MSK" unless the document says so.
- The rewrite may compress, reorder clauses, front-load a metric, or swap a synonym for the posting's vocabulary. It may NOT add a fact absent from the cited lines: no invented numbers, technologies, team sizes, scopes, or outcomes.
- Do not upgrade the candidate's role. "contributed to" does not become "led". "used" does not become "built". "helped migrate" does not become "owned the migration".
- If a bullet is already well aimed, return it untouched with that one line as its only source.
- If you cannot ground a rewrite, return the original unchanged. Unchanged is always better than embellished.
- RETURN ONLY WHAT YOU KEEP. A bullet you decided against is simply absent. Do not return it marked as cut, do not return it emptied, do not leave a placeholder. The app tracks what you left behind by comparing your citations against the source, so nothing is lost by omitting it and a long document costs a fraction as much to write.
- A prose section is written from several lines at once. Cite the IDs it rests on. Never return an empty "sources" — if you cannot point at what a sentence is built from, do not write that sentence.

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

/** The page budget only exists for the paged shapes; a CV is never trimmed to fit. */
const RESUME_LENGTH_RULE = `LENGTH. The candidate wants this to fit {{PAGE_TARGET}}. As a working budget, one page is about 18 to 22 total bullets across all entries; two pages about 34 to 40. Cut from the oldest and least relevant entries first. An entry from fifteen years ago may legitimately keep only one bullet. Never drop an entry entirely, and never drop the most recent position below three bullets.`;

/**
 * What "no page target" means, per shape.
 *
 * All three unpaged shapes are exhaustive, but for different reasons, and the
 * reason changes what exhaustive means. A clinical CV is complete because the
 * credentialing file has to be; an academic CV because the publication and
 * funding record IS the application; a federal resume because a reviewer scores
 * specialised experience from detail that a page limit would delete. Sharing one
 * rule between them meant the federal resume was being told not to drop
 * publications, which is not its failure mode.
 */
const UNPAGED_LENGTH_RULE: Partial<Record<DocumentShape, string>> = {
  cv: `LENGTH. A CV has no page target and nothing is cut for space. Dropping a publication, a presentation, a post or an award to save room is a defect on a document whose entire purpose is to be complete. Return every position, degree, licence, publication, presentation, award and language the source document contains, under the key whose description covers it. Leave a bullet out only if you would never print it at all, which on a CV is close to nothing: tighten wording instead of deleting material.

COMPLETENESS ALSO MEANS PUTTING THINGS IN THE RIGHT PLACE. A research study or named project gets its own entry in the research section, never an entry in clinical experience. A one-day volunteer event, an outreach day or a committee seat gets its own entry in the leadership and service section, never an entry in clinical experience. Clinical experience is for positions delivering patient care and nothing else.`,

  academic: `LENGTH. An academic CV has no page target and nothing is cut for space. The publication, presentation and funding record is the substance of the application, so returning a selection of it is a defect. Return every publication, presentation, grant, appointment, course taught and service role the source document contains, under the key whose description covers it.

COMPLETENESS ALSO MEANS PUTTING THINGS IN THE RIGHT PLACE. A position held is an appointment; the work done in it is a research entry. A named project or study gets its own entry under research, never an entry under appointments. Journal refereeing and editorial board seats are service, never publications. A dissertation is a bullet under its degree, not a publication, unless the source document lists it as published.`,

  federal: `LENGTH. A federal resume has no page target and is expected to run three to eight pages. Compressing it is the single most common reason a qualified candidate is scored ineligible: a human-resources reviewer rates specialised experience from what is written under each position, and cannot credit what is not there. Be exhaustive. Return every position the source document contains, including ones a two-page resume would drop, and give recent and relevant positions six to ten bullets rather than three.

WRITE FOR THE RATING PROCESS. Use the announcement's own vocabulary wherever the source document supports the claim, because the first screen is a literal match against the stated qualifications. Where the source states hours per week, pay grade, salary or a supervisor for a position, put them in that entry's first bullet; where it does not, leave them out rather than inventing them. Never inflate a grade, a date range or a duty to reach a qualification the candidate does not have — a false statement on a federal application is a criminal matter, not an embellishment.`,
};

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
        'IDs of the source lines this draws on, e.g. ["Labc123"]. One for a reword, two or three when combining. Never more than three, and never the line text itself.',
      items: { type: "string" },
    },
  },
  required: ["id", "value", "sources"],
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
      description:
        "Job title, programme, degree or project name, copied from the source. A NAME, never a sentence: it does not end in a full stop and it is not a description of the work. If the source follows a project title with a paragraph about it, that paragraph is a bullet on the same entry — it is not the next entry's heading.",
    },
    organization: { type: "string", description: "Employer, institution or lab." },
    location: { type: "string" },
    startDate: { type: "string", description: "As the source wrote it, e.g. 'July 2024'." },
    endDate: { type: "string" },
    relevance: {
      type: "integer",
      description:
        "0 to 10: how much this entry argues for THIS posting. 10 is the role the posting is essentially describing. 0 is real experience that has nothing to do with it. Used to decide what survives when the document has to be shortened, so rank honestly rather than generously.",
    },
    bullets: { type: "array", items: BULLET_SCHEMA },
  },
  required: [
    "id",
    "heading",
    "organization",
    "location",
    "startDate",
    "endDate",
    "relevance",
    "bullets",
  ],
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
                "IDs of the source lines this is built from. A summary draws on several; cite the ones it actually rests on.",
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

/**
 * True when a heading arrived as a sentence rather than as a title.
 *
 * Research sections in a source document are written as three lines the entry
 * schema has no shape for:
 *
 *     Targeting CD30 to Overcome Resistance ... in Hodgkin Lymphoma
 *     Roth Laboratory, NYU Langone · New York, NY
 *     Investigating CD30-directed therapeutic strategies to overcome ...
 *
 * Title, affiliation, then a paragraph that is neither. The model reads the
 * paragraph as the start of the NEXT project and returns it as that project's
 * heading, so the sentence prints in bold where a title belongs and the real
 * project loses its name. Both projects come out wrong, and nothing downstream
 * notices: the fields are all populated and every check passes.
 *
 * The schema and the prompt now both say a heading is a title, but a rule the
 * model can break silently needs something behind it — the same argument as
 * `restatesHeading` above.
 *
 * Deliberately narrow, because a false positive costs an entry its name. Both
 * signals must fire:
 *
 *   A full stop that ends an actual sentence. "M.D." and "Ph.D." end in one
 *   too, so a capital immediately before the stop does not count.
 *
 *   Eight or more content words. Real titles do run long — "Targeting CD30 to
 *   Overcome Resistance to Immune Checkpoint Inhibitors in Hodgkin Lymphoma" is
 *   thirteen — but they do not also close with a full stop.
 *
 * A description written without a closing full stop is missed. That is the
 * intended trade: one that slips through costs an ugly entry, and a title taken
 * by mistake costs the entry its identity.
 */
function isProseHeading(heading: string): boolean {
  const text = heading.trim();
  if (!/[a-z0-9)]\.$/.test(text)) return false;
  return contentTokens(text).length >= 8;
}

/**
 * Moves a sentence-shaped heading down into the entry's own bullets.
 *
 * Demoted rather than deleted: the sentence is real content the candidate
 * wrote, and it describes work this entry did even when the model attached it
 * to the wrong one. As a bullet it prints where a description belongs, which is
 * what the section hints have always asked for ("bullets state the question,
 * the method and the finding").
 *
 * The entry keeps its organisation and dates and loses only its heading; both
 * renderers promote the organisation into the heading's place when it is empty.
 * That is honest about what was lost — the project's real title is not
 * recoverable from here, and inventing one would be worse than printing the lab
 * it was done in.
 *
 * The bullet cites itself, which makes it verbatim (see `isVerbatim`) and keeps
 * the grounding pass from rewriting a sentence that was copied out of the
 * source in the first place. Headings are verbatim by contract — `checkFacts`
 * already verifies them against the upload — so nothing is claimed here that
 * was not already being claimed one line higher up.
 */
function demoteProseHeading(entry: ResumeEntry): ResumeEntry {
  if (!isProseHeading(entry.heading)) return entry;
  const value = entry.heading.trim();
  return {
    ...entry,
    heading: "",
    bullets: [
      { id: `${entry.id}-lead`, value, sources: [value], dropped: false },
      ...entry.bullets,
    ],
  };
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
 * Whether one entry starts later than another, by year.
 *
 * A tie or an undated side answers false, which leaves whatever is already
 * stored in place. The model returns entries most recent first, so on a tie
 * that keeps the more recent of the two.
 */
function startsLater(
  a: Pick<ResumeEntry, "startDate">,
  b: Pick<ResumeEntry, "startDate">
): boolean {
  const ya = yearsOf(a.startDate);
  const yb = yearsOf(b.startDate);
  if (ya.length === 0 || yb.length === 0) return false;
  return Math.min(...ya) > Math.min(...yb);
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
 * Merges entries the model split that are really one position, demotes a
 * heading that arrived as a sentence, and drops bullets that only restate their
 * heading.
 *
 * Exact key matches merge: same organization over the same dates, or the same
 * heading over the same dates at two named institutions (a joint appointment).
 * Only dated entries take that path, because two undated research projects at
 * one lab are two projects, not one duplicated post. Anything else needing
 * arithmetic on free text like "July 2024" is left alone rather than guessed at.
 *
 * `seenBullets` is shared across every section so the same fact told twice, once
 * under a fellowship and once under a research post, only prints once.
 *
 * `preferLatestTitle` decides which of two nested titles survives the merge.
 * See prefersLatestTitle: the answer is opposite for a CV and a resume, and the
 * dates alone cannot tell the two cases apart.
 */
function consolidateEntries(
  entries: ResumeEntry[],
  seenBullets: Set<string> = new Set(),
  preferLatestTitle = false
): ResumeEntry[] {
  const out: ResumeEntry[] = [];
  const byOrgDates = new Map<string, number>();
  const byHeadingDates = new Map<string, number>();

  // Demoted first, so the merge below keys on what the entry actually is. A
  // sentence used as a heading is a key nothing else will ever match, which is
  // its own small reason the split entries never got merged back together.
  for (const entry of entries.map(demoteProseHeading)) {
    const dated = yearsOf(entry.startDate, entry.endDate).length > 0;
    const titled = entry.heading.trim() !== "";
    const orgKey = normKey(entry.organization, entry.startDate, entry.endDate);
    const headingKey = normKey(entry.heading, entry.startDate, entry.endDate);

    // An untitled entry is not looked up or stored by heading: after a
    // demotion the heading is "", and two of those over the same dates would
    // key identically and merge two unrelated positions into one.
    let target = dated
      ? byOrgDates.get(orgKey) ?? (titled ? byHeadingDates.get(headingKey) : undefined)
      : undefined;

    // A stint sitting inside another at the same employer is one position, so
    // the two collapse into one dated block. Which title that block prints is
    // the interesting part, and it is decided below.
    if (target === undefined) {
      const nested = out.findIndex(
        (o) => isNestedWithin(entry, o) || isNestedWithin(o, entry)
      );
      if (nested !== -1) {
        const outer = out[nested];
        // Whether the entry already stored is the shorter stint, and this one
        // the span containing it.
        const storedIsInner =
          isNestedWithin(outer, entry) && !isNestedWithin(entry, outer);

        // WHICH TITLE SURVIVES, and why it depends on the document.
        //
        // Two roles at one employer with nested dates are the same shape on
        // paper and mean opposite things. On a CV the inner stint is a title
        // held *inside* a training post — Chief Fellow within a three year
        // Clinical Fellowship — and the programme is the position, so the
        // longer-running title is the right one.
        //
        // On a resume the identical dates are a promotion: Staff Engineer from
        // March 2026 inside Senior Engineer from January 2024. Taking the
        // longer-running title there printed "Senior Engineer, 2024-2027" over
        // a span that ended as Staff Engineer, deleting the promotion and
        // leaving the junior title in the one place a reader scans first.
        //
        // Decided before the dates move, because startsLater reads them.
        //
        // An empty heading is never adopted either way: a demoted entry carries
        // one, and taking it would blank a title the other side supplied
        // correctly.
        const takeHeading = preferLatestTitle
          ? startsLater(entry, outer)
          : storedIsInner;
        if (takeHeading && titled) outer.heading = entry.heading;

        // The span is always the longer of the two — the person was there for
        // all of it — whichever title ends up on it.
        if (storedIsInner) {
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
      // A title survives the merge from whichever side has one. Two entries
      // reach here as one position, and if the surviving side is the one whose
      // heading was demoted then the other side is holding the only name this
      // position has left.
      if (!existing.heading.trim() && titled) existing.heading = entry.heading;
      existing.bullets = [...existing.bullets, ...entry.bullets];
      continue;
    }

    const index = out.push({ ...entry, bullets: [...entry.bullets] }) - 1;
    if (dated) {
      byOrgDates.set(orgKey, index);
      if (titled) byHeadingDates.set(headingKey, index);
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
  /**
   * Needed to typeset, and therefore to measure. Without it the route still
   * returns a draft, just an unfitted one — the header is part of what fills
   * the first page, so measuring a document rendered without it would be
   * measuring a different document.
   */
  profile?: ResumeProfile;
  apiKey?: string;
};

const PAGE_TARGET_LABEL: Record<ResumePageTarget, string> = {
  1: "one page",
  2: "two pages",
};

function buildSystemPrompt(shape: DocumentShape, pageTarget: ResumePageTarget | null): string {
  const length =
    pageTarget === null
      ? (UNPAGED_LENGTH_RULE[shape] ?? UNPAGED_LENGTH_RULE.cv!)
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
    const { resumeText, jobDescription, matchReport, emphasis, profile, apiKey } = body;
    const shape: DocumentShape = toShape(body.shape);
    // An unpaged shape carries no target at all rather than a target the prompt
    // is told to ignore.
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

    // Built once and used three times: to show the model what it may cite, to
    // resolve what it cited back into the candidate's own words, and to work
    // out by subtraction what nothing cited at all.
    const sourceIndex = indexSource(resumeText);

    const contextParts = [
      "## Candidate Document (the only source of truth for facts)\n" +
        'Every line carries an ID. Cite those IDs in "sources"; never copy the text.\n\n' +
        formatIndexed(sourceIndex),
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
      // every entry, every bullet and every bullet's source line come back. The
      // unpaged shapes carry more on top of that — publication and presentation
      // lists on a CV, six to ten bullets per position on a federal resume — so
      // the budget follows the same paged/unpaged split the length rule does.
      maxTokens: allowsPageTarget(shape) ? 4000 : 8000,
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
    // stripFiller as well as the dash strip: "successfully shipped" is
    // "shipped", and the prompt's ban on these words is not reliable enough to
    // be the only thing enforcing it.
    const clean = (s: string) =>
      stripFiller(removeDashTells(s ?? "").replace(/\s*\n+\s*/g, " ")).trim();

    /**
     * The same tidy for text that is a COPY rather than a rewrite.
     *
     * A list section is not writing. Publication citations, licence names,
     * certifications and awards are "print this line as the document wrote it",
     * which the prompt says explicitly and `checkFacts` verifies. Running
     * `clean` over them applied a writer's rules to a copyist's output, and
     * deleted words out of titles the model had reproduced correctly:
     *
     *     "The Very Low Birth Weight Infant"  ->  "The Low Birth Weight Infant"
     *     "A Highly Sensitive Assay for ..."  ->  "A Sensitive Assay for ..."
     *     "Cost-Benefit Analysis of ..."      ->  "Cost, Benefit Analysis of ..."
     *
     * (the last one an en dash between words, which `removeDashTells` reads as
     * a parenthetical break and replaces with a comma).
     *
     * The damage did not stop at the page. `checkFacts` then compared the
     * mangled line against the upload, failed to find it, and reported it as a
     * fabrication — an issue the app had manufactured itself and then blamed on
     * the model. Whitespace only here; nothing else about a copy is ours to
     * change.
     */
    const tidy = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

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

    // IDs in, the candidate's own lines out. Anything addressing nothing is
    // dropped and the rest de-duplicated, so the fragment, marker and paraphrase
    // repairs the copy-based version needed are gone along with the copying.
    const citations = (raw: string[] | undefined, cap: number) =>
      resolveCitations(raw, sourceIndex).slice(0, cap);

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
        sources: usedCitations(
          clean(section.prose.value),
          citations(section.prose.sources, PROSE_CITATIONS)
        ),
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
            // Clamped rather than trusted: the schema says 0-10 and strict
            // mode enforces the type, not the range.
            relevance: Math.max(0, Math.min(10, Math.round(Number(entry.relevance) || 0))),
            bullets: (entry.bullets ?? []).map((b) => ({
              ...b,
              value: clean(b.value),
              // Filtered against the value, so a line cited but never drawn on
              // cannot donate its figures to the number check.
              sources: usedCitations(clean(b.value), citations(b.sources, BULLET_CITATIONS)),
              // Never the model's call any more. Only the page-fitting pass
              // cuts a bullet, and it sets this when it does.
              dropped: false,
            })),
          })),
          seenBullets,
          prefersLatestTitle(shape)
        ),
      items: section.items?.map(tidy).filter(Boolean),
    }));

    // Verified before it is returned, so nothing ungrounded reaches the .tex.
    // A clean document costs one small call; one with problems costs a repair
    // and a re-check. See runGroundingPass — it never throws, so a checker
    // failure leaves the draft exactly as the model wrote it.
    const { sections: grounded, report: grounding } = await runGroundingPass(
      client,
      sections,
      jobDescription,
      // The whole uploaded document, so fabrication can be decided by exact
      // matching over everything the candidate wrote rather than by judgement
      // over the handful of lines a bullet happened to cite.
      resumeText
    );

    // What this tailoring left behind, derived rather than reported: the source
    // lines nothing on the finished page draws on. Free, complete, and
    // impossible for the model to skip — which the old echo-it-back protocol
    // was not.
    //
    // Everything the document prints, not only what its bullets cite. Headings,
    // employers, dates, keywords and the contact header are copied across
    // rather than rewritten, so they carry no citations at all; measured
    // against citations alone they read as material that was thrown away, when
    // they are in fact the parts reproduced most faithfully.
    const printed = [
      profile?.fullName ?? "",
      profile?.headline ?? "",
      profile?.email ?? "",
      profile?.phone ?? "",
      profile?.location ?? "",
      ...(profile?.links ?? []).map((l) => l.value),
      ...grounded.flatMap((section) => [
        section.prose?.value ?? "",
        // A citation is the source line verbatim, so it settles the question
        // for anything a rewrite drew on however heavily it was reworded.
        ...(section.prose?.sources ?? []),
        ...(section.keywords?.value ?? []).flatMap((g) => [g.label, ...g.items]),
        ...(section.items ?? []),
        ...(section.entries ?? []).flatMap((e) => [
          e.heading,
          e.organization,
          e.location,
          e.startDate,
          e.endDate,
          ...e.bullets.flatMap((b) => [b.value, ...b.sources]),
        ]),
      ]),
    ];
    const omitted = unusedLines(sourceIndex, printed);

    // The copied fields — employers, titles, dates, locations, and the lines of
    // a list section — checked against the uploaded document. Nothing else in
    // the app looks at these, and a fabricated employer would otherwise reach a
    // finished resume having passed every check there is.
    const factIssues = checkFacts(grounded, resumeText);

    // Reviewed before anyone is shown them, which every other check in this
    // route already was. checkFacts is containment, so it fires on arrangement
    // as loudly as on invention — a fellowship the document lists as two
    // entries and the resume writes as one is a warning about an employer that
    // was never in doubt. reviewFacts withholds only the findings a model can
    // point at the candidate's own lines for, and only when those lines survive
    // a word-by-word re-check in code. Anything using a word the document never
    // contains never reaches it.
    const facts = await reviewFacts(client, factIssues, resumeText);

    // Typeset and trim to the requested length. Skipped when the caller sends
    // no profile — the header needs one, and a document rendered without it
    // would be measured at the wrong length.
    const fitted = profile
      ? await fitToPages(
          {
            shape,
            sections: grounded,
            pageTarget,
            omitted,
            generatedAt: new Date().toISOString(),
          },
          profile,
          jobDescription
        )
      : null;

    return NextResponse.json({
      draft: {
        sections: fitted ? fitted.resume.sections : grounded,
        omitted,
        collapsed: fitted?.resume.collapsed ?? [],
      } satisfies ResumeDraft,
      shape,
      pageTarget,
      fit: fitted && {
        pages: fitted.pages,
        trimmed: fitted.trimmed,
        collapsed: fitted.collapsed,
        droppedSections: fitted.droppedSections,
        skillsRemoved: fitted.skillsRemoved,
        summaryShortened: fitted.summaryShortened,
        fits: fitted.fits,
      },
      // Reported, never silently corrected: the app cannot know whether the
      // source or the rewrite is right, and quietly rewriting an employer name
      // would be the same defect from the other direction.
      factIssues: facts.issues,
      // Withheld rather than deleted. A pass that removes warnings has to be
      // auditable, and that needs the warning, the reason and the lines it was
      // cleared on — the same argument as grounding.decisions.
      factsCleared: facts.cleared,
      grounding: {
        checked: grounding.checked,
        repaired: grounding.repaired,
        reverted: grounding.reverted,
        removedSkills: grounding.removedSkills,
        unverified: grounding.unverified,
        flagged: grounding.flagged,
        // Every line the pass acted on, so the corrections can be reviewed
        // rather than taken on trust.
        decisions: grounding.decisions,
      },
      usage: {
        model: taskModel.id,
        ...usage,
      },
      // Reported separately so each pass is attributed to its own model rather
      // than folded into the tailoring's cost.
      groundingUsage: grounding.usage,
      // Empty on any document that raised no copied-field warnings — the
      // reviewer only runs when there is something to review.
      factUsage: facts.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to tailor resume";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
