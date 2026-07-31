import type { DocumentShape, SectionLayout } from "@/types";

/**
 * The catalogue of sections a generated document may contain.
 *
 * This is the "template" in the sense that matters: every section the app can
 * print is declared here once, with its title, its layout and the hint the model
 * is given. The model chooses *which* of these to use and, within limits, what
 * order they come in — but it cannot invent a section, retitle one, or move one
 * out of its band. Titles are never model-authored.
 *
 * ONE CATALOGUE, PER-SHAPE PLACEMENT
 * A section declares which shapes it belongs to and where it sits in each, in
 * `shapes`. Five sections appear in both — Experience, Education, Publications,
 * Honors & Awards, Languages — and keeping two lists meant maintaining those
 * twice. `title` and `hint` are shared defaults; a shape overrides either where
 * it genuinely differs, which is how the same key prints as "Education" on a
 * resume and "Education & Training" on a CV.
 *
 * WHY BANDS RATHER THAN A FIXED ORDER
 * An earlier version fixed the order outright, which made every document look
 * the same at the cost of never adapting to the posting. A posting for a
 * research fellowship and one for a community clinic want the same facts in a
 * different order. So each placement carries a `band`: order is fixed *between*
 * bands and free *within* one. Training always precedes practice, practice
 * always precedes scholarship, references are always last — but whether
 * research outranks clinical trials, or teaching outranks quality improvement,
 * is the posting's call.
 *
 * That keeps the two things that make documents look consistent across dozens
 * of sessions — a stable spine and non-negotiable titles — while letting the
 * parts that genuinely should vary, vary.
 */

/** Where a section sits in one shape, and how it is described there. */
type Placement = {
  /**
   * Ordering band. Sections sort by band first, and within a band they keep the
   * order the model returned them in. Lower bands print first.
   */
  band: number;
  /**
   * A section the document looks wrong without. Required sections are always
   * offered to the model; they are still omitted if the source document
   * genuinely has nothing for them, since an empty heading reads worse than a
   * missing one.
   */
  core?: boolean;
  /** Overrides the shared title where a shape names the same material differently. */
  title?: string;
  /** Overrides the shared hint where a shape wants different material under the key. */
  hint?: string;
};

type SectionDef = {
  key: string;
  layout: SectionLayout;
  /** How a `list` layout renders. Citations get numbers; everything else doesn't. */
  listStyle?: "plain" | "numbered";
  /** Default heading, used by any shape that doesn't override it. */
  title: string;
  /** Default instruction, used by any shape that doesn't override it. */
  hint: string;
  shapes: Partial<Record<DocumentShape, Placement>>;
};

/** A section resolved for one shape — what every consumer actually reads. */
export type SectionSpec = {
  key: string;
  title: string;
  layout: SectionLayout;
  core: boolean;
  band: number;
  listStyle?: "plain" | "numbered";
  hint: string;
};

