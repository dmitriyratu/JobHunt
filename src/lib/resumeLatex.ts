import { SHAPE_DEFS, specFor } from "./documentShape";
import { linkDisplay, linkHref, printableLinks } from "./profileLinks";
import { dateOrder, sectionHasContent, visibleBullets } from "./tailoredResume";
import type { SectionSpec } from "./documentShape";
import type { ResumeProfile } from "./settings";
import type {
  DocumentShape,
  ResumeEntry,
  ResumeSection,
  ResumeTexProposal,
  TailoredResume,
} from "@/types";

/**
 * The fixed LaTeX template, and the renderer that fills it.
 *
 * This is the .docx template's counterpart and follows the same rule: the
 * section list, their titles and their order come from @/lib/documentShape, and
 * the model only ever supplies the words inside them. Nothing here is
 * model-authored, so no amount of creative output can retitle a section.
 *
 * Unlike the .docx path, what this produces is handed to the user to edit. It
 * is therefore written to be read: plain macros with obvious names, one section
 * per block, and comments explaining the parts that are load-bearing rather
 * than decorative.
 *
 * TYPESET WITH XeTeX (Tectonic). Every choice in the preamble below was
 * verified by compiling and then extracting the text back out with three
 * independent parsers (pypdf, pdf-parse, pdf.js), because a resume that looks
 * right and parses wrong is worse than one that looks plain. Five of those
 * choices are counterintuitive and must not be "cleaned up":
 *
 *   1. Ragged right, not justification. XeTeX writes inter-word spaces as kern
 *      offsets in the PDF's TJ arrays rather than space glyphs. Justification
 *      shrinks those kerns, and once they fall under an extractor's threshold
 *      every word on the line is concatenated — "Backendengineerwitheightyears".
 *      Ragged right keeps spaces at their natural width, above the threshold.
 *
 *   2. Hyphenation off, with infinite ragged stretch to pay for it. A word
 *      broken across a line comes back out of an extractor still broken:
 *      "hema-tology", "lym-phoma" — precisely the terms a recruiter searches
 *      for. Forbidding hyphenation alone pushes long words past the margin, so
 *      \RaggedRightRightskip is given infinite stretch and TeX ends the line
 *      early instead. Measured: 10 split words before, 0 after, 0 overfull.
 *
 *   3. Dates in a left-hand column, not flush right. The rule this replaced —
 *      "never \hfill a date" — was right about the failure and wrong about the
 *      cause: what tears dates into a loose column at the end of the document
 *      is the right-alignment jump, not the column. A left date box emitted
 *      before its heading extracts adjacent to it, confirmed on all three
 *      parsers. Do not "restore" flush-right dates.
 *
 *   4. \strut first in every minipage, and \textcolor rather than \color. A
 *      minipage[t] is a \vtop, whose height is that of the first box on its
 *      list; a bare \color emits a whatsit, not a box, so the height collapses
 *      to zero and the whole column silently drops by one line relative to its
 *      neighbour. It reads as a spacing bug and is not one.
 *
 *   5. The heading font is Fira Sans specifically, not "a sans". Which sans is
 *      loaded decides whether the name extracts as "Anna Smith-Jones" or as
 *      "AnnaSmith‐Jones", and the failures are per-font and silent. The long
 *      note above the \usepackage line has the measurements and the three fonts
 *      that passed.
 *
 * None of this is visible in a PDF viewer. All of it decides whether an ATS
 * reads "Senior Engineer, Shopify, Mar 2021 - Present" or a pile of loose dates.
 */

// --- Escaping ---------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "%": "\\%",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

/**
 * Text from the uploaded document, safe to drop into the body.
 *
 * One pass over the string rather than a chain of replaces: chaining would
 * re-escape the backslashes the earlier replacements introduced, turning "&"
 * into "\textbackslash{}&".
 */
