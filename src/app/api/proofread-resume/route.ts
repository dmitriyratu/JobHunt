import { NextRequest, NextResponse } from "next/server";
import { verifyVariants } from "@/lib/consistency";
import { getTaskModel } from "@/lib/models";
import { getOpenAIClient } from "@/lib/openai";
import { verifySuggestions } from "@/lib/proofread";
import { createStructuredCompletion, type UsageStats } from "@/lib/structuredCompletion";

export const runtime = "nodejs";

const SCHEMA = {
  type: "object",
  properties: {
    typos: {
      type: "array",
      description: "Only definite misspellings. An empty list is the normal answer.",
      items: {
        type: "object",
        properties: {
          wrong: {
            type: "string",
            description: "The misspelled word, exactly as the document spells it. One word.",
          },
          right: { type: "string", description: "The correct spelling. One word." },
          note: { type: "string", description: "A few words on what the word should be." },
        },
        required: ["wrong", "right", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["typos"],
  additionalProperties: false,
} as const;

const PROMPT = `You are proofreading the text of a resume or CV that a candidate is about to send to employers. Report misspelled words. Nothing else.

THE DOCUMENT IS FULL OF WORDS THAT LOOK WRONG AND ARE NOT. It is mostly proper nouns and technical vocabulary: hospitals, universities, laboratories, journals, drugs, procedures, honours in Latin, place names in other languages, and abbreviations a general dictionary has never seen. Haematologica, allogeneic, cyclophosphamide, GVHD, Magna Cum Laude, NewYork-Presbyterian and Universidad Iberoamericana are all correct. So is almost everything that resembles them.

REPORT ONLY:
- A word misspelled in a way a person would recognise instantly as a mistake once it is pointed out: a transposition ("Pediatirc"), a doubled or dropped letter ("recieved", "occurence", "comitted"), a wrong vowel.
- A proper noun misspelled against its own well-known form, where you are certain of the correct one.

NEVER REPORT:
- A word you merely do not recognise. Unfamiliar is not misspelled.
- British and American spellings. "Haematology" and "organised" are correct.
- Abbreviations, acronyms, initialisms, degree letters, or anything in capitals.
- Names of people. You cannot know how someone spells their own name.
- Anything inside an email address, a URL, a handle, a username, a file name or an identifier. "alfauht1@mskcc.org" is not misspelled, whatever it looks like — it is an address, and changing it is worse than any typo.
- Capitalisation, punctuation, spacing, grammar, tense, or word choice. A word that is spelled correctly and used oddly is not a typo.
- Singular against plural. "Education on vaccinations" is not a misspelling of "vaccination". Which one belongs in a sentence is the candidate's decision and you were not asked about it.
- One real word offered in place of another real word. "Served as medical translator" is not a misspelling of "translation". If the word you would report is itself correctly spelled English, it is not a typo, whatever you think of it in the sentence.
- A better word. You are not editing. "Used" is not a misspelling of "utilised", and offering that back is the worst thing you can do here.
- Two words run together or one word split in two by the text extraction. Those are extraction artefacts, not the candidate's spelling.

Give "wrong" exactly as it appears in the document, as a single word with no surrounding punctuation, so it can be found by search. Give "right" as a single word. Anything else is discarded.

When you are not certain, say nothing about it. The candidate reads this list and decides; a list of things that turn out to be fine is a list they will close, and the real typo goes out with the resume.`;

const VARIANTS_SCHEMA = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      description:
        "One group per thing the document names inconsistently. Empty is the normal answer.",
      items: {
        type: "object",
        properties: {
          variants: {
            type: "array",
            items: { type: "string" },
            description:
              "Each spelling exactly as it appears in the document, copied character for character.",
          },
          preferred: {
            type: "string",
            description: "Which of the variants to standardise on. Must be one of them.",
          },
          note: { type: "string", description: "A few words on what it is." },
        },
        required: ["variants", "preferred", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
} as const;

const VARIANTS_PROMPT = `You are reading a resume or CV for one specific defect: something the document names in more than one way.

An employer, hospital, university, programme, laboratory or credential should be written the same way everywhere it appears. When it is not, a reader notices, and what they notice is carelessness on a page whose whole job is to look careful. Neither spelling has to be wrong for this to be worth fixing.

WHAT COUNTS:
- The same institution written two ways: "NewYork-Presbyterian Hospital / Weill Cornell Medical Center" in one section and "NewYork-Presbyterian – Weill Cornell Medical Center" in another. Same hospital, two forms, one document.
- The same programme, department or laboratory named differently in two places.
- The same credential or degree written out in one place and abbreviated in another, where the document is otherwise consistent.

WHAT DOES NOT COUNT — do not report these:
- Two genuinely different organisations that share a word. "Weill Cornell Medicine" is the medical school and "Weill Cornell Medical Center" is the hospital. They are not variants of each other.
- A parent organisation and one of its parts.
- A name given in full once and by its own established abbreviation later, where the document introduced the abbreviation: "Universidad Iberoamericana (UNIBE)" then "UNIBE" is correct practice, not an inconsistency.
- Anything that appears only once. A single spelling cannot be inconsistent with itself.
- Sentences, bullet text, job descriptions. Only names.

Copy every variant EXACTLY as the document writes it, including its punctuation and spacing, so it can be found by search. A variant you paraphrase or tidy is discarded.

For "preferred", pick the form most likely to be the institution's own — its official style, or failing that the one the document uses most. It MUST be one of the variants you listed; you are choosing between the candidate's spellings, not writing a better one.

HOW TO READ THE DOCUMENT. Do not scan it for something that looks wrong; nothing here looks wrong on its own, which is why this is missed. Instead, list every organisation the document names. Then take each one in turn and find every place it appears, and compare those places to each other character by character. A difference in a joiner, a dropped word, a hyphen against a slash — that is the finding. Only after you have done that for every name should you decide the document is consistent.

If every name really is written the same way everywhere, return an empty list.`;

/** Both calls are the same step to the user, so they are billed as one entry. */
function usage(...calls: UsageStats[]): UsageStats {
  return calls.reduce(
    (total, call) => ({
      promptTokens: total.promptTokens + call.promptTokens,
      completionTokens: total.completionTokens + call.completionTokens,
      totalTokens: total.totalTokens + call.totalTokens,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const { text, apiKey } = (await request.json()) as { text?: string; apiKey?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "No text to proofread." }, { status: 400 });
    }

    const client = getOpenAIClient(apiKey);
    const model = getTaskModel("proofread-resume");

    // Two questions, two calls, concurrently. One prompt asked to do both jobs
    // does neither well — "which word is misspelled" wants a reader working a
    // token at a time, and "what is named twice" wants one holding the whole
    // document in view — and the upload is waiting on the slower of them either
    // way, so splitting costs nothing but tokens.
    const [typos, variants] = await Promise.all([
      createStructuredCompletion<{ typos: { wrong: string; right: string; note: string }[] }>(
        client,
        {
          model: model.id,
          schemaName: "resume_typos",
          schema: SCHEMA,
          temperature: 0,
          supportsTemperature: model.supportsTemperature,
          reasoning: model.reasoning,
          maxTokens: 1200,
          messages: [
            { role: "system", content: PROMPT },
            { role: "user", content: text },
          ],
        }
      ),
      createStructuredCompletion<{
        groups: { variants: string[]; preferred: string; note: string }[];
      }>(client, {
        model: model.id,
        schemaName: "resume_name_variants",
        schema: VARIANTS_SCHEMA,
        temperature: 0,
        supportsTemperature: model.supportsTemperature,
        reasoning: model.reasoning,
        maxTokens: 1200,
        messages: [
          { role: "system", content: VARIANTS_PROMPT },
          { role: "user", content: text },
        ],
      }),
    ]);

    return NextResponse.json({
      // Measured before they are offered: one token, present in the document,
      // within two edits of what it replaces. See proofread.ts — the model is
      // free to return a rewrite and this is what stops one being shown.
      suggestions: verifySuggestions(typos.result.typos, text),
      // Same discipline: every variant found verbatim, the group plausibly one
      // name, and the form to standardise on one the candidate already wrote.
      nameVariants: verifyVariants(variants.result.groups, text),
      usage: { model: model.id, ...usage(typos.usage, variants.usage) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to proofread";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