// Resume bands: 0 opening · 1 skills · 2 practice · 3 credentials · 4 evidence · 5 tail
// CV bands:     0 opening · 1 credentials · 2 practice · 3 scholarship · 4 output ·
//               5 contribution · 6 recognition · 7 skills · 8 references
const CATALOGUE: SectionDef[] = [
  {
    key: "summary",
    title: "Summary",
    layout: "prose",
    hint: "Two to three lines, no first person. Lead with what this posting cares about most.",
    shapes: { resume: { band: 0, core: true } },
  },
  {
    key: "profile",
    title: "Professional Profile",
    layout: "prose",
    hint: "Three or four lines at most, no first person, naming subspecialty focus and the kind of practice sought. Include only when the posting is a specific job rather than a general academic application. A CV earns its keep in the sections below, so keep this short or omit it.",
    shapes: { cv: { band: 0 } },
  },
  {
    key: "skills",
    title: "Skills",
    layout: "keywords",
    hint: "Keywords only, 1-4 words each, grouped under short labels. No sentences, no project names.",
    shapes: { resume: { band: 1, core: true } },
  },
  {
    key: "education",
    title: "Education",
    layout: "entries",
    hint: "heading is the degree, organization the institution. Usually no bullets.",
    shapes: {
      resume: { band: 3, core: true },
      cv: {
        band: 1,
        core: true,
        title: "Education & Training",
        hint: "Most recent first: fellowship, then residency, then medical or graduate school, then undergraduate. heading is the programme or degree, organization the institution. Bullets are rare here.",
      },
    },
  },
  {
    key: "licensure",
    title: "Licensure & Certification",
    layout: "list",
    listStyle: "plain",
    hint: "State or national licences, board certifications, life-support and chemotherapy-provider certifications. One per line, with the issuing body. No dates invented.",
    shapes: { cv: { band: 1, core: true } },
  },
  {
    key: "experience",
    title: "Experience",
    layout: "entries",
    hint: "Paid positions, most recent first. heading is the job title, organization the employer.",
    shapes: {
      resume: { band: 2, core: true },
      cv: {
        band: 2,
        core: true,
        title: "Clinical Experience",
        hint: "Positions delivering patient care. heading is the job title, never a project or study name.",
      },
    },
  },
  {
    key: "projects",
    title: "Selected Projects",
    layout: "entries",
    hint: "Named projects or products that are not a job in themselves. heading is the project name, organization the context it was built in. Use only when the posting cares about built work and the source document describes some; never restate a job here.",
    shapes: { resume: { band: 2 } },
  },
  {
    key: "procedures",
    title: "Procedural Competencies",
    layout: "keywords",
    hint: "Procedures the candidate performs, grouped by label such as 'Independent' or 'With supervision'. Items are procedure names, optionally with a count the source states. Never invent a count. Omit entirely for a non-procedural role.",
    shapes: { cv: { band: 2 } },
  },
  {
    key: "certifications",
    title: "Certifications",
    layout: "list",
    listStyle: "plain",
    hint: "One credential per line, exactly as the resume names it.",
    shapes: { resume: { band: 3 } },
  },
  {
    key: "research",
    title: "Research",
    layout: "entries",
    hint: "Research posts and named projects. heading may be the project title here; organization is the lab, department or institution. This is where a study belongs — never in Clinical Experience.",
    shapes: { cv: { band: 3 } },
  },
  {
    key: "trials",
    title: "Clinical Trials",
    layout: "entries",
    hint: "Trials the candidate held a named role on. heading is the protocol number and title, organization the site, and a bullet states the role (principal investigator, sub-investigator) and what they were responsible for. Only trials the source document names.",
    shapes: { cv: { band: 3 } },
  },
  {
    key: "grants",
    title: "Grants & Funding",
    layout: "entries",
    hint: "Funded awards. heading is the award title, organization the funding body. A bullet may state role and amount when the source gives them. Never invent a grant number or a dollar figure.",
    shapes: { cv: { band: 3 } },
  },
  {
    key: "publications",
    title: "Publications",
    layout: "list",
    listStyle: "numbered",
    hint: "One citation per line, exactly as the source gives it. Never invent authors, journals, years or a citation that is not already written down.",
    shapes: {
      resume: {
        band: 4,
        hint: "One citation per line, exactly as the source gives it. Never invent authors, journals or years. On a resume include this only when the posting is research-adjacent.",
      },
      cv: { band: 4 },
    },
  },
  {
    key: "presentations",
    title: "Presentations",
    layout: "list",
    listStyle: "numbered",
    hint: "Posters and talks, one per line, with the meeting name if the source gives one.",
    shapes: { cv: { band: 4 } },
  },
  {
    key: "teaching",
    title: "Teaching",
    layout: "entries",
    hint: "Teaching and mentorship roles. heading is the teaching role, organization the institution.",
    shapes: { cv: { band: 5 } },
  },
  {
    key: "qi",
    title: "Quality Improvement",
    layout: "entries",
    hint: "Quality improvement and patient safety projects. heading is the project title, organization the institution, and bullets state the problem, the intervention and the measured result. Only measurements the source states.",
    shapes: { cv: { band: 5 } },
  },
  {
    key: "service",
    title: "Leadership & Service",
    layout: "entries",
    hint: "Committee seats, chief or chair roles, editorial and peer-review work. This is where a committee seat belongs, never in Clinical Experience.",
    shapes: { cv: { band: 5 } },
  },
  {
    key: "awards",
    title: "Honors & Awards",
    layout: "list",
    listStyle: "plain",
    hint: "One award per line, with the awarding body and year when the source gives them.",
    shapes: { resume: { band: 4 }, cv: { band: 6 } },
  },
  {
    key: "memberships",
    title: "Professional Memberships",
    layout: "list",
    listStyle: "plain",
    hint: "Professional societies, one per line, with membership years when the source gives them.",
    shapes: { cv: { band: 6 } },
  },
  {
    key: "volunteer",
    title: "Volunteer & Community",
    layout: "entries",
    hint: "Outreach, volunteering and unpaid service. heading is the role, organization the body. Never put a paid position here.",
    shapes: { resume: { band: 5 } },
  },
  {
    // Deliberately not folded into "volunteer" despite covering similar
    // ground: the two share only their layout, and merging them would rename a
    // key that saved CVs already store their content under.
    key: "community",
    title: "Community & Advocacy",
    layout: "entries",
    hint: "Outreach, advocacy and volunteer work. heading is the role, organization the body. A one-day volunteer event belongs here, never in Clinical Experience.",
    shapes: { cv: { band: 6 } },
  },
  {
    key: "languages",
    title: "Languages",
    layout: "list",
    listStyle: "plain",
    hint: "One language per line with fluency level if stated. Nothing else belongs here.",
    shapes: { resume: { band: 5 }, cv: { band: 7 } },
  },
  {
    key: "references",
    title: "References",
    layout: "list",
    listStyle: "plain",
    hint: "One referee per line: name and credentials, then role and institution, then contact details, separated by commas. Include only referees the source document actually names. Never invent a referee or a contact detail.",
    shapes: { cv: { band: 8 } },
  },
];

