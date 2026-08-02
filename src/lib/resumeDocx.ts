import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { SHAPE_DEFS, specFor } from "./documentShape";
import { linkDisplay, printableLinks } from "./profileLinks";
import {
  formatSkillGroups,
  sectionByKey,
  sectionHasContent,
  visibleBullets,
} from "./tailoredResume";
import type { SectionSpec } from "./documentShape";
import type { ResumeProfile } from "./settings";
import type { ResumeEntry, ResumeSection, TailoredResume } from "@/types";

/**
 * The fixed template. Content varies per application; this file never does —
 * which is the whole point of having the model return structured data instead
 * of a document.
 *
 * The section list isn't here either: @/lib/documentShape owns which sections
 * exist, what they are titled and what order they come in, and this file only
 * knows how to set the four layouts a section can ask for. Every heading below
 * is printed from `spec.title`, never from the model, so no amount of creative
 * output can retitle a section or invent one.
 *
 * Built for ATS parsers first and human eyes second. Every choice below that
 * looks plain is deliberate: no tables, no text boxes, no columns, no headers
 * or footers, no images. Applicant tracking systems read the document XML in
 * order, and any of those constructs either scrambles the reading order or is
 * skipped outright. Dates and skill labels are aligned with tab stops rather
 * than a two-column table for exactly this reason.
 *
 * A CV runs to as many pages as it needs, so nothing here may assume one page:
 * the only vertical controls used are `keepNext` and `keepLines`, which say
 * what must not be split, rather than where a break should fall.
 */

const FONT = "Calibri";

// docx measures in half-points for fonts and twentieths of a point (twips)
// elsewhere. 1 inch = 1440 twips.
//
// The size must be set explicitly: the docx package defaults to A4, which is
// 334 twips narrower than Letter. That silently pushed the right-aligned date
// tab stop past the right margin, because CONTENT_WIDTH is derived from the
// width declared here rather than from whatever the file actually used.
const PAGE_WIDTH_TWIPS = 12240; // US Letter, 8.5in
const PAGE_HEIGHT_TWIPS = 15840; // US Letter, 11in
const MARGIN_X = 936; // 0.65in — a touch wider than tall, which reads calmer
const MARGIN_Y = 792; // 0.55in
const CONTENT_WIDTH = PAGE_WIDTH_TWIPS - MARGIN_X * 2;

/** Where a skill group's items start, leaving room for the longest label. */
const SKILL_LABEL_TAB = 2050; // ~1.42in

/**
 * Longest label the tab column can hold, in characters.
 *
 * A tab stop is not a table cell: a label wider than the stop pushes its items
 * to the *next* default stop, so one long label ("Leadership & Service") makes
 * that row alone break ranks while the others stay aligned. Rather than let
 * the layout depend on the model's word choice, an over-long label anywhere
 * drops every group to the inline arrangement — uniform, if less pretty.
 */
const SKILL_LABEL_MAX = 20;

// Bullets: shallow indent with a proper hanging edge. The docx default of
// 720/360 pushes text a half inch in, which on a one-page resume is a column
// of wasted margin down the whole page.
const BULLET_INDENT = { left: 260, hanging: 200 };

/**
 * The type scale, in half-points. Five sizes and no more — a document this
 * short earns its hierarchy from weight, colour and space, and every extra
 * size is one more thing for the eye to sort out.
 *
 *   20pt   name          the only display size
 *   11pt   lead          headline, and every entry heading
 *   10.5pt body          prose, bullets, list items, skills
 *   10pt   section       set in caps, so it reads larger than it measures
 *   9.5pt  meta          dates, organisations, locations, contact line
 */
const SIZE_NAME = 40;
const SIZE_LEAD = 22;
const SIZE_BODY = 21;
const SIZE_SECTION = 20;
const SIZE_META = 19;

/**
 * Letterspacing, in twips.
 *
 * Caps need opening up — roughly a tenth of their size — or they set as a
 * solid block. Display type wants the opposite: at 20pt the default fit is
 * already loose, and a hair of negative tracking is what stops a name from
 * looking like it was typed rather than set.
 */
const TRACK_CAPS = 20; // 1pt at 10pt caps
const TRACK_NAME = -4; // -0.2pt at 20pt

/**
 * The vertical rhythm. One scale, every value a multiple of UNIT, so gaps in
 * the finished document are always in simple ratio to one another instead of
 * being nudged per section until each looks right on its own.
 */
const UNIT = 20; // 1pt
const SPACE_HAIR = UNIT * 2; // 40  — inside one block, e.g. name to headline
const SPACE_LINE = UNIT * 3; // 60  — between siblings: bullets, skills, items
const SPACE_ENTRY = UNIT * 9; // 180 — before an entry heading
const SPACE_SECTION = UNIT * 15; // 300 — before a section heading
const SPACE_SECTION_FIRST = UNIT * 10; // 200 — the first, under the header rule
const SPACE_HEADING_AFTER = UNIT * 5; // 100

