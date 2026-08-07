import type { LinkKind } from "./profileLinks";
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
 * `shapes`. Most sections appear in several — Experience, Education, Awards and
 * Languages appear in all six — and keeping a list per shape meant maintaining
 * those six times over. `title` and `hint` are shared defaults; a shape
 * overrides either where it genuinely differs, which is how the same key prints
 * as "Education" on a resume, "Education & Training" on a clinical CV and
 * "Training & Education" on a creative one.
 *
 * That override is doing real work, not cosmetics. `experience` is the clearest
 * case: the same key is "Experience" on a resume, "Clinical Experience" on a
 * medical CV, "Academic Appointments" on an academic one and "Work Experience"
 * on a federal resume — and each carries a different hint, because a federal
 * resume wants hours per week and a supervisor where a resume wants outcomes.
 * One key, six conventions.
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

// Resume bands:   0 opening · 1 skills · 2 practice · 3 credentials · 4 evidence · 5 tail
// CV bands:       0 opening · 1 credentials · 2 practice · 3 scholarship · 4 output ·
//                 5 contribution · 6 recognition · 7 skills · 8 references
// Academic bands: 0 opening · 1 training · 2 appointments · 3 scholarship · 4 output ·
//                 5 contribution · 6 recognition · 7 skills · 8 references
// Federal bands:  0 opening · 1 experience · 2 education · 3 skills & training ·
//                 4 recognition · 5 tail · 6 references
// Legal bands:    0 opening · 1 credentials · 2 practice · 3 evidence · 4 tail
// Creative bands: 0 opening · 1 work · 2 employment · 3 training · 4 skills ·
//                 5 recognition · 6 tail
const CATALOGUE: SectionDef[] = [
  {
    key: "summary",
    title: "Summary",
    layout: "prose",
    hint: "Two to three lines, 40 to 80 words, no first person. Its job is to be impressive and relevant enough that the reader carries on into the entries. Roughly in order: the posting's own job title where the source supports it; years of relevant experience with the domains they were spent in, never the years alone; the two or three capabilities this posting asks for most, in its vocabulary; and ONE quantified result, the strongest they have, landing by the second sentence.",
    shapes: {
      resume: { band: 0, core: true },
      federal: {
        band: 0,
        core: true,
        title: "Professional Summary",
        hint: "Four to six lines, no first person. Federal reviewers read this against the announcement's qualifications, so it is longer than a private-sector summary and uses the announcement's own vocabulary. Name years of relevant experience and the specialised experience the announcement asks for, drawing only on what the source document supports.",
      },
      legal: {
        band: 0,
        core: true,
        title: "Summary",
        hint: "Two to three lines, no first person. A lawyer's document argues through admissions, practice area and matters, all of which are printed below, so this section earns its place only by saying what those cannot: the practice the candidate is moving toward, the kind of matters they want, or the thread running through a varied record. Name practice areas and matter types. Never adjectives about advocacy.",
      },
      creative: {
        band: 0,
        core: true,
        title: "Profile",
        hint: "Two to three lines, no first person, naming discipline and the kind of work sought. The credits below carry the record, so this says what a list cannot: the work the candidate wants next, and the through-line in what they have already done.",
      },
    },
  },
  {
    key: "profile",
    title: "Professional Profile",
    layout: "prose",
    hint: "Three or four lines at most, no first person, naming subspecialty focus and the kind of practice sought. A CV argues through the sections below and runs long, so keep this tight: it exists to state in three lines the focus a reader would otherwise have to infer from thirty pages.",
    shapes: { cv: { band: 0, core: true } },
  },
  {
    key: "interests",
    title: "Research Interests",
    layout: "prose",
    hint: "Two or three lines naming the research programme: the questions, the methods, the field. No first person. Only interests the source document already evidences through published or funded work — this is a summary of a research record, not a statement of aspiration.",
    shapes: { academic: { band: 0, core: true } },
  },
  {
    key: "eligibility",
    title: "Eligibility",
    layout: "list",
    listStyle: "plain",
    hint: "The federal-specific facts a human-resources reviewer screens on, one per line: citizenship, veterans' preference and its category, security clearance and its level, current or former federal grade and series, and reinstatement eligibility. ONLY what the source document states. Never assert citizenship, a clearance, a preference or a grade that is not already written down — a false claim here is a false statement on a federal application, not an embellishment.",
    shapes: { federal: { band: 0, core: true } },
  },
  {
    key: "skills",
    title: "Skills",
    layout: "keywords",
    hint: "Keywords only, 1-4 words each, grouped under short labels. No sentences, no project names.",
    shapes: {
      resume: { band: 1, core: true },
      academic: {
        band: 7,
        title: "Technical Skills",
        hint: "Methods, instruments, languages and software, grouped under short labels. Keywords only, 1-4 words each. Omit entirely for a field where methods are not a credential.",
      },
      federal: {
        band: 3,
        core: true,
        title: "Skills & Competencies",
        hint: "Keywords only, 1-4 words each, grouped under short labels. Mirror the announcement's own terms wherever the source document supports them: federal screening is a literal keyword match against the stated qualifications, so the exact phrasing matters more here than anywhere else. Never add a skill the source does not already claim.",
      },
      legal: {
        band: 4,
        title: "Skills",
        hint: "Practice-relevant tools and methods, grouped under short labels: research platforms, e-discovery, document management, drafting systems. Keywords only. Omit soft skills entirely.",
      },
      creative: {
        band: 4,
        title: "Special Skills",
        hint: "The skills a casting or commissioning decision actually turns on, grouped under short labels: dialects and accents, instruments, dance styles, stage combat, software, certifications, driving. Keywords only, 1-4 words each. Never claim a skill the source does not state.",
      },
    },
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
      academic: {
        band: 1,
        core: true,
        title: "Education",
        hint: "Most recent first. heading is the degree, organization the institution. A doctorate may carry one bullet naming the dissertation title and the advisor, when the source gives them. Nothing else takes bullets here.",
      },
      federal: {
        band: 2,
        core: true,
        title: "Education",
        hint: "heading is the degree, organization the institution. Federal reviewers verify these, so include the completion date and the location exactly as the source gives them, and add a bullet naming semester or quarter hours only when the source states them. Never estimate credit hours.",
      },
      legal: {
        band: 1,
        core: true,
        title: "Education",
        hint: "Law school FIRST, then any other graduate degree, then undergraduate — this is the one shape where education outranks experience, because legal hiring screens on it. heading is the degree (J.D., LL.M.), organization the school. Bullets carry journal membership, moot court, class rank, honors and activities exactly as the source states them. Never invent a rank, a GPA or a latin honor.",
      },
      creative: {
        band: 3,
        core: true,
        title: "Training & Education",
        hint: "Conservatoire, studio, degree and masterclass training. heading is the programme or degree, organization the school or the teacher's studio. A masterclass entry may name the teacher in organization. Bullets are rare.",
      },
    },
  },
  {
    key: "admissions",
    title: "Bar Admissions",
    layout: "list",
    listStyle: "plain",
    hint: "One jurisdiction per line, with the year of admission when the source gives it, plus federal district and circuit courts and any pending application stated as pending. Only admissions the source document names. Never invent a jurisdiction, a year or a bar number — this is verified before an offer.",
    shapes: { legal: { band: 1, core: true } },
  },
  {
    key: "licensure",
    title: "Licensure & Certification",
    /**
     * Dated entries, not a plain list.
     *
     * As a list the model wrote the dates into the line itself, so they came
     * out as free text — "· December 2024 to Present" beside an Education block
     * printing "September 2013 – May 2019". Nothing could normalise that,
     * because by then it was prose. Structured, the renderer owns the format
     * and a board certification lines up in the same date column as the
     * training that earned it.
     */
    layout: "entries",
    hint: 'State or national licences, board certifications, life-support and chemotherapy-provider certifications. These are credentials rather than positions, so this section overrides the usual reading of the entry fields: "heading" is the credential ("General Pediatrics, Board Certified"), "organization" is the issuing body ("American Board of Pediatrics"), and startDate/endDate are the period it has been held, with endDate "Present" while it is current. Several credentials from the same issuer, with overlapping dates, are normal here — keep them as separate entries. Leave both dates empty rather than inventing them, and write no bullets.',
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
      academic: {
        band: 2,
        core: true,
        title: "Academic Appointments",
        hint: "Faculty, postdoctoral and other institutional appointments, most recent first. heading is the rank or post ('Assistant Professor', 'Postdoctoral Research Fellow'), organization the department and institution. Bullets are sparse here: on an academic CV the record is carried by the publication, grant and teaching sections below, not by achievement bullets under an appointment.",
      },
      federal: {
        band: 1,
        core: true,
        title: "Work Experience",
        hint: "Paid positions, most recent first, and far more detailed than a private-sector resume — federal reviewers rate specialised experience from this section alone, so include every relevant position and do not compress. heading is the job title, organization the employer. WHERE THE SOURCE DOCUMENT STATES THEM, the first bullet carries the federal metadata on one line: hours per week, salary or pay grade, and the supervisor's name and phone with whether they may be contacted. Where the source does not state them, omit that bullet entirely — never invent an hours figure, a salary, a grade or a supervisor. Remaining bullets describe duties and results in the announcement's vocabulary.",
      },
      legal: {
        band: 2,
        core: true,
        title: "Experience",
        hint: "Positions practising or supporting the practice of law, most recent first. heading is the title (Associate, Summer Associate, Legal Intern), organization the firm, agency or department. Bullets name practice area, matter type and the candidate's own role, and state a client or matter name only when the source already does — confidentiality means most matters are described by type, not by name.",
      },
      creative: {
        band: 2,
        title: "Professional Experience",
        hint: "Salaried or contracted positions that are jobs rather than credits: teaching artist, studio assistant, company member, technical and production staff roles. heading is the job title, organization the employer. A performance or exhibition NEVER goes here — it is a credit or an exhibition.",
      },
    },
  },
  {
    key: "credits",
    title: "Selected Credits",
    layout: "entries",
    hint: "Performance and production credits, most recent first or grouped by medium as the source presents them. heading is the role or part, organization the production and its company or venue, and a bullet may name the director or choreographer when the source gives them. Copy role and production names exactly: a credit is a verifiable fact about a production, and inflating a chorus role to a principal one is misrepresentation. Only credits the source document names.",
    shapes: { creative: { band: 1, core: true } },
  },
  {
    key: "exhibitions",
    title: "Exhibitions",
    layout: "list",
    listStyle: "plain",
    hint: "One exhibition per line, most recent first, marked solo or group as the source states: title, venue, city, year. Never reclassify a group show as a solo one and never invent a venue or a year.",
    shapes: { creative: { band: 1 } },
  },
  {
    key: "projects",
    title: "Selected Projects",
    layout: "entries",
    hint: "Named projects or products that are not a job in themselves. heading is the project name, organization the context it was built in. Use only when the posting cares about built work and the source document describes some; never restate a job here.",
    shapes: { resume: { band: 2 } },
  },
  {
    key: "clerkships",
    title: "Judicial Clerkships",
    layout: "entries",
    hint: "Clerkships only, most recent first. heading is the clerkship title, organization the judge and the court ('Hon. Jane Doe, U.S. District Court, D. Mass.'). Given their own section because legal hiring reads a clerkship as a credential rather than a job. Bullets are optional and describe chambers work in general terms.",
    shapes: { legal: { band: 2 } },
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
    shapes: {
      resume: { band: 3 },
      federal: {
        band: 3,
        hint: "One credential per line, exactly as the source names it, with the issuing body and the date when stated. Federal reviewers verify these.",
      },
    },
  },
  {
    key: "training",
    title: "Professional Training",
    layout: "list",
    listStyle: "plain",
    hint: "Courses, workshops and formal training that are not degrees, one per line, with the provider, the year and the contact hours when the source gives them. Federal resumes list these where a private-sector resume would drop them. Never invent an hours figure.",
    shapes: { federal: { band: 3 } },
  },
  {
    key: "research",
    title: "Research",
    layout: "entries",
    hint: "Research posts and named projects. heading may be the project title here; organization is the lab, department or institution. This is where a study belongs — never in Clinical Experience.",
    shapes: {
      cv: { band: 3 },
      academic: {
        band: 3,
        core: true,
        title: "Research Experience",
        hint: "Research programmes and named projects. heading is the project or programme title, organization the lab, department or institution. Bullets state the question, the method and the finding. A position held is an appointment, not a research entry — this section is for the work, not the job.",
      },
    },
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
    shapes: {
      cv: { band: 3 },
      academic: {
        band: 3,
        hint: "Funded awards, most recent first, including pending and completed where the source marks them as such. heading is the award title and number, organization the funding body. A bullet may state role, period and amount when the source gives them. On an academic CV the funding record is read as closely as the publication list, so include every award the source names. Never invent a grant number, a period or a dollar figure.",
      },
    },
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
      academic: {
        band: 4,
        core: true,
        hint: "One citation per line, exactly as the source gives it, grouped as the source groups them (peer-reviewed articles, book chapters, conference proceedings, preprints) and most recent first within each. This is the section an academic search committee reads first: include every publication the source document contains. Never invent authors, journals, years or a citation that is not already written down, and never promote a preprint or a manuscript in preparation to a published article.",
      },
      legal: {
        band: 3,
        hint: "Articles, notes and comments, one citation per line, exactly as the source gives it. A law-review note belongs here rather than under education.",
      },
      creative: {
        band: 5,
        title: "Press & Reviews",
        hint: "Reviews, features and critical writing about the candidate's work, one per line: author, publication, title and date exactly as the source gives them. Never invent a publication, a critic or a quotation.",
      },
    },
  },
  {
    key: "presentations",
    title: "Presentations",
    layout: "list",
    listStyle: "numbered",
    hint: "Posters and talks, one per line, with the meeting name if the source gives one.",
    shapes: {
      cv: { band: 4 },
      academic: {
        band: 4,
        title: "Conference Presentations",
        hint: "Invited talks, conference papers and posters, one per line, most recent first, with the meeting, the location and the year when the source gives them. Mark invited talks as invited only where the source does.",
      },
    },
  },
  {
    key: "teaching",
    title: "Teaching",
    layout: "entries",
    hint: "Teaching and mentorship roles. heading is the teaching role, organization the institution.",
    shapes: {
      cv: { band: 5 },
      academic: {
        band: 5,
        core: true,
        title: "Teaching Experience",
        hint: "Courses taught and students supervised. heading is the course title and number, or the supervision role, organization the institution. A bullet may state the level, the enrolment and whether the course was designed by the candidate, when the source says so. Teaching is a required section on an academic CV even for a research post.",
      },
    },
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
    shapes: {
      cv: { band: 5 },
      academic: {
        band: 5,
        title: "Service",
        hint: "Departmental, institutional and disciplinary service: committee seats, editorial boards, journal refereeing, conference organising and society office. heading is the role, organization the body. This is where peer review belongs, never under publications.",
      },
    },
  },
  {
    key: "awards",
    title: "Honors & Awards",
    layout: "list",
    listStyle: "plain",
    hint: "One award per line, with the awarding body and year when the source gives them.",
    shapes: {
      resume: { band: 4 },
      cv: { band: 6 },
      academic: { band: 6 },
      federal: {
        band: 4,
        hint: "One award per line, with the awarding body and year when the source gives them. Include performance awards, on-the-spot and time-off awards, and unit citations, which federal reviewers recognise and private-sector ones ignore.",
      },
      legal: { band: 3 },
      creative: {
        band: 5,
        title: "Awards & Residencies",
        hint: "Prizes, fellowships, residencies, commissions and grants, one per line, with the awarding body and year when the source gives them.",
      },
    },
  },
  {
    key: "memberships",
    title: "Professional Memberships",
    layout: "list",
    listStyle: "plain",
    hint: "Professional societies, one per line, with membership years when the source gives them.",
    shapes: { cv: { band: 6 }, academic: { band: 6 } },
  },
  {
    key: "volunteer",
    title: "Volunteer & Community",
    layout: "entries",
    hint: "Outreach, volunteering and unpaid service. heading is the role, organization the body. Never put a paid position here.",
    shapes: {
      resume: { band: 5 },
      federal: {
        band: 5,
        hint: "Outreach, volunteering and unpaid service. heading is the role, organization the body. Federal applications credit volunteer work toward qualifying experience, so include it with the same hours detail as a paid position where the source states it.",
      },
      legal: {
        band: 4,
        title: "Pro Bono & Community",
        hint: "Pro bono representation, clinic work, bar association service and community involvement. heading is the role, organization the body.",
      },
    },
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
    shapes: {
      resume: { band: 5 },
      cv: { band: 7 },
      academic: { band: 7 },
      federal: { band: 5 },
      legal: { band: 4 },
      creative: { band: 6 },
    },
  },
  {
    key: "references",
    title: "References",
    layout: "list",
    listStyle: "plain",
    hint: "One referee per line: name and credentials, then role and institution, then contact details, separated by commas. Include only referees the source document actually names. Never invent a referee or a contact detail.",
    shapes: {
      cv: { band: 8 },
      academic: { band: 8 },
      federal: { band: 6 },
    },
  },
];

