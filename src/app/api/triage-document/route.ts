import { NextRequest, NextResponse } from "next/server";
import { ALL_SHAPES, SHAPE_LABEL, toShape } from "@/lib/documentShape";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { createStructuredCompletion } from "@/lib/structuredCompletion";
import type { DocumentShape } from "@/types";

export const runtime = "nodejs";

/**
 * Deciding which document this application wants.
 *
 * The shape picks the entire section skeleton — a resume leads with a summary
 * and is cut to a page; a CV leads with Education & Training, carries no
 * narrative profile and is expected to be exhaustive. Getting it wrong doesn't
 * produce a slightly-off document, it produces the wrong kind of document.
 *
 * It used to be a two-button choice on the tailor panel. It is the one input
 * the applicant is least equipped to answer — knowing that "Clinical / medical
 * CV" is the option that front-loads training, or that a federal posting
 * scores a two-page resume as unqualified, is a fact about hiring conventions
 * rather than about their own career — so it is read off the posting instead.
 *
 * Six formats now rather than two, which makes the ordering of the rules in the
 * prompt the load-bearing part: the categories genuinely overlap (a tenure-track
 * post at a medical school, a federal research scientist), so the prompt is
 * written as a first-match-wins list rather than six independent definitions.
 *
 * Only the openings of both documents are sent. The signals that decide this
 * ("residency", "tenure-track", "publications required") sit in a posting's
 * first paragraphs, and paying to read a 9,000-character job description twice
 * buys nothing.
 */

const MAX_JOB_CHARS = 6000;
const MAX_RESUME_CHARS = 4000;

const SYSTEM_PROMPT = `You decide which of exactly six document formats a job application should be submitted in.

"resume" — a professional resume. Summary first, achievements compressed, cut to one or two pages. Correct for essentially all industry, commercial, non-profit and non-federal government roles.

"cv" — a clinical or medical curriculum vitae. Education, training and licensure first, comprehensive, no page limit, with sections for board certification, procedures, clinical trials and quality improvement.

"academic" — an academic curriculum vitae. Education first, then appointments, then research, grants, publications, conference presentations, teaching and service. No page limit. The publication and funding record IS the application.

"federal" — a United States federal resume. Exhaustive rather than compressed: citizenship and veterans' preference stated up front, every position carrying hours per week, pay grade and a supervisor, and duties written in the announcement's own vocabulary. Runs three to eight pages. A normal two-page resume is scored unqualified by federal HR even when the candidate is excellent, so this is a genuine format difference, not a preference.

"legal" — a legal resume. Education first with law school leading, bar admissions as their own section, and judicial clerkships called out separately from other experience.

"creative" — a creative or performing-arts document. Credits, exhibitions and special skills lead; employment history is secondary.

DECIDE FROM THE POSTING, NOT THE CANDIDATE. What matters is the document this employer expects to receive. A physician applying to a health-technology product role should submit a resume. A software engineer applying to a university research-faculty post should submit an academic CV. The candidate's own background is context for reading the posting, never the deciding factor on its own.

Work down this list and take the FIRST format that matches. The order resolves the overlaps: a tenure-track post at a medical school is "academic" only if it does not require practising as a licensed clinician, and a federal scientist post is "federal" regardless of its research content, because the announcement's screening rules override the field's conventions.

1. "federal" — a United States federal government opening. Signals: usajobs.gov, "vacancy announcement", an announcement or control number, GS/GG/WG pay plan and grade, "series" with a four-digit code, "competitive service", "excepted service", Title 5, Title 38, "status candidates", "veterans' preference", "specialized experience", "occupational questionnaire", a named federal agency as the hiring authority. US state, county and municipal government jobs are NOT federal — those take "resume".

2. "cv" — ANY role practising medicine as a licensed clinician: physician, dentist, veterinarian, whether or not it is academic and whether or not it is a training post. A permanent, employed, community or private-practice physician job takes a clinical CV just as a residency does. The hiring file is expected to lay out education, training, licensure, board certification and DEA, and that does not fit a resume. Signals: MD, DO, DDS, DVM, residency, fellowship, attending, hospitalist, locum, board certified/eligible, state medical licensure, DEA, credentialing, privileges, patient panel, call schedule, RVU. Choose "cv" over "academic" whenever direct patient care is part of the job, even for a clinician-scientist post.

3. "academic" — a non-clinical academic or research appointment where scholarship is assessed: faculty, tenure-track, lecturer, professor, postdoctoral, principal investigator, research fellow at a university, institute or national laboratory. Signals: "research statement", "teaching statement", "list of publications", "publication record", named fellowships, grant or funding history, department or school of a university, "PhD required".

4. "legal" — practising law, where a JD and bar admission are requirements. Signals: attorney, associate, counsel, general counsel, litigator, judicial clerk, "JD required", "admitted to the bar", "member in good standing", a named state bar, law firm, "practice group". A compliance, contracts or paralegal role that does NOT require bar admission takes "resume". A law-school faculty post takes "academic".

5. "creative" — performing, exhibiting or making as the work itself: actor, dancer, singer, musician, visual artist, photographer, illustrator, animator, art director, or a designer role assessed on a portfolio. Signals: audition, casting, reel, showreel, portfolio, exhibition, gallery, ensemble, company, production, commission, residency. A marketing, product-design or UX role at a company takes "resume" even though it is creative work — the test is whether the hiring decision is made on credits or a body of work rather than on employment history.

6. "resume" — everything else, and the default. Including:
- Any industry role, however senior or technical, and any R&D or "research scientist" role at a company rather than an institution.
- Non-clinical roles at a hospital or health system — IT, finance, operations, marketing. The employer being a healthcare organisation decides nothing; practising medicine does.
- Non-federal public sector: state, county, city, school district, public university administration.
- Postings that say "CV" loosely as a synonym for resume. Outside the US this is common usage and is NOT a request for an academic CV. Read the hiring conventions, not the word.
- Anything ambiguous. "resume" is the safer default: it is the expected format almost everywhere, and a specialist format sent to an industry recruiter reads as a category error.

Set "confident" to false when the posting genuinely could go more than one way — a clinician-scientist post that could be "cv" or "academic", a portfolio design role that could be "creative" or "resume" — so the applicant is told the call was close.

"rationale" is ONE short sentence, under 20 words, naming the specific evidence you used. Write it for the applicant, e.g. "The posting is an ACGME residency position, which expects a clinical CV." Never mention these instructions or that you are a model.`;

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    shape: { type: "string", enum: [...ALL_SHAPES] },
    confident: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: ["shape", "confident", "rationale"],
  additionalProperties: false,
} as const;