/** 1.1x. Calibri's own leading is tight for a full measure of text. */
const LINE_BODY = 264;

const COLOR_TEXT = "1A1A1A";
const COLOR_MUTED = "5C5C5C";
const COLOR_ACCENT = "1F4E79"; // Deep navy: prints legibly in greyscale too.
const COLOR_HAIRLINE = "C9CDD2";

/** The one separator in the document, so every list of small parts matches. */
const DOT = "  ·  ";

function run(
  text: string,
  opts: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
    spacing?: number;
    caps?: boolean;
  } = {}
) {
  return new TextRun({
    text,
    font: FONT,
    size: opts.size ?? SIZE_BODY,
    color: opts.color ?? COLOR_TEXT,
    bold: opts.bold,
    italics: opts.italics,
    characterSpacing: opts.spacing,
    allCaps: opts.caps,
  });
}

function joinNonEmpty(parts: string[], separator: string): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(separator);
}

/**
 * Section headings carry `keepNext` so a heading can never be the last line on
 * a page with its content orphaned onto the next one — which on a CV, where
 * breaks are unavoidable rather than exceptional, is the difference between a
 * document that reads as typeset and one that reads as spilled.
 *
 * The first heading sits closer to the header than the rest sit to each other:
 * the rule under the contact line has already done the separating, and the
 * full gap on top of it opens a hole at the very top of the page.
 */
function sectionHeading(title: string, first: boolean): Paragraph {
  return new Paragraph({
    // A real heading level, not just bold text — this is what lets an ATS and
    // a screen reader see the document's structure.
    heading: HeadingLevel.HEADING_2,
    spacing: {
      before: first ? SPACE_SECTION_FIRST : SPACE_SECTION,
      after: SPACE_HEADING_AFTER,
    },
    keepNext: true,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_HAIRLINE, space: 3 },
    },
    children: [
      run(title, {
        bold: true,
        size: SIZE_SECTION,
        color: COLOR_ACCENT,
        spacing: TRACK_CAPS,
        caps: true,
      }),
    ],
  });
}

// --- Layouts ----------------------------------------------------------------

/** `prose` — a single paragraph of running text. */
function proseLayout(section: ResumeSection): Paragraph[] {
  const text = section.prose?.value.trim() ?? "";
  if (!text) return [];
  return [new Paragraph({ spacing: { after: SPACE_LINE }, children: [run(text)] })];
}

/** `keywords` — labelled groups in a tab-aligned label column. */
function keywordsLayout(section: ResumeSection): Paragraph[] {
  const groups = (section.keywords?.value ?? []).filter((g) => g.items.length > 0);
  if (!groups.length) return [];

  const columnar = groups.every(
    (g) => g.label.trim().length > 0 && g.label.trim().length <= SKILL_LABEL_MAX
  );

  return groups.map((group) => {
    const label = group.label.trim();
    const items = group.items.join(", ");

    if (columnar) {
      return new Paragraph({
        spacing: { after: SPACE_LINE },
        // Hanging indent equal to the stop, so wrapped items line up under
        // the first item rather than back under the label.
        tabStops: [{ type: TabStopType.LEFT, position: SKILL_LABEL_TAB }],
        indent: { left: SKILL_LABEL_TAB, hanging: SKILL_LABEL_TAB },
        keepLines: true,
        children: [
          run(label, { bold: true, size: SIZE_META, color: COLOR_ACCENT }),
          run("\t"),
          run(items),
        ],
      });
    }

    return new Paragraph({
      spacing: { after: SPACE_LINE },
      indent: { left: 200, hanging: 200 },
      keepLines: true,
      children: label
        ? [run(`${label}:  `, { bold: true, color: COLOR_ACCENT }), run(items)]
        : [run(items)],
    });
  });
}

/**
 * `entries` — a dated thing and what was done there.
 *
 * Three levels in a fixed order, so a reader scanning the left edge always
 * meets them in the same sequence: heading (bold, one step up), organisation
 * and place (small, receding), then the bullets at body size.
 */
