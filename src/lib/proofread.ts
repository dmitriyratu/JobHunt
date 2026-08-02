import type { SpellingSuggestion } from "@/types";

/**
 * Typos in the candidate's own document.
 *
 * Everything else in this app checks the tailored document against the uploaded
 * one. Nothing has ever checked the uploaded one, and it is copied through
 * untouched: employers, titles, degrees, certifications and publication lines
 * are printed exactly as they were extracted, because the prompt says to copy
 * them and factCheck enforces that they were copied. A misspelling in the source
 * is therefore not just missed, it is protected — a model that quietly fixed one
 * would have the fix reported as a field that does not appear in the upload.
 *
 * So the only place a typo can be caught is before any of that starts, and the
 * only party who can decide it IS a typo is the candidate. Hence a list to
 * accept or reject rather than a correction: this edits the source of truth
 * every later check is made against, and doing that silently would be the worst
 * version of the same defect.
 *
 * WHY A MODEL AND NOT A DICTIONARY
 * A resume is mostly proper nouns and jargon. On the CV that prompted this,
 * a standard word list rejects Haematologica, allogeneic, cyclophosphamide,
 * GVHD, UNIBE, Boelens and NewYork-Presbyterian — every one of them correct.
 * Precision matters more than recall here, because a list of forty non-problems
 * is a list nobody reads.
 *
 * WHAT KEEPS IT HONEST
 * A model asked for spelling fixes will happily return rewrites: a shorter
 * bullet, a nicer job title, "utilised" for "used". Every suggestion is
 * therefore re-checked here before it is offered — one token, present in the
 * document, within two edits of what it replaces. A suggestion that fails is
 * dropped rather than shown, so the wrongest thing the model can do is nothing.
 */

/** Levenshtein, iterative and small — the inputs are single words. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** Regex-safe, so a suggestion containing "." or "(" cannot build a pattern. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One word, matched whole. Shared so the UI highlights exactly what will change. */
export function wordRegExp(word: string, flags = ""): RegExp {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, flags);
}

/**
 * Word endings a spellchecker has no business having an opinion about.
 *
 * Two of these arrived from real documents, one after the other, and they are
 * the same mistake wearing different clothes:
 *
 *   "vaccinations → vaccination", against "community education on
 *   vaccinations". The plural is correct and is not the kind of thing that can
 *   be wrong; it is a choice about a sentence.
 *
 *   "translator → translation", against "served as Spanish-English medical
 *   translator". Here the suggestion is not merely unnecessary, it is wrong —
 *   she was the translator. Two edits, so distance let it through.
 *
 * Neither is a misspelling, and what they have in common is not their size. It
 * is that both words are built from the same stem with a different standard
 * ending on it, which is what word choice looks like and what a typo almost
 * never does. A slip of the fingers turns "Pediatric" into "Pediatirc", not into
 * another correctly formed English word.
 *
 * So the test is the stem plus the two tails. A shared stem of four or more
 * characters, and both remainders drawn from this list, means the model has
 * offered a different word rather than the same word spelled right.
 *
 * The list is deliberately short of anything a typo produces. "y" is absent so
 * that "Hematolog → Hematology" survives; "ied" is absent so that "Certifed →
 * Certified" does; "ian" is absent so that "Physicain → Physician" does.
 */
const ENDINGS = [
  "",
  "s",
  "es",
  "d",
  "ed",
  "ing",
  "ly",
  "'s",
  "’s",
  "e",
  "er",
  "or",
  "ors",
  "ers",
  "ion",
  "ions",
  "tion",
  "ation",
  "ive",
  "al",
  "ance",
  "ence",
  "ment",
  "ness",
  "ity",
  "ist",
  "ism",
];

/** Enough shared stem that the tails are endings rather than most of the word. */
const MIN_STEM = 4;

function differsOnlyByEnding(a: string, b: string): boolean {
  const one = a.toLowerCase();
  const two = b.toLowerCase();

  let stem = 0;
  while (stem < one.length && stem < two.length && one[stem] === two[stem]) stem++;
  if (stem < MIN_STEM) return false;

  return ENDINGS.includes(one.slice(stem)) && ENDINGS.includes(two.slice(stem));
}

/**
 * Every occurrence of a word, matched whole.
 *
 * Whole-word rather than substring: "ance" inside "advance" is not the typo,
 * and replacing it would corrupt a word that was right.
 */
function occurrences(text: string, word: string): number {
  return text.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"))?.length ?? 0;
}

/**
 * Whether a word only ever appears inside something that is not prose.
 *
 * Measured, not anticipated: on the first real document the reviewer read, the
 * single thing it reported was "alfauht1 → alfaut1", a missing letter in the
 * candidate's institutional email address. It is not wrong that the string looks
 * misspelled — it is a username, and a username is spelled however it was
 * issued. Changing one is not a correction, it is breaking the only way an
 * employer can reach her.
 *
 * Two signals, both cheap. A digit inside a word means identifier, not English.
 * And a word every one of whose occurrences sits inside a token carrying "@" or
 * a slash is part of an address, however English it looks on its own.
 */