/**
 * What each shape is, in one place.
 *
 * Split out of the per-shape Records this file used to carry (a label map, a
 * description map, and a page-target predicate with the answer hardcoded) once
 * there were six shapes rather than two: six attributes across six separate
 * maps is six places to forget. Everything a consumer needs to know about a
 * shape that isn't its section list is here, and TypeScript's exhaustiveness
 * check on the Record makes adding a seventh shape a compile error until every
 * field is answered.
 */
export type ShapeDef = {
  /** Full name, shown on the picker card. */
  label: string;
  /** Short name for buttons, where the full label reads as a mouthful. */
  short: string;
  /** One line on the card, saying who it is for. */
  description: string;
  /** The length line under the card's preview. */
  lengthNote: string;
  /**
   * Whether the document is trimmed to a page count.
   *
   * False means "never cut for space" — for a CV because completeness is the
   * point, for a federal resume because reviewers rate specialised experience
   * from detail a two-page limit would delete.
   */
  paged: boolean;
  /** What the document calls itself in the footer and the .docx title. */
  kind: string;
  /**
   * Whether post-nominals (MD, PhD) belong after the name in the header. True
   * for the shapes whose fields put credentials in the byline.
   */
  postNominals: boolean;
  /**
   * Which contact identifiers the profile form offers as empty slots.
   *
   * A suggestion about what is worth filling in, NOT a filter on what prints —
   * every link with a value appears on every shape. The point is to stop asking
   * a physician for a GitHub account and to give them somewhere to put an NPI,
   * not to start second-guessing what they typed. Anything not listed is still
   * reachable through the form's "add another" control.
   */
  suggestedLinks: LinkKind[];
};