export const SHAPE_LABEL: Record<DocumentShape, string> = {
  resume: "Professional resume",
  cv: "Clinical / academic CV",
};

export const SHAPE_DESCRIPTION: Record<DocumentShape, string> = {
  resume: "Summary first, cut to fit a page or two. For most industry roles.",
  cv: "Education and training first, comprehensive, no page limit. For medicine, academia and research.",
};

/**
 * Every section the shape may use, in its default (band) order.
 *
 * Resolved from the catalogue on each call rather than precomputed: the lists
 * are a couple of dozen entries and this runs a handful of times per request,
 * so a cache would be more moving parts than it saves.
 */
export function specsFor(shape: DocumentShape): SectionSpec[] {
  return CATALOGUE.flatMap((def) => {
    const placement = def.shapes[shape];
    if (!placement) return [];
    return [
      {
        key: def.key,
        title: placement.title ?? def.title,
        layout: def.layout,
        core: placement.core ?? false,
        band: placement.band,
        listStyle: def.listStyle,
        hint: placement.hint ?? def.hint,
      },
    ];
  }).sort((a, b) => a.band - b.band);
}

export function specFor(shape: DocumentShape, key: string): SectionSpec | undefined {
  return specsFor(shape).find((s) => s.key === key);
}

/**
 * Puts the model's chosen sections into printable order.
 *
 * The model returns sections as an ordered array, and that order is the signal
 * for how it wants the document to read for this posting. It is honoured only
 * within a band: sorting by band first means a posting can promote research
 * above clinical trials, but can never float Education below Publications or
 * move References off the end.
 *
 * Anything whose key is not in the catalogue is dropped — that is what stops an
 * invented section reaching the page. The sort is stable, so sections in the
 * same band come out in exactly the order they arrived.
 */
export function orderSectionKeys(shape: DocumentShape, keys: string[]): string[] {
  const bandOf = new Map(specsFor(shape).map((s) => [s.key, s.band]));

  const seen = new Set<string>();
  const known = keys.filter((k) => {
    if (!bandOf.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return known
    .map((key, i) => ({ key, band: bandOf.get(key)!, i }))
    .sort((a, b) => a.band - b.band || a.i - b.i)
    .map((s) => s.key);
}

/**
 * A CV is never trimmed to a page count. Dropping a publication to save space
 * is a defect on a document whose purpose is to be complete, so the page
 * target is meaningless for that shape.
 */
export function allowsPageTarget(shape: DocumentShape): boolean {
  return shape === "resume";
}