function isIdentifier(text: string, word: string): boolean {
  if (/\d/.test(word)) return true;

  const hosts = text
    .split(/\s+/)
    .filter((token) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(token));

  return hosts.length > 0 && hosts.every((token) => /[@/\\]/.test(token));
}

/**
 * How far a "correction" may travel before it stops being one.
 *
 * Two edits covers the misspellings that actually occur — a transposition, a
 * doubled letter, a dropped one, a wrong vowel. It excludes the thing this must
 * never become: a model swapping one word for a better word. "Recieved" to
 * "Received" is one edit. "Used" to "Utilised" is five, and is an opinion.
 */
const MAX_EDITS = 2;

/**
 * Below this, a "typo" is more likely to be a real short word — an initial, a
 * unit, a two-letter state code — that a model has decided it dislikes.
 */
const MIN_LENGTH = 3;

/** More than a page of corrections is a bad extraction, not a proofread. */
const MAX_SUGGESTIONS = 20;

/**
 * The suggestions worth showing, from whatever the model returned.
 *
 * Order is preserved so the list reads in document order if the model gave it
 * that way. Duplicates collapse: the same misspelling in three places is one
 * decision, and accepting it fixes all three.
 */
export function verifySuggestions(
  raw: { wrong?: string; right?: string; note?: string }[] | undefined,
  text: string
): SpellingSuggestion[] {
  const out: SpellingSuggestion[] = [];
  const seen = new Set<string>();

  for (const item of raw ?? []) {
    const wrong = (item.wrong ?? "").trim();
    const right = (item.right ?? "").trim();

    if (!wrong || !right || wrong === right) continue;
    if (seen.has(wrong)) continue;
    // One token each. A multi-word "fix" is a rewrite, and there is no way to
    // tell a good one from a bad one by measuring it.
    if (/\s/.test(wrong) || /\s/.test(right)) continue;
    if (wrong.length < MIN_LENGTH || right.length < MIN_LENGTH) continue;
    if (editDistance(wrong.toLowerCase(), right.toLowerCase()) > MAX_EDITS) continue;
    if (differsOnlyByEnding(wrong, right)) continue;

    if (isIdentifier(text, wrong)) continue;

    const count = occurrences(text, wrong);
    if (!count) continue;

    seen.add(wrong);
    out.push({ wrong, right, note: (item.note ?? "").trim(), count });
    if (out.length >= MAX_SUGGESTIONS) break;
  }

  return out;
}

/**
 * A suggestion applied to the extracted text.
 *
 * Every occurrence, because the same word misspelled twice is the same mistake
 * twice and nobody wants to be asked about it again. Case-sensitive: "Pediatirc"
 * and "pediatirc" are separate suggestions if the document contains both, and
 * collapsing them would change a capital the candidate meant.
 */
export function applySuggestion(text: string, suggestion: SpellingSuggestion): string {
  return text.replace(
    new RegExp(`\\b${escapeRegExp(suggestion.wrong)}\\b`, "g"),
    suggestion.right
  );
}

/** All of them, for "Accept all". */
export function applySuggestions(text: string, suggestions: SpellingSuggestion[]): string {
  return suggestions.reduce(applySuggestion, text);
}

/**
 * The line the word sits in, split around it.
 *
 * Returned in three parts rather than as one string so the row can set the word
 * apart from its surroundings — reading a correction means seeing which word is
 * being corrected, and a sentence with one word somewhere in it does not say.
 *
 * The unit is the line, not a fixed number of words. Four words either side gave
 * "…Provided community education on vaccinations…", which is not enough of the
 * sentence to judge whether the plural is right; a resume line is short enough
 * to show whole and is the smallest thing that carries a complete thought. Long
 * ones are trimmed from the ends, so the word stays visible in the middle.
 */
export type SuggestionContext = { before: string; word: string; after: string };

const CONTEXT_CHARS = 90;

export function contextFor(text: string, suggestion: SpellingSuggestion): SuggestionContext | null {
  const match = wordRegExp(suggestion.wrong).exec(text);
  if (!match) return null;

  // The physical line, which for extracted text is the closest thing to the
  // sentence as the candidate laid it out.
  const start = text.lastIndexOf("\n", match.index) + 1;
  const end = text.indexOf("\n", match.index);
  const line = text.slice(start, end === -1 ? text.length : end);
  const at = match.index - start;

  const before = line.slice(0, at);
  const after = line.slice(at + suggestion.wrong.length);

  return {
    before: before.length > CONTEXT_CHARS ? `…${before.slice(-CONTEXT_CHARS)}` : before,
    word: suggestion.wrong,
    after: after.length > CONTEXT_CHARS ? `${after.slice(0, CONTEXT_CHARS)}…` : after,
  };
}