export const SHAPE_DEFS: Record<DocumentShape, ShapeDef> = {
  resume: {
    label: "Professional resume",
    short: "resume",
    description: "Summary first, cut to fit a page or two. For most industry roles.",
    lengthNote: "One to two pages",
    paged: true,
    kind: "Resume",
    postNominals: false,
    suggestedLinks: ["linkedin", "github", "website"],
  },
  cv: {
    label: "Clinical / medical CV",
    short: "CV",
    description:
      "Education, training and licensure first. For medicine, dentistry and veterinary practice.",
    lengthNote: "Runs as long as it needs to",
    paged: false,
    kind: "CV",
    postNominals: true,
    suggestedLinks: ["npi", "linkedin"],
  },
  academic: {
    label: "Academic CV",
    short: "CV",
    description:
      "Publications, grants and teaching lead. For faculty, postdoctoral and research posts.",
    lengthNote: "Runs as long as it needs to",
    paged: false,
    kind: "CV",
    postNominals: true,
    suggestedLinks: ["orcid", "scholar", "website"],
  },
  federal: {
    label: "US federal resume",
    short: "federal resume",
    description:
      "Exhaustive, with eligibility and hours. For USAJOBS and other federal openings.",
    lengthNote: "Three to eight pages",
    paged: false,
    kind: "Resume",
    postNominals: false,
    suggestedLinks: ["linkedin"],
  },
  legal: {
    label: "Legal resume",
    short: "resume",
    description:
      "Education and bar admissions first, clerkships called out. For attorney roles.",
    lengthNote: "One to two pages",
    paged: true,
    kind: "Resume",
    postNominals: false,
    suggestedLinks: ["bar", "linkedin"],
  },
  creative: {
    label: "Creative / performing arts",
    short: "resume",
    description:
      "Credits and exhibitions lead, with special skills. For performers, artists and designers.",
    lengthNote: "One to two pages",
    paged: true,
    kind: "Resume",
    postNominals: false,
    suggestedLinks: ["portfolio", "reel", "imdb"],
  },
};