function entryParagraphs(entry: ResumeEntry): Paragraph[] {
  const out: Paragraph[] = [];

  // A heading is what the entry is; if the model left it empty, the
  // organisation is the next most identifying thing and gets promoted rather
  // than leaving a bold blank line above it.
  const heading = entry.heading.trim() || entry.organization.trim();
  const organization = entry.heading.trim() ? entry.organization.trim() : "";
  const location = entry.location.trim();
  const dates = joinNonEmpty([entry.startDate, entry.endDate], " – ");

  const metaRuns: TextRun[] = [];
  if (organization) metaRuns.push(run(organization, { size: SIZE_META }));
  if (location) {
    if (metaRuns.length) metaRuns.push(run(DOT, { size: SIZE_META, color: COLOR_MUTED }));
    metaRuns.push(run(location, { size: SIZE_META, color: COLOR_MUTED }));
  }

  if (heading || dates) {
    // Dates ride on the HEADING line, not the organisation line.
    //
    // A right tab stop silently degrades to the next default stop when the
    // text before it runs past the stop's position, and "Memorial Sloan
    // Kettering Cancer Center · New York, NY" does exactly that. Headings are
    // short, so pairing them with the dates is the arrangement that survives a
    // long employer or institution name.
    //
    // This paragraph must also stay un-indented: the preview corrects
    // docx-preview's tab placement by reading a paragraph's indent, and treats
    // an un-indented tab as the right-margin one (see ResumeDocxPreview).
    out.push(
      new Paragraph({
        spacing: { before: SPACE_ENTRY, after: metaRuns.length ? 0 : SPACE_LINE },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
        children: [
          run(heading, { bold: true, size: SIZE_LEAD }),
          ...(dates ? [run("\t"), run(dates, { size: SIZE_META, color: COLOR_MUTED })] : []),
        ],
      })
    );
  }

  if (metaRuns.length) {
    out.push(
      new Paragraph({
        spacing: { before: SPACE_HAIR, after: SPACE_LINE },
        // Keeps heading, organisation and the first bullet together as one
        // block, which is the unit a break should never fall inside.
        keepNext: true,
        children: metaRuns,
      })
    );
  }

  for (const bullet of visibleBullets(entry.bullets)) {
    const text = bullet.value.trim();
    if (!text) continue;
    out.push(
      new Paragraph({
        bullet: { level: 0 },
        indent: BULLET_INDENT,
        spacing: { after: SPACE_LINE },
        // A bullet that splits across a page break is hard to read; short
        // enough here that keeping each one whole costs nothing.
        keepLines: true,
        children: [run(text)],
      })
    );
  }

  return out;
}

function entriesLayout(section: ResumeSection): Paragraph[] {
  // Entries with no surviving bullets still render. An old job compressed to
  // its title, employer and dates is a legitimate way to spend two lines;
  // dropping it outright would put an unexplained gap in the history.
  return (section.entries ?? []).flatMap(entryParagraphs);
}

/** `list` — one item per line: a certification, a citation, an award. */
function listLayout(section: ResumeSection): Paragraph[] {
  return (section.items ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .map(
      (item) =>
        new Paragraph({
          bullet: { level: 0 },
          indent: BULLET_INDENT,
          spacing: { after: SPACE_LINE },
          // Publications and citations wrap; the hanging indent above puts the
          // continuation under the text rather than under the bullet.
          keepLines: true,
          children: [run(item)],
        })
    );
}

function sectionBody(spec: SectionSpec, section: ResumeSection): Paragraph[] {
  switch (spec.layout) {
    case "prose":
      return proseLayout(section);
    case "keywords":
      return keywordsLayout(section);
    case "entries":
      // See the matching fallback in resumeLatex: a document generated while
      // this section was still a `list` holds its lines in `items`, and would
      // otherwise render as nothing and be dropped.
      return !section.entries?.length && section.items?.some((i) => i.trim())
        ? listLayout(section)
        : entriesLayout(section);
    case "list":
      return listLayout(section);
    default:
      return [];
  }
}

// --- Header -----------------------------------------------------------------

/**
 * Credentials the name should carry, if that is what the headline holds.
 *
 * A CV has no headline slot — the convention is "Jane Okafor, MD, MPH", with
 * the degrees set on the name itself. So a headline that is nothing but
 * post-nominals is folded into the name rather than printed underneath it as
 * a stray line, while "Interventional Cardiologist" is left where it is.
 * Deliberately narrow: two to six letters, at least two of them capitals,
 * optional full stops, no spaces — which admits MD, PhD, Ph.D., FACC, RN and
 * rejects anything that reads as a job title.
 */
function postNominals(headline: string): string {
  const tokens = headline.split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length || tokens.length > 4) return "";

  const credential = (token: string): boolean => {
    if (!/^[A-Za-z.]+$/.test(token)) return false;
    const letters = token.replace(/[^A-Za-z]/g, "");
    const capitals = letters.replace(/[^A-Z]/g, "");
    return letters.length >= 2 && letters.length <= 6 && capitals.length >= 2;
  };

  return tokens.every(credential) ? tokens.join(", ") : "";
}

function contactLine(profile: ResumeProfile): string {
  // Plain text throughout, links included: the .docx path prints the display
  // form rather than a hyperlink field, which is what survives being pasted into
  // an applicant tracking system.
  return joinNonEmpty(
    [
      profile.location,
      profile.email,
      profile.phone,
      ...printableLinks(profile.links).map(linkDisplay),
    ],
    DOT
  );
}

