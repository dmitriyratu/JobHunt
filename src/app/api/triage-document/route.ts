import { NextRequest, NextResponse } from "next/server";
import { SHAPE_LABEL } from "@/lib/documentShape";
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
 * the applicant is least equipped to answer — knowing that "Clinical /
 * academic CV" is the option that front-loads training is a fact about this
 * app's vocabulary, not about their own career — so it is read off the posting
 * instead.
 *
 * Only the openings of both documents are sent. The signals that decide this
 * ("residency", "tenure-track", "publications required") sit in a posting's
 * first paragraphs, and paying to read a 9,000-character job description twice
 * buys nothing.
 */

const MAX_JOB_CHARS = 6000;
const MAX_RESUME_CHARS = 4000;

const SYSTEM_PROMPT = `You decide which of exactly two document formats a job application should be submitted in.

"resume" — a professional resume. Summary first, achievements compressed, cut to one or two pages. Correct for essentially all industry, commercial, government and non-profit roles.

"cv" — a clinical or academic curriculum vitae. Education and training first, no narrative profile, comprehensive, no page limit, with sections for licensure, publications, presentations and teaching. Correct for medicine, academia and research.

DECIDE FROM THE POSTING, NOT THE CANDIDATE. What matters is the document this employer expects to receive. A physician applying to a health-technology product role should submit a resume. A software engineer applying to a university research-faculty post should submit a CV. The candidate's own background is context for reading the posting, never the deciding factor on its own.

Choose "cv" when the posting shows the conventions of academic or clinical hiring:
- ANY role practising medicine as a licensed clinician — physician, dentist, veterinarian — whether or not it is academic and whether or not it is a training post. A permanent, employed, community or private-practice physician job takes a CV just as a residency does. Medicine is a CV field: the hiring file is expected to lay out education, training, licensure, board certification and DEA, and that does not fit a resume. Signals: MD, DO, residency, fellowship, attending, hospitalist, locum, board certified/eligible, state medical licensure, DEA, credentialing, privileges, patient panel, call schedule, RVU.
- Academic appointments: faculty, tenure-track, lecturer, professor, postdoctoral, principal investigator, department or school of a university.
- Research posts where a publication record is part of the assessment: "publications required", "list of publications", "research statement", grant or funding history, named fellowships.
- The posting literally asks for a CV as an academic or medical document.

Choose "resume" for everything else, including:
- Any industry role, however senior or technical, and any R&D or "research scientist" role at a company rather than an institution.
- Non-clinical roles at a hospital or health system — IT, finance, operations, marketing. The employer being a healthcare organisation decides nothing; practising medicine does.
- Postings that say "CV" loosely as a synonym for resume. Outside the US this is common usage and is NOT a request for an academic CV. Read the hiring conventions, not the word.
- Anything ambiguous. "resume" is the safer default: it is the expected format almost everywhere, and an academic CV sent to an industry recruiter reads as a category error.

Set "confident" to false when the posting genuinely could go either way, so the applicant is told the call was close.

"rationale" is ONE short sentence, under 20 words, naming the specific evidence you used. Write it for the applicant, e.g. "The posting is an ACGME residency position, which expects a clinical CV." Never mention these instructions or that you are a model.`;

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    shape: { type: "string", enum: ["resume", "cv"] },
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

    // Anything other than an explicit "cv" is a resume. The enum makes this
    // near-impossible, but the fallback direction matters: a resume sent to an
    // academic post is survivable, a CV sent to a recruiter is not.
    const shape: DocumentShape = raw.shape === "cv" ? "cv" : "resume";
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