/**
 * Picker order: the two everyone needs first, then the specialist shapes.
 *
 * Deliberately not alphabetical. Most sessions want "resume", and a picker that
 * opens with "Academic CV" makes the common case look like the exception.
 */
export const SHAPE_ORDER: DocumentShape[] = [
  "resume",
  "cv",
  "academic",
  "federal",
  "legal",
  "creative",
];

/** Every shape key, for validating what arrives over the wire or off disk. */
export const ALL_SHAPES = SHAPE_ORDER;

export const SHAPE_LABEL: Record<DocumentShape, string> = Object.fromEntries(
  SHAPE_ORDER.map((s) => [s, SHAPE_DEFS[s].label])
) as Record<DocumentShape, string>;

export const SHAPE_DESCRIPTION: Record<DocumentShape, string> = Object.fromEntries(
  SHAPE_ORDER.map((s) => [s, SHAPE_DEFS[s].description])
) as Record<DocumentShape, string>;

/**
 * Narrows an untrusted value to a shape, defaulting to "resume".
 *
 * The default direction is the point: a resume sent to an academic post is
 * survivable, an academic CV sent to a recruiter is not. Used on the request
 * boundary of both routes and on session hydration, where a shape may have been
 * stored by an older build.
 */
export function toShape(value: unknown): DocumentShape {
  return ALL_SHAPES.includes(value as DocumentShape) ? (value as DocumentShape) : "resume";
}