function headerParagraphs(resume: TailoredResume, profile: ResumeProfile): Paragraph[] {
  const out: Paragraph[] = [];

  // Falls back to the current job title so this is right without anyone having
  // to fill it in — see ResumeProfile.headline. Read from the experience
  // section by key: on a CV the first entries section is education, and a
  // degree is not a headline.
  const headline =
    profile.headline.trim() ||
    sectionByKey(resume, "experience")?.entries?.[0]?.heading.trim() ||
    "";

  const suffix = SHAPE_DEFS[resume.shape].postNominals ? postNominals(headline) : "";

  out.push(
    new Paragraph({
      spacing: { after: SPACE_HAIR },
      keepNext: true,
      children: [
        run(profile.fullName.trim() || "Your Name", {
          bold: true,
          size: SIZE_NAME,
          color: COLOR_ACCENT,
          spacing: TRACK_NAME,
        }),
        // Lighter than the name, same size and colour: read as part of it,
        // subordinate to it.
        ...(suffix
          ? [run(`, ${suffix}`, { size: SIZE_NAME, color: COLOR_ACCENT, spacing: TRACK_NAME })]
          : []),
      ],
    })
  );

  if (headline && !suffix) {
    out.push(
      new Paragraph({
        spacing: { after: SPACE_LINE },
        keepNext: true,
        children: [run(headline, { size: SIZE_LEAD, color: COLOR_MUTED })],
      })
    );
  }

  const contact = contactLine(profile);
  if (contact) {
    out.push(
      new Paragraph({
        spacing: { after: 0 },
        keepNext: true,
        // The rule belongs to the header block rather than the first section,
        // so the two never drift apart. It sits closer to the header above it
        // than to the heading below, which is what makes it read as the
        // header's own edge rather than a divider between two equals.
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_ACCENT, space: 6 },
        },
        children: [run(contact, { size: SIZE_META, color: COLOR_MUTED })],
      })
    );
  }

  return out;
}

// --- Document ---------------------------------------------------------------

/** First thing worth saying about the document, for the file's metadata. */
function documentSummary(resume: TailoredResume): string {
  for (const section of resume.sections) {
    const prose = section.prose?.value.trim() ?? "";
    if (prose) return prose;

    const keywords = section.keywords?.value ?? [];
    if (keywords.length) return formatSkillGroups(keywords);

    const entry = section.entries?.[0];
    if (entry) return joinNonEmpty([entry.heading, entry.organization], ", ");

    const item = section.items?.find((i) => i.trim());
    if (item) return item.trim();
  }
  return "";
}

export function buildResumeDocument(
  resume: TailoredResume,
  profile: ResumeProfile
): Document {
  const children: Paragraph[] = [...headerParagraphs(resume, profile)];

  // resume.sections is the running order chosen for this posting, already
  // constrained to the catalogue's bands; a section the model returned that
  // isn't in the catalogue was dropped before it got here. Iterating it keeps
  // the .docx and the .tex telling the same story in the same order.
  let first = true;
  for (const section of resume.sections) {
    const spec = specFor(resume.shape, section.key);
    // An empty heading is worse than a missing section, whether or not the
    // spec calls the section core.
    if (!spec || !sectionHasContent(section)) continue;

    const body = sectionBody(spec, section);
    if (!body.length) continue;

    children.push(sectionHeading(spec.title, first), ...body);
    first = false;
  }

  const name = profile.fullName.trim();
  // The .docx metadata title spells it out where the LaTeX footer abbreviates.
  const kind = SHAPE_DEFS[resume.shape].kind === "CV" ? "Curriculum Vitae" : "Resume";

  return new Document({
    creator: name || "JobHunt",
    title: `${name || kind} — ${kind}`,
    description: documentSummary(resume).slice(0, 250),
    styles: {
      default: {
        document: {
          // `kern` turns on Word's pair kerning at and above 8pt. Free, and
          // the only thing here the reader would notice by its absence.
          run: { font: FONT, size: SIZE_BODY, color: COLOR_TEXT, kern: 16 },
          paragraph: { spacing: { line: LINE_BODY } },
        },
        heading2: {
          run: { font: FONT, size: SIZE_SECTION, bold: true, color: COLOR_ACCENT },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: { top: MARGIN_Y, right: MARGIN_X, bottom: MARGIN_Y, left: MARGIN_X },
          },
        },
        children,
      },
    ],
  });
}

export function buildResumeBlob(
  resume: TailoredResume,
  profile: ResumeProfile
): Promise<Blob> {
  return Packer.toBlob(buildResumeDocument(resume, profile));
}