export function escapeLatex(input: string): string {
  return input.replace(/[\\{}$&%#_~^]/g, (c) => ESCAPES[c]);
}

/**
 * A URL for \href's first argument, where the escaping rules differ: hyperref
 * reads it mostly verbatim, but % starts a comment and # is a parameter token
 * even there.
 */
function escapeUrl(url: string): string {
  return url.replace(/([%#\\])/g, "\\$1");
}

function httpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function link(url: string, display: string): string {
  return `\\href{${escapeUrl(url)}}{${escapeLatex(display)}}`;
}

// --- Preamble ---------------------------------------------------------------

/**
 * The document's measurements, which are the only thing that differs between a
 * resume and a CV. A resume is fighting for a page and gets tighter setting; a
 * CV is read across several pages and gets the extra leading back.
 *
 * `datecol` is sized so that the common case — "July 2024 - June 2027" set at
 * 9pt — fits on one line. It used to be narrow enough that nearly every range
 * wrapped, which left the left-hand column looking like a stack of fragments
 * rather than a column of dates.
 *
 * The common case is not the widest case, and on the two long shapes it is
 * worth paying for the difference. `entryDates` wraps gracefully by design, but
 * a column where one range in ten breaks reads as a defect rather than as a
 * grid: on a real clinical CV "September 2013 - May 2019" was the only wrapped
 * date on two pages, and it was the first thing the eye landed on. September is
 * the widest month name, so 1.52in is what makes every Month-Year pair short of
 * a September/September range set on one line. It costs 0.1in of measure, which
 * at these margins is about one character per line of body text.
 */
const METRICS: Record<DocumentShape, {
  size: string;
  margin: string;
  datecol: string;
  /** Name size in the header, in points. A CV is a longer read; its name is no bigger. */
  name: string;
}> = {
  resume: { size: "10pt", margin: "0.65in", datecol: "1.32in", name: "22" },
  cv: { size: "10.5pt", margin: "0.72in", datecol: "1.52in", name: "22" },
  // Set like the clinical CV: both are long reads where the page count is not
  // being fought for, and a document someone reads for ten minutes wants the
  // half-point and the wider margin.
  academic: { size: "10.5pt", margin: "0.72in", datecol: "1.52in", name: "22" },
  // The widest date column of the six. A federal entry's left column carries a
  // date range where the others carry a year, and federal reviewers read these
  // on paper, so the margin is the most generous here.
  federal: { size: "10.5pt", margin: "0.75in", datecol: "1.5in", name: "22" },
  // Conservative by convention: legal hiring reads an unusual-looking document
  // as a flag, so this is the resume metrics with a little more air.
  legal: { size: "10pt", margin: "0.7in", datecol: "1.32in", name: "22" },
  // A credit's left column carries a year and its right a production name and a
  // company, so the date column is slightly wider than the resume's.
  creative: { size: "10pt", margin: "0.7in", datecol: "1.38in", name: "22" },
};

/**
 * Everything above \begin{document}.
 *
 * Read the four numbered notes at the top of this file before changing any of
 * it. `\cvname` is defined empty here and overwritten by the renderer, so the
 * running footer can carry the candidate's name without the preamble needing to
 * know it.
 *
 * TYPOGRAPHY, IN ONE PARAGRAPH
 * Two families, used for two jobs. Charter sets everything that is read as
 * prose — bullets, summaries, citations — because a print serif with this
 * x-height stays legible at 10pt in a dense block. Source Sans sets everything
 * that is *looked up* rather than read: the name, the section headings, the
 * dates, the footer. That split is what carries the hierarchy, which is why the
 * headings can stay small: a sans heading at 10.5pt separates from Charter body
 * text more clearly than a serif heading at 13pt ever did, and it costs a
 * third of the vertical space. Colour does the rest, in four steps and no more
 * — navy for structure, ink for what the candidate said, slate for the
 * organisation lines beneath it, muted for dates and metadata.
 */
function preambleFor(shape: DocumentShape): string {
  const m = METRICS[shape];
  return String.raw`% article only accepts 10/11/12pt and silently discards anything else, so the
% real size is set by the fontsize package.
\documentclass[10pt,letterpaper]{article}
\usepackage[fontsize=${m.size}]{fontsize}
\usepackage[margin=${m.margin},top=0.58in,bottom=0.68in]{geometry}

% Charter for prose, Fira Sans for headings and metadata. Both are chosen as
% packages rather than by system font name so the document compiles identically
% on any machine, with no font files to ship. Swap {newtxtext} for Times,
% {lmodern} for the LaTeX default; nothing else here depends on the choice.
%
% FiraSans is loaded WITHOUT its sfdefault option, which does not mean what it
% sounds like: it makes Fira the default family for the whole document, body
% text included, and the resume silently comes out entirely sans. Plain, the
% package sets \sfdefault and nothing else, so the two families coexist and
% \sffamily is what selects between them.
%
% FIRA SANS IS NOT INTERCHANGEABLE WITH ANY OTHER SANS HERE, and the reason is
% extraction, not taste. Two independent ways for a sans to fail were measured
% across five sizes and three parsers (pdf-parse, pdf.js, pypdf):
%
%   Lost spaces. Under XeTeX the gap between two words is a kern offset rather
%   than a space glyph (note 1 above), and whether a parser reads it as a space
%   depends on the font's metrics. Source Sans Pro loses them in pdf-parse and
%   Computer Modern Sans — what \sffamily silently falls back to if this line is
%   deleted rather than replaced — loses them everywhere. A name set in either
%   extracts as "DmitriyRatushny".
%
%   Rewritten characters. Lato's ToUnicode map sends the hyphen to U+2010
%   instead of U+002D, so every hyphenated surname, phone number and profile URL
%   comes out with a character no ATS will match. Carlito is worse: its digits
%   extract as Latin Extended-B letters, and a phone number becomes "(ŹŴź)".
%
% Fira Sans, Roboto and Biolinum each scored 5/5 on every parser with no
% substituted characters. Those three are the safe swaps. If you change this
% line, re-run npm run check:templates before believing the result.
\usepackage[T1]{fontenc}
\usepackage{iftex}
\ifPDFTeX\usepackage[utf8]{inputenc}\fi
\usepackage{XCharter}
\usepackage[scaled=0.96]{FiraSans}

\usepackage{microtype}
\usepackage{etoolbox}
\usepackage{xcolor}
% ragged2e loads before titlesec on purpose: titlesec resets the paragraph
% shape, so a \RaggedRight established afterwards is silently undone by the
% first \section.
\usepackage[document]{ragged2e}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{needspace}
\usepackage{fancyhdr}

% Colours are defined above hyperref because hyperref's urlcolor is resolved at
% load time: a colour defined after it is not yet a name it knows.
\definecolor{navy}{HTML}{183A5A}
\definecolor{ink}{HTML}{20262D}
\definecolor{slate}{HTML}{44505E}
\definecolor{muted}{HTML}{5F6973}
\definecolor{rulegray}{HTML}{AEB8C2}
\AtBeginDocument{\color{ink}}

% Links are navy rather than hidden. A printed resume loses nothing — navy at
% this weight reads as emphasis, not as a link — and a screen-read one gains a
% visible affordance on the two things a recruiter actually clicks.
\usepackage[colorlinks=true,urlcolor=navy,linkcolor=navy,citecolor=navy]{hyperref}

% Overwritten by the renderer. Drives the running footer.
\newcommand{\cvname}{}

% Widen \datecol if your dates run long ("Expected June 2027"); the content
% column and every indented list follow it automatically.
\newlength{\datecol}   \setlength{\datecol}{${m.datecol}}
\newlength{\gutter}    \setlength{\gutter}{0.16in}
\newlength{\contentindent}
\setlength{\contentindent}{\dimexpr\datecol+\gutter\relax}
\newlength{\entrygap}  \setlength{\entrygap}{5pt}

\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\raggedbottom
\widowpenalty=10000
\clubpenalty=10000

% See note 2 at the top of this file before touching these three lines.
\hyphenpenalty=10000
\exhyphenpenalty=10000
\setlength{\RaggedRightRightskip}{0pt plus 1fil}

% Bullets sit under an entry, so they indent to the content column and line up
% with the heading above them. Numbered lists do not: a citation list has no
% date column to sit beside, and indenting it would leave the gutter empty for
% the length of the section.
%
% The marker stays a real \textbullet rather than becoming a rule or a dingbat:
% it is the one list marker every PDF extractor recognises and strips cleanly.
% Small and navy is as far as it is worth restyling — at body size in ink it was
% as loud as the sentence beside it.
\setlist[itemize,1]{
  label=\textcolor{navy!65}{\small\textbullet},
  labelindent=\contentindent, labelsep=0.5em, leftmargin=*,
  itemsep=2pt, topsep=3.5pt, parsep=0pt, partopsep=0pt
}
\setlist[enumerate,1]{
  font=\color{muted}, labelindent=0pt, labelsep=0.5em, leftmargin=*, align=left,
  itemsep=3.5pt, topsep=3.5pt, parsep=0pt, partopsep=0pt
}
\newenvironment{bullets}{\begin{itemize}}{\end{itemize}\vspace{\entrygap}}
% Bullets in an undated section have no content column to line up with, so they
% take a small indent of their own instead. At labelindent=0 they sat flush with
% the heading above them and read as its siblings rather than as its detail.
\newenvironment{flatbullets}{\begin{itemize}[labelindent=1em]}{\end{itemize}\vspace{\entrygap}}
\newenvironment{numlist}{\begin{enumerate}}{\end{enumerate}\vspace{2pt}}

% Section headings: uppercase sans, small, navy, over a rule tinted from the
% same navy so the two read as one object.
%
% This used to be \large bold in the body serif, which is the obvious way to
% make a heading and the reason it had to be so big: set in the same family as
% the text beneath it, size and weight were the only signals available. Changing
% family and case does the separating instead, so the heading can drop to 9.8pt
% and hand the height back to the page — the redesign spends more space between
% sections than the old one did and still comes out at the same page count.
%
% \MakeUppercase is titlesec's before-code, which is passed the title. The
% catalogue's titles stay mixed-case everywhere else; only the printed heading
% is uppercased, and check-templates therefore matches headings case-insensitively.
\titleformat{\section}
  {\sffamily\bfseries\fontsize{9.8}{12}\selectfont\color{navy}}
  {}{0pt}{\MakeUppercase}
  [\vspace{2.2pt}{\color{navy!35}\titlerule[0.9pt]}]
\titlespacing*{\section}{0pt}{12pt}{5.5pt}

% Keep a heading from being stranded near the foot of a page.
%
% Two hazards, both of which cost real pages when they were got wrong.
%
% First, \needspace has to run in vertical mode BEFORE the heading. Inside
% \titleformat's format argument -- the obvious place, and where it usually gets
% written -- it runs while the heading is being boxed and reserves far more than
% asked. Hence the wrapper.
%
% Second, it is all-or-nothing: if the space is not there it discards the rest
% of the page. This number is therefore as small as it can usefully be. At 3
% baselines a real three-page CV wasted 175pt across its full pages and ran to a
% third page holding four lines; at 2 it lost 68pt, and with the tightened
% section spacing above it came out at two pages and 14pt. 0 measured no better
% than 2, so 2 keeps the orphan protection for nothing. If you ever see a page
% end early for no visible reason, this is the first thing to lower --
% \@afterheading already keeps a heading attached to the line after it, so even
% 0 will not strand one completely.
\let\cvorigsection\section
\renewcommand{\section}{\needspace{2\baselineskip}\cvorigsection}

% A real space glyph, emitted as a character node so TeX cannot discard it the
% way it discards a trailing space.
%
% It closes every left-hand column in this file, and it is not decoration. The
% two columns are two separately positioned runs in the PDF, and an extractor
% has to decide whether the jump between them means a space. pdf.js decides yes;
% pdf-parse decides no, and concatenates: "2015 - 2019Doctor of Medicine",
% "IndependentBone marrow aspiration". Widening the gutter does not help — the
% gutter is already 0.16in and it still glued. Putting an actual space in the
% stream takes the decision away from the extractor.
\newcommand{\colgap}{\char"20 }

% The three text styles the body grid is built from.
%
% \datestyle is sans, small and muted because a date is looked up, not read;
% it used to be bold at body size, which made the left column shout as loudly
% as the job title beside it. The \strut in each minipage below is emitted
% BEFORE the size change on purpose, so the date's first baseline is the body
% baseline and the two columns line up.
\newcommand{\datestyle}[1]{{\sffamily\fontsize{9}{12}\selectfont\textcolor{muted}{#1}}}
\newcommand{\orgstyle}[1]{{\itshape\textcolor{slate}{#1}}}
\newcommand{\labelstyle}[1]{{\sffamily\bfseries\fontsize{9.5}{12}\selectfont\textcolor{slate}{#1}}}

% \entry{dates}{heading}{organisation}{note} -- the workhorse. Any argument may
% be empty and its line disappears without leaving a gap. Two side-by-side boxes
% rather than a table: an entry then stays whole across a page break.
%
% \newline, not \\, between the stacked lines: \\ scans ahead for an optional
% [length], so a note that legitimately begins with a bracket gets eaten as a
% dimension and the document dies with "Missing number, treated as zero".
%
% \strut first, and \textcolor rather than \color -- see note 4 at the top of
% this file. This is load-bearing, not style.
\newcommand{\entry}[4]{%
  \noindent
  \begin{minipage}[t]{\datecol}%
    \raggedright\strut\datestyle{#1}\colgap%
  \end{minipage}%
  \hspace{\gutter}%
  \begin{minipage}[t]{\dimexpr\textwidth-\contentindent\relax}%
    \RaggedRight\strut\textbf{#2}%
    \ifblank{#3}{}{\newline\orgstyle{#3}}%
    \ifblank{#4}{}{\newline#4}%
  \end{minipage}%
  \par\vspace{\entrygap}%
}

% \labeled{Label}{Text} -- label/value rows on the same grid, for skill groups
% and anything else that reads as a table without being one.
\newcommand{\labeled}[2]{%
  \noindent
  \begin{minipage}[t]{\datecol}%
    \raggedright\strut\labelstyle{#1}\colgap%
  \end{minipage}%
  \hspace{\gutter}%
  \begin{minipage}[t]{\dimexpr\textwidth-\contentindent\relax}%
    \RaggedRight\strut#2%
  \end{minipage}%
  \par\vspace{3.5pt}%
}

% \entryflat{heading}{organisation}{note} -- \entry for a section where nothing
% is dated, so there is no column to sit beside and the block starts at the
% margin using the full measure.
\newcommand{\entryflat}[3]{%
  \noindent
  \begin{minipage}[t]{\textwidth}%
    \RaggedRight\strut\textbf{#1}%
    \ifblank{#2}{}{\newline\orgstyle{#2}}%
    \ifblank{#3}{}{\newline#3}%
  \end{minipage}%
  \par\vspace{\entrygap}%
}

% The header's three lines and the separator between contact details. Defined
% here rather than inlined by the renderer so the whole type scale is in one
% place: name, tagline and contact row are the only sizes in the document that
% are not the body size or one of the three styles above.
\newcommand{\namestyle}{\sffamily\bfseries\fontsize{${m.name}}{${m.name}}\selectfont\color{navy}}
\newcommand{\headlinestyle}{\normalfont\fontsize{11.5}{14}\selectfont\color{slate}}
\newcommand{\contactstyle}{\sffamily\fontsize{9}{12}\selectfont\color{muted}}
% \colgap on either side of the bullet, for the same reason it closes every
% date column: \hspace is glue and an interword space is a kern, and whether
% either survives extraction depends on how the neighbouring glyphs kern. With
% \hspace the row came back as "New York, NY• dmitriy.ratu@gmail.com"; with a
% plain interword space it still lost the gap after "NY" and after the phone
% number, because Y and 3 both kern tight against a space. \colgap is a space
% character, and there is nothing left for a parser to judge.
\newcommand{\dotsep}{\colgap\textcolor{rulegray}{\textbullet}\colgap}

% One unnumbered line at the margin: licences, awards, memberships, referees.
% These have no date column either, so they use the full measure rather than
% leaving \contentindent of gutter blank down the whole section.
\newcommand{\plainitem}[1]{%
  \noindent
  \begin{minipage}[t]{\textwidth}%
    \RaggedRight\strut#1%
  \end{minipage}%
  \par\vspace{2.5pt}%
}

% The roles collapsed to fit, as one run of text at the foot of their section.
%
% Deliberately NOT \plainitem, which is what this used at first. A minipage is
% an unbreakable box: correct for a licence or an award, which is one line and
% must not be split, and wrong for a paragraph naming six jobs. TeX could not
% break it across the page boundary, so it moved the whole box to page two and
% took Certifications, Awards and Languages with it — a half empty page one, and
% a length check that reported two pages for a document with two bullets on it.
% A plain paragraph breaks where it needs to.
\newcommand{\earlierline}[1]{%
  \noindent{\RaggedRight\color{slate}#1\par}%
  \vspace{2.5pt}%
}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\fancyfoot[C]{\sffamily\fontsize{8.5}{10}\selectfont\color{muted}%
  \cvname\enspace\textbullet\enspace Page \thepage}
`;
}

// --- Section rendering ------------------------------------------------------

const SEP = " · ";

/** Escaped, with every internal space made unbreakable. */
function unbreakable(text: string): string {
  return escapeLatex(text.trim()).replace(/\s+/g, "~");
}

/**
 * The dates for an entry's left-hand column, ALREADY ESCAPED — do not escape
 * the result again.
 *
 * The column is narrower than a full "July 2021 - June 2024", so the question
 * is not whether a range wraps but where. Left to itself TeX breaks at any
 * space and splits a single date down the middle:
 *
 *     July 2021 - June
 *     2024
 *
 * So each date's own spaces become ties, and the dash is tied to the date
 * before it. That leaves exactly one legal breakpoint, the space in front of
 * the second date, and the range wraps the way a person would write it:
 *
 *     July 2021 -
 *     June 2024
 */
function entryDates(entry: ResumeEntry): string {
  const start = entry.startDate.trim();
  const end = entry.endDate.trim();
  // A single-day event arrives with the same value in both fields, and printing
  // "July 2022 - July 2022" reads as a mistake rather than as a range.
  if (start && end && start !== end) return `${unbreakable(start)}~-- ${unbreakable(end)}`;
  return unbreakable(start || end);
}

/**
 * The organisation line. Dates are deliberately NOT joined in here any more:
 * they have their own column, and repeating them would print them twice.
 *
 * Location is dropped when it repeats the organisation. Volunteer and outreach
 * entries routinely arrive with both fields set to the same place — a one-day
 * health fair has no employer distinct from the city it happened in — and the
 * result printed as "Detroit, MI · Detroit, MI".
 */
/**
 * Escaped, with only the final space tied.
 *
 * A whole-string `unbreakable` is wrong for these — "Immune Discovery and
 * Modeling Service — Boelens Laboratory" has to be allowed to wrap somewhere.
 * What must not happen is the tail landing alone on the next line, which is how
 * "New York, NY" came out as "New York," and then a line holding "NY". Binding
 * the last space costs one legal breakpoint and fixes exactly that.
 */
function bindTail(text: string): string {
  return escapeLatex(text.trim()).replace(/\s+(\S+)$/, "~$1");
}

function entryOrg(organization: string, location: string): string {
  const org = organization.trim();
  const loc = location.trim();
  return (
    [org, loc === org ? "" : loc]
      .filter(Boolean)
      .map(bindTail)
      // SEP with its leading space tied: the bullet stays with the text before
      // it, so a wrap can never open a line with a stranded separator.
      .join("~· ")
  );
}

/**
 * The two lines an entry leads with, with the organisation promoted when there
 * is no heading to put above it.
 *
 * An entry can legitimately reach here with an empty heading: the tailoring
 * route demotes a heading that arrived as a sentence rather than a title (see
 * `consolidateEntries`), which leaves the organisation as the most identifying
 * thing the entry still has. Printing the empty heading anyway puts a bold
 * blank line above the organisation and an entry that looks like a rendering
 * fault.
 *
 * This mirrors `entryParagraphs` in the .docx renderer, which has always done
 * it. The two paths disagreeing is how a document ends up looking different
 * depending on which button produced it.
 */
function entryLead(entry: ResumeEntry): { heading: string; org: string } {
  const heading = entry.heading.trim();
  return {
    heading: escapeLatex(heading || entry.organization.trim()),
    org: entryOrg(heading ? entry.organization : "", entry.location),
  };
}

/**
 * Entries for one section.
 *
 * A section in which nothing is dated — research projects and named
 * initiatives often aren't — is set flush to the margin instead. Reserving the
 * date column for a section that will never fill it leaves an inch and a third
 * of empty gutter running down the whole block, which reads as a rendering
 * fault rather than as a grid. The decision is per section, not per entry, so
 * one undated item among dated ones still lines up with its neighbours.
 */
function renderEntries(entries: ResumeEntry[]): string {
  const dated = entries.some((e) => entryDates(e) !== "");
  const macro = dated ? "entry" : "entryflat";
  const list = dated ? "bullets" : "flatbullets";

  return entries
    .map((entry) => {
      const { heading, org } = entryLead(entry);
      const head = dated
        ? `\\entry{${entryDates(entry)}}{${heading}}{${org}}{}`
        : `\\${macro}{${heading}}{${org}}{}`;
      const lines = [head];
      const bullets = visibleBullets(entry.bullets);
      if (bullets.length) {
        lines.push(`\\begin{${list}}`);
        for (const b of bullets) lines.push(`  \\item ${escapeLatex(b.value)}`);
        lines.push(`\\end{${list}}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function renderSectionBody(spec: SectionSpec, section: ResumeSection): string {
  if (spec.layout === "prose") {
    return escapeLatex(section.prose?.value.trim() ?? "");
  }

  if (spec.layout === "keywords") {
    return (section.keywords?.value ?? [])
      .filter((g) => g.items.length > 0)
      .map((g) => {
        const items = escapeLatex(g.items.join(SEP));
        const label = g.label.trim();
        // No label still gets the grid, so an unlabelled group lines up with
        // the labelled ones above it rather than starting at the margin.
        return `\\labeled{${label ? escapeLatex(label) : ""}}{${items}}`;
      })
      .join("\n");
  }

  if (spec.layout === "list") {
    const items = (section.items ?? []).filter((i) => i.trim());
    if (!items.length) return "";
    // Citations get numbered because they get cited and counted; licences,
    // awards and memberships read as a plain column.
    if (spec.listStyle === "numbered") {
      return [
        "\\begin{numlist}",
        ...items.map((i) => `  \\item ${escapeLatex(i)}`),
        "\\end{numlist}",
      ].join("\n");
    }
    return items.map((i) => `\\plainitem{${escapeLatex(i)}}`).join("\n");
  }

  /*
   * Entries, with one concession to documents generated before a section
   * became a dated layout.
   *
   * Licensure used to be a `list` and stored its lines in `items`. Rendering an
   * empty `entries` array would return "", and the caller drops a section whose
   * body is empty — so an already-generated CV would quietly lose the whole
   * block on the next compile. Falling back prints what that document actually
   * holds; regenerating is what upgrades it to the date column.
   */
  const entries = section.entries ?? [];
  const legacyItems = (section.items ?? []).filter((i) => i.trim());
  if (!entries.length && legacyItems.length) {
    return legacyItems.map((i) => `\\plainitem{${escapeLatex(i)}}`).join("\n");
  }

  return renderEntries(entries);
}

// --- Header -----------------------------------------------------------------

/**
 * Name, then headline, then one row of contact details, over a navy rule.
 *
 * This used to be two minipages — name on the left, contact stacked and
 * right-aligned on the right — and it is a single left-aligned block now for
 * two reasons. Visually, a right-aligned stack of two or three items has no
 * edge to hang from and reads as stranded rather than balanced; almost nobody
 * fills in enough contact fields to make that column look deliberate. And an
 * extractor sees the contact row as one run of text on one line instead of a
 * separate column it has to guess the reading order of, which is the same
 * argument that put the dates in a left-hand column rather than flush right.
 *
 * Plain \raggedright rather than ragged2e's: these are short, deliberately
 * broken lines, and ragged2e's finite stretch reports every one of them as
 * underfull.
 */
function renderHeader(profile: ResumeProfile, resume: TailoredResume): string {
  // Falls back to the most recent entry's title, which is right often enough
  // that nobody has to fill the headline in. The first entry that HAS a title,
  // not simply the first entry: one whose heading was demoted for being a
  // sentence has nothing to lend the header, and taking its empty string would
  // drop the headline line from a document that had a title to show.
  const fallbackHeadline =
    resume.sections
      .flatMap((s) => s.entries ?? [])
      .find((e) => e.heading.trim())?.heading ?? "";
  const headline = profile.headline.trim() || fallbackHeadline.trim();

  // Location leads the row: it is the one contact detail that is read rather
  // than clicked, and it answers the first question a posting asks.
  const contact: string[] = [];
  if (profile.location.trim()) contact.push(escapeLatex(profile.location.trim()));
  if (profile.email.trim()) {
    contact.push(link(`mailto:${profile.email.trim()}`, profile.email.trim()));
  }
  if (profile.phone.trim()) contact.push(escapeLatex(profile.phone.trim()));
  // Everything filled in, in catalogue order. An identifier with no destination
  // — an NPI, a bar number — has no href and is set as plain text rather than
  // being given an invented URL to point at.
  for (const item of printableLinks(profile.links)) {
    const shown = linkDisplay(item);
    if (!shown) continue;
    const href = linkHref(item);
    contact.push(href ? link(httpUrl(href), shown) : escapeLatex(shown));
  }

  // Each line carries the gap that follows it. The name is set solid, so it
  // needs the larger one to clear its own descenders.
  const lines: [text: string, gapAfter: string][] = [
    [`{\\namestyle ${escapeLatex(profile.fullName.trim() || "Your Name")}}`, "5pt"],
  ];
  if (headline) lines.push([`{\\headlinestyle ${escapeLatex(headline)}}`, "3pt"]);
  if (contact.length) lines.push([`{\\contactstyle ${contact.join("\\dotsep ")}}`, ""]);

  return [
    "\\noindent",
    "\\begin{minipage}{\\textwidth}",
    "  \\raggedright",
    lines
      .map(([text, gap], i) => `  ${text}${i < lines.length - 1 ? `\\\\[${gap}]` : ""}`)
      .join("\n"),
    "\\end{minipage}",
    "",
    "\\vspace{7pt}",
    // A full-strength navy rule, where the section rules are a 25% tint of it.
    // That difference is the whole reason the header reads as a header.
    "{\\color{navy}\\rule{\\textwidth}{1.1pt}}",
    "\\vspace{-2pt}",
  ].join("\n");
}

// --- Document ---------------------------------------------------------------

/**
 * The tailored resume as an editable LaTeX document.
 *
 * Called once, when the structured draft is generated. After that the .tex is
 * the working copy and this is not consulted again — regenerating is what
 * rebuilds it, and that discards hand edits by design.
 */
export function renderResumeLatex(
  resume: TailoredResume,
  profile: ResumeProfile
): string {
  const blocks: string[] = [];

  // resume.sections is the running order chosen for this posting, already
  // constrained to the catalogue's bands. Iterating it — rather than the
  // catalogue — is what lets the order vary per application.
  for (const section of resume.sections) {
    const spec = specFor(resume.shape, section.key);
    if (!spec || !sectionHasContent(section)) continue;
    const body = renderSectionBody(spec, section).trim();
    if (!body) continue;
    // Escaped even though the title is a trusted constant, never model-authored:
    // trusted is not the same as LaTeX-safe. Several catalogue titles contain an
    // ampersand ("Education & Training"), which is an alignment tab in TeX and
    // fails the whole document with "Misplaced alignment tab character &".
    blocks.push(`\\section{${escapeLatex(spec.title)}}\n${body}`);

    // Roles the page-fitting pass cut whole, printed as one line at the foot of
    // the section they came from. A 2012 job with nothing left to say for this
    // posting still belongs on a resume as history; what it does not deserve is
    // a dated block and three bullets.
    const collapsed = (resume.collapsed ?? []).filter((c) => c.sectionKey === section.key);
    if (collapsed.length) {
      const earlier = [...collapsed]
        // Newest first, matching every other dated block on the page. They
        // arrive in the order the fitter cut them, which is by relevance.
        .sort(
          (a, b) =>
            (dateOrder(b.endDate) ?? dateOrder(b.startDate) ?? -Infinity) -
            (dateOrder(a.endDate) ?? dateOrder(a.startDate) ?? -Infinity)
        )
        .map((c) => {
          // Same rule as entryDates: a single year in both fields is one year,
          // not a range from itself to itself.
          const start = c.startDate.trim();
          const end = c.endDate.trim();
          // And the same dash. This printed an ASCII hyphen while every dated
          // block above it printed an en dash, so a resume that had collapsed a
          // role carried two range styles. Assembled after escaping, because
          // `--` is TeX's en dash and the escaper would otherwise neutralise it.
          const when =
            start && end && start !== end
              ? `${escapeLatex(start)}~-- ${escapeLatex(end)}`
              : escapeLatex(start || end);
          // And the same rule as entryOrg: an organisation that repeats the
          // heading prints once.
          const org = c.organization.trim();
          const who = [c.heading.trim(), org === c.heading.trim() ? "" : org]
            .filter(Boolean)
            .map(escapeLatex)
            .join(", ");
          return `${who}${when ? ` (${when})` : ""}`;
        })
        .join("; ");
      // Double backslashes: in a template literal `\e` collapses to `e` and
      // `\t` becomes a tab, so the single-escaped version emitted
      // "earlierline{" as literal text with a tab where \textit should be —
      // and printed the macro name on the finished resume.
      blocks.push(`\\earlierline{\\textit{Earlier:} ${earlier}}`);
    }
  }

  const target = resume.pageTarget
    ? `% Target length: ${resume.pageTarget} page${resume.pageTarget === 1 ? "" : "s"}.\n`
    : "";

  const name = escapeLatex(profile.fullName.trim() || "Your Name");
  const kind = SHAPE_DEFS[resume.shape].kind;

  return [
    "% Tailored resume — generated, then yours to edit.",
    "% Edits here are live: the preview recompiles as you type.",
    "% Regenerating rebuilds this file from scratch and discards manual changes.",
    target + preambleFor(resume.shape),
    `\\renewcommand{\\cvname}{${name}}`,
    // Set here rather than in the preamble because the preamble does not know
    // the name. It is what a recruiter's PDF viewer puts in its title bar, and
    // what several applicant systems read in preference to the filename.
    `\\hypersetup{pdftitle={${name} — ${kind}},pdfauthor={${name}}}`,
    "",
    "\\begin{document}",
    "",
    renderHeader(profile, resume),
    "",
    blocks.join("\n\n"),
    "",
    "\\end{document}",
    "",
  ].join("\n");
}

// --- Editing window ---------------------------------------------------------

export type TexSplit = {
  /** Preamble and header. Real LaTeX, but nothing anyone rewrites a resume by. */
  head: string;
  /** The sections — what the document actually says. */
  body: string;
  /** \end{document} and anything after it. */
  tail: string;
  /** Lines in head + tail, for telling the user what is folded away. */
  hiddenLines: number;
  /**
   * Lines the head consumes, so a line number in the whole document can be
   * turned into one in the window: bodyLine = fullLine - headLines. SyncTeX
   * counts against the file the engine compiled, which is always the whole one.
   */
  headLines: number;
};

const DOC_BEGIN = "\\begin{document}";
const DOC_END = "\\end{document}";
const SECTION = "\\section{";

/**
 * Splits the source into the part worth editing and the part that is scaffolding.
 *
 * Roughly two thirds of a generated document is preamble — package loads,
 * lengths, colours, macro definitions — and the dozen lines after
 * \begin{document} are the header's nested minipages. Measured on a real
 * two-page CV: 186 of 285 lines before \begin{document}, none of which anyone
 * edits to change what their resume says. Opening the editor on that means
 * scrolling past all of it to reach the first \section.
 *
 * The cut is made at the first \section rather than at \begin{document},
 * because the header block between them is layout too. Everything is preserved
 * verbatim on both sides and reassembled on every keystroke, so this is a
 * viewing window, not a transformation: the stored document is always whole,
 * which is what the compiler and the chat patcher both read.
 *
 * Falls back to progressively larger windows when the markers are missing —
 * a hand-edited file that has lost its \begin{document} still opens, in full,
 * rather than opening blank.
 */
export function splitDocument(tex: string): TexSplit {
  const endAt = tex.lastIndexOf(DOC_END);
  if (endAt === -1) return { head: "", body: tex, tail: "", hiddenLines: 0, headLines: 0 };

  let startAt = tex.indexOf(SECTION);
  if (startAt === -1 || startAt > endAt) {
    const begin = tex.indexOf(DOC_BEGIN);
    startAt = begin === -1 ? 0 : begin + DOC_BEGIN.length;
  }

  const head = tex.slice(0, startAt);
  const tail = tex.slice(endAt);
  return {
    head,
    body: tex.slice(startAt, endAt),
    tail,
    headLines: head.split("\n").length - 1,
    // -2 because the split points are mid-line: the line the body starts on and
    // the line it ends on are shown, not hidden.
    hiddenLines: Math.max(0, head.split("\n").length + tail.split("\n").length - 2),
  };
}

// --- Chat patches -----------------------------------------------------------

/**
 * Applies an accepted chat proposal to the source.
 *
 * Returns null when `find` no longer appears — the route guaranteed it matched
 * once when the proposal was made, but the user may have edited that passage
 * in the meantime. Silently doing nothing would report success and leave the
 * document unchanged, so the caller is made to handle it.
 */
export function applyTexProposal(
  tex: string,
  proposal: ResumeTexProposal
): string | null {
  const at = tex.indexOf(proposal.find);
  if (at === -1) return null;
  return tex.slice(0, at) + proposal.replace + tex.slice(at + proposal.find.length);
}