/**
 * The same narrowing for a field that is legitimately null.
 *
 * "Not chosen yet" and "chosen, but this build doesn't have that shape" are
 * different states and both have to survive hydration: coercing the second to
 * "resume" would silently re-label a saved federal resume, so it goes back to
 * null and the picker asks again.
 */
export function toShapeOrNull(value: unknown): DocumentShape | null {
  return ALL_SHAPES.includes(value as DocumentShape) ? (value as DocumentShape) : null;
}

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
 * Whether this shape is trimmed to a page count.
 *
 * A CV is never trimmed: dropping a publication to save space is a defect on a
 * document whose purpose is to be complete. Neither is a federal resume, for a
 * different reason — the detail a two-page limit would cut is exactly what the
 * reviewer rates specialised experience from.
 */
export function allowsPageTarget(shape: DocumentShape): boolean {
  return SHAPE_DEFS[shape].paged;
}

/**
 * Which of two titles a merged entry prints, when one role's dates sit inside
 * another's at the same employer.
 *
 * The two cases are identical on paper and mean opposite things. On a CV the
 * inner stint is a title held *inside* a training post — Chief Fellow within a
 * three year Clinical Fellowship — and the programme is the position, so the
 * longer-running title is the right one. On a resume the same date shape is a
 * promotion, and the convention is the reverse: the title held now, over the
 * whole span. Taking the longer-running one there printed "Senior Engineer"
 * over a span that ended as Staff Engineer, erasing the one line a reader
 * scans for.
 */
export function prefersLatestTitle(shape: DocumentShape): boolean {
  return SHAPE_DEFS[shape].kind === "Resume";
}