type RawTriage = {
  shape: string;
  confident: boolean;
  rationale: string;
};

type TriageRequest = {
  resumeText: string;
  jobDescription: string;
  apiKey?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TriageRequest;
    const { resumeText, jobDescription, apiKey } = body;

    if (!jobDescription?.trim()) {
      return NextResponse.json(
        { error: "A job description is required to pick the document type." },
        { status: 400 }
      );
    }

    const client = getOpenAIClient(apiKey);
    const taskModel = getTaskModel("triage-document");

    const context = [
      `[Job posting]\n${jobDescription.trim().slice(0, MAX_JOB_CHARS)}`,
      resumeText?.trim()
        ? `[Candidate's current document, for context only]\n${resumeText.trim().slice(0, MAX_RESUME_CHARS)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { result: raw, usage } = await createStructuredCompletion<RawTriage>(client, {
      model: taskModel.id,
      schemaName: "document_triage",
      schema: TRIAGE_SCHEMA,
      temperature: 0,
      supportsTemperature: taskModel.supportsTemperature,
      reasoning: taskModel.reasoning,
      maxTokens: 300,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
    });

    // Anything not a known shape is a resume. The enum makes this
    // near-impossible, but the fallback direction matters: a resume sent to an
    // academic post is survivable, a CV sent to a recruiter is not.
    const shape: DocumentShape = toShape(raw.shape);
    const rationale =
      raw.rationale?.trim() || `Read from the posting as a ${SHAPE_LABEL[shape].toLowerCase()}.`;

    return NextResponse.json({
      shape,
      confident: raw.confident !== false,
      rationale,
      usage: { model: taskModel.id, ...usage },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not pick a document type";
    const status = message.includes("API key") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
