import type { AssertedFact } from "@/types";

/**
 * Facts the candidate stated that their uploaded document doesn't contain, and
 * the one place they are folded back into it.
 *
 * The whole feature is this file plus one line at each call site. Everything
 * downstream — the match analysis, the tailoring, the grounding check, the
 * skill pruner, the letter — reads the candidate's document as a single string,
 * so appending to that string is the entire integration. Nothing needed a new
 * concept of "a fact"; they only needed more document.
 *
 * See AssertedFact in @/types for why this exists at all.
 */

/**
 * The heading the supplement is filed under.
 *
 * Shouted and short on purpose: `logicalLines` treats an all-caps line of 40
 * characters or less as a section heading, which makes it stand alone rather
 * than being absorbed into the first fact below it. So the supplement reads to
 * the model exactly like any other section of the resume — SKILLS, EXPERIENCE,
 * this — which is what it is.
 *
 * It also means the model can see these are the candidate's own statements
 * rather than lines lifted from their document, without any of the prompts
 * having to be told about the feature.
 */
export const SUPPLEMENT_HEADING = "STATED BY THE CANDIDATE";

/**
 * Two ways of writing the same claim.
 *
 * Only used to keep duplicates out. Deliberately blunt — case, spacing and a
 * trailing full stop are noise, anything else is a different claim. Trying to
 * decide that "Postgres" and "PostgreSQL" are one fact is a judgement call, and
 * getting it wrong silently drops something the candidate asked to record.
 */
export function factKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "");
}

/**
 * The candidate's document with their stated facts appended.
 *
 * Blank lines between them because `logicalLines` splits on blank lines: each
 * fact becomes one logical line and therefore one citable id. Run them together
 * and they would join into a single line, so a bullet citing one would be
 * checked against all of them.
 *
 * Returns the text unchanged when there is nothing to add, so a document with
 * no supplement hashes to exactly the same line ids it always did — stored
 * citations keep resolving.
 */
export function withAssertedFacts(resumeText: string, facts: AssertedFact[]): string {
  const lines = facts.map((f) => f.text.trim()).filter(Boolean);
  if (!lines.length) return resumeText;
  return `${resumeText.trimEnd()}\n\n${SUPPLEMENT_HEADING}\n\n${lines.join("\n\n")}\n`;
}

/**
 * Adds a fact, or returns the list untouched if it is already there.
 *
 * Identity on the way out is deliberate: the caller writes to localStorage on
 * change, and a duplicate accept shouldn't look like one.
 */
export function addAssertedFact(facts: AssertedFact[], fact: AssertedFact): AssertedFact[] {
  const key = factKey(fact.text);
  if (!key) return facts;
  if (facts.some((f) => factKey(f.text) === key)) return facts;
  return [...facts, fact];
}

export function removeAssertedFact(facts: AssertedFact[], id: string): AssertedFact[] {
  return facts.filter((f) => f.id !== id);
}

/** A fact from an accepted proposal, stamped with when and where it came from. */
export function mintAssertedFact(text: string, sessionId: string): AssertedFact {
  return {
    id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: text.trim(),
    addedAt: new Date().toISOString(),
    sessionId,
  };
}

/**
 * Stored facts, brought up to the current shape.
 *
 * Anything malformed is dropped rather than repaired. These end up in the text
 * a resume is generated from, so a half-read record is not something to guess
 * at — a fact you can no longer see is better than a fact that says the wrong
 * thing on a document you send to an employer.
 */
export function readAssertedFacts(stored: unknown): AssertedFact[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const out: AssertedFact[] = [];

  for (const raw of stored) {
    if (!raw || typeof raw !== "object") continue;
    const { id, text, addedAt, sessionId } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !id) continue;
    if (typeof text !== "string" || !text.trim()) continue;

    const key = factKey(text);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id,
      text: text.trim(),
      addedAt: typeof addedAt === "string" ? addedAt : "",
      sessionId: typeof sessionId === "string" ? sessionId : "",
    });
  }

  return out;
}
