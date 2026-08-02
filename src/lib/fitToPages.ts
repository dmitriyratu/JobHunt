import { specFor } from "./documentShape";
import { renderResumeLatex } from "./resumeLatex";
import { compileLatex } from "./latexEngine";
import { visibleBullets } from "./tailoredResume";
import { dateOrder } from "./tailoredResume";
import type { ResumeProfile } from "./settings";
import type {
  CollapsedEntry,
  ResumeBullet,
  ResumeEntry,
  ResumeSection,
  TailoredResume,
} from "@/types";

/**
 * Making the document actually fit the page count it was asked for.
 *
 * The page target used to be advice in a prompt and nothing else. Asked for one
 * page, a nine page source produced two, three and three pages across three
 * runs — while the app was already computing the exact page count on every
 * compile and throwing it away. This is the loop that was missing: typeset,
 * count, cut, typeset again.
 *
 * WHY THE CUTTING IS DETERMINISTIC
 * The obvious alternative is another model call: "this is a page too long, pick
 * what to lose". That costs money and latency per attempt, gives a different
 * answer every run, and has to be re-grounded afterwards because anything it
 * rewrites is new text. Cutting the last bullet of the least relevant entry is
 * explainable to the user, produces the same document twice, and removes the
 * bullet the writer itself ranked last — bullets within an entry arrive in
 * relevance order.
 *
 * WHAT IT WILL NOT DO
 * It never edits a line, so nothing it produces needs re-checking. It never
 * takes a surviving entry below one bullet — a role trimmed until it says
 * nothing should be collapsed to a line of history instead, which is what
 * collapseWeakest is for. And it never leaves the page emptier than it has to:
 * the search below looks for the MOST content that fits, not the first amount
 * that happens to.
 */

/**
 * WHAT GETS CUT FIRST, AND WHY IT IS NOT THE OLDEST
 *
 * The first version of this trimmed the oldest entry's last bullet, on the
 * theory that recency is a decent proxy for relevance. It is not. Given nine
 * pages against a one page target it cut the current role down to a floor of
 * three bullets and in doing so removed the OpenTelemetry work, the Aurora
 * migration at ninety seconds of downtime, and on-call ownership — three
 * explicit requirements of the posting — while leaving two million iOS
 * downloads, a weekend transit map and a community garden board seat on the
 * page. It buried the best material to protect a rule about dates.
 *
 * So entries are ranked by what they argue for THIS posting: how much of their
 * text overlaps the job description. Cutting starts at the entry that argues
 * least. Within an entry the last bullet goes first, which is the writer's own
 * ranking — bullets arrive in relevance order.
 *
 * Recency still breaks ties, so between two equally irrelevant roles the older
 * one goes first.
 */

/** Compiles are seconds each, so the loop is bounded rather than patient. */
const MAX_ROUNDS = 8;
/** No surviving entry drops below this. A role with nothing to say is collapsed. */
const FLOOR = 1;

/**
 * How far the keyword grid is thinned, a step at a time.
 *
 * Each number is how many items a group may keep; the page is re-measured
 * between steps and the ladder stops the moment the document fits, so a
 * document a few lines over loses a few keywords rather than most of them.
 * Five is roughly where a row stops being a row, which is why the ladder ends
 * there and the next thing to give is a bullet.
 */
const SKILL_KEEP_LADDER = [8, 6, 5];

/**
 * Sections whose entries are never collapsed, however little they argue.
 *
 * Relevance is measured as overlap with the posting, and a degree has almost
 * none by construction — "Bachelor of Science, Purdue University" shares no
 * vocabulary with a platform engineering ad. Scored on that basis education
 * sorts to the front of the cut list, and the first version of this duly
 * reduced both degrees to an "Earlier:" line on a resume that still had room
 * for a weekend project. Education is not competing with the jobs; it is a
 * credential the reader looks for and finds or does not.
 */
const NEVER_COLLAPSE = new Set(["education", "licensure", "certifications"]);

/**
 * Drops the least important optional section entirely.
 *
 * The step that has to come before any of the others, and the one this was
 * missing longest. A nine page source at a one page target came back with ten
 * sections — Certifications, Publications, Honors, Volunteer, Languages — and
 * the fitter, which knew only how to cut bullets and collapse roles, gutted the
 * entire job history down to two bullets while Languages sat there with three.
 * It could not fit the page because jobs were never what was filling it.
 *
 * Which is also how a person would do it: on a one-pager you lose Languages and
 * Volunteer before you lose a line about the work.
 *
 * Ranked by relevance to the posting, NOT by where the section prints. Band
 * order alone got this exactly backwards on the first attempt — it dropped
 * Certifications, which held an AWS Solutions Architect and a CKA on a posting
 * that asks for Kubernetes and Terraform, while a community garden board seat
 * survived. Volunteer was untouchable for a second reason too: the first
 * version refused to drop any section that had entries in it, which is most of
 * the ones worth dropping.
 */
function sectionRelevance(
  section: ResumeSection,
  wanted: Set<string>
): number {
  if (section.entries?.length) {
    return Math.max(...section.entries.map((e) => relevance(e, wanted)));
  }
  const text = [
    section.prose?.value ?? "",
    ...(section.items ?? []),
    ...(section.keywords?.value ?? []).flatMap((g) => g.items),
  ].join(" ");
  const overlap = new Set(terms(text).filter((w) => wanted.has(w))).size;
  return Math.min(10, Math.round((overlap / 4) * 10));
}

function dropWeakestSection(resume: TailoredResume, wanted: Set<string>): string | null {
  const optional = resume.sections
    .map((section) => ({ section, spec: specFor(resume.shape, section.key) }))
    .filter(({ spec }) => spec && !spec.core)
    .map((x) => ({ ...x, score: sectionRelevance(x.section, wanted) }))
    // Least relevant first; among equals, whatever prints furthest down.
    .sort((a, b) => a.score - b.score || (b.spec!.band ?? 0) - (a.spec!.band ?? 0));

  const weakest = optional[0];
  if (!weakest) return null;

  resume.sections = resume.sections.filter((s) => s !== weakest.section);
  return weakest.section.key;
}

/**
 * A prose section split into the sentences it can be shortened by.
 *
 * Only on a full stop followed by a capital, and only where both halves are
 * long enough to be sentences. A summary is two or three of these; abbreviating
 * one mid-clause would be worse than leaving the page long.
 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter((x) => x.length > 20);
}

/**
 * Drops the last sentence of the summary.
 *
 * Removal, not editing — the same rule the bullets follow, and for the same
 * reason: a shorter summary claims strictly less than the one that was checked,
 * so nothing it produces needs re-grounding. The prompt asks prose to lead with
 * what the posting cares about most, so the last sentence is the writer's own
 * lowest-ranked, exactly as with bullets.
 *
 * Never below one sentence. A resume with a one-word summary reads as a
 * rendering fault; the section either says something or should not be there.
 */
function shortenSummary(resume: TailoredResume): boolean {
  for (const section of resume.sections) {
    const prose = section.prose;
    if (!prose?.value.trim()) continue;
    const parts = sentences(prose.value);
    if (parts.length <= 1) continue;
    section.prose = { ...prose, value: parts.slice(0, -1).join(" ") };
    return true;
  }
  return false;
}

/**
 * Thins the keyword grid from the tail of each group.
 *
 * WHY NOT BY WHAT THE POSTING NAMES
 * This used to keep only the skills whose words appear in the job description
 * and drop everything else in one pass. As a way of deciding what a skill is
 * worth, string overlap is far too blunt: a posting asking for "cloud
 * infrastructure and IaC" names none of AWS, Terraform, EKS or Kubernetes, so a
 * resume aimed squarely at it came back listing one of the four. Postings are
 * written by people who assume the reader can join those up, and a keyword grid
 * is read by people and by search engines who cannot. Dropping a skill also
 * costs more than it looks: it is gone from every keyword search anyone runs
 * against the document afterwards, including for a different role.
 *
 * WHAT DECIDES IT INSTEAD
 * Order. The writer emits each group with the skills this posting cares about
 * first — the same convention the bullets already use, and load-bearing for the
 * same reason — so the tail of a group is what argues least. `keep` is how many
 * of each group survive; the caller lowers it a step at a time and re-measures,
 * rather than clearing the grid in one go and hoping.
 *
 * Two things are exempt wherever they sit: a skill the posting names by word,
 * and the first item of any group, so the grid thins rather than developing
 * holes.
 *
 * Returns what it removed, by name. A count alone tells the applicant that four
 * skills went without telling them which four, which is the half that matters.
 *
 * Exported for scripts/probe-skills.ts, which is the only cheap probe in the
 * set — this is pure, so it can be pinned without a key or a TeX engine.
 */
export function trimSkillTails(
  resume: TailoredResume,
  asked: Set<string>,
  keep: number
): string[] {
  const removed: string[] = [];

  for (const section of resume.sections) {
    const keywords = section.keywords;
    if (!keywords) continue;

    const groups = keywords.value.map((group) => {
      if (group.items.length <= keep) return group;
      const kept = group.items.filter(
        (item, i) => i < Math.max(1, keep) || skillTokens(item).some((w) => asked.has(w))
      );
      removed.push(...group.items.filter((item) => !kept.includes(item)));
      return { ...group, items: kept };
    });

    section.keywords = { ...keywords, value: groups.filter((g) => g.items.length > 0) };
  }

  return removed;
}

/**
 * Drops the last keyword group outright, once thinning is not enough.
 *
 * Returns the skills that went with it, or an empty list when there was no
 * group left to spare — two groups are the floor, below which the grid stops
 * being a grid.
 */
export function dropWeakestSkillGroup(resume: TailoredResume): string[] {
  for (const section of resume.sections) {
    const keywords = section.keywords;
    if (!keywords || keywords.value.length <= 2) continue;
    const dropped = keywords.value[keywords.value.length - 1];
    section.keywords = { ...keywords, value: keywords.value.slice(0, -1) };
    return dropped.items;
  }
  return [];
}

export type FitResult = {
  resume: TailoredResume;
  /** Pages the document finally occupies, or 0 if it never compiled. */
  pages: number;
  /** Bullets cut to get there. They stay in the data, flagged `dropped`. */
  trimmed: number;
  /** Entries reduced to an "Earlier:" line. */
  collapsed: number;
  /** Optional sections dropped whole, by key, in the order they went. */
  droppedSections: string[];
  /**
   * Keyword entries cut to reach the page target, by name.
   *
   * Named rather than counted: the applicant is the only one who can tell
   * whether losing "Terraform" mattered, and they cannot do that from a number.
   */
  skillsRemoved: string[];
  /** Sentences taken off the end of the summary. */
  summaryShortened: number;
  /** True when the target was reached; false when it ran out of things to cut. */
  fits: boolean;
};

/** Entries of the document in printed order, paired with the section holding them. */
function entriesInOrder(resume: TailoredResume): { entry: ResumeEntry; section: number }[] {
  const out: { entry: ResumeEntry; section: number }[] = [];
  resume.sections.forEach((section, i) => {
    for (const entry of section.entries ?? []) out.push({ entry, section: i });
  });
  return out;
}

/** Words too common to say anything about what an entry argues for. */
const COMMON = new Set([
  "the", "and", "for", "with", "that", "this", "from", "was", "were", "has",
  "had", "have", "which", "into", "over", "our", "their", "its", "all", "not",
  "but", "are", "been", "than", "then", "them", "also", "about", "you", "your",
  "we", "role", "team", "teams", "work", "working", "experience", "someone",
  "what", "who", "will", "would", "can", "more", "most", "some", "other",
]);

const tokens = (text: string, min: number): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    // A dot is kept INSIDE a token, for "node.js" and "3.11", and stripped at
    // the edges. Without the strip, a posting ending a sentence on "Terraform."
    // never matched the skill "Terraform", so the grid dropped the one tool the
    // job had asked for by name.
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= min && !COMMON.has(w));

/** For prose, where short words are noise. */
const terms = (text: string): string[] => tokens(text, 4);

/**
 * For skills, where short words are the whole point.
 *
 * A four-character floor is right for prose and wrong for a keyword grid: it
 * makes AWS, SQL, Go, GCP, EKS and K8s invisible, which is most of what a
 * platform posting actually names. Thinning the grid on that basis stripped AWS
 * and Terraform from a resume aimed at a job asking for both, and left rows
 * reading "Languages: Go" — kept by the fallback that spares one item per
 * group, not because anything matched.
 */
const skillTokens = (text: string): string[] => tokens(text, 2);

/**
 * How much an entry argues for this posting.
 *
 * The writer's own 0-to-10, because the writer read both documents and this is
 * a judgement, not a string comparison.
 *
 * The fallback below — distinct words shared with the posting — is what this
 * used to do on its own, and it was the wrong tool wearing a determinism
 * costume. It scored an open-source static analyzer at zero on a posting that
 * asked for open-source work, because "analyzer" and "bookkeeping" are not
 * words the ad happened to use. It survives only for documents generated before
 * the model was asked for a ranking; scaled to the same 0-10 range so a mixed
 * document cannot sort by which era its entries came from.
 */
function relevance(entry: ResumeEntry, wanted: Set<string>): number {
  if (typeof entry.relevance === "number" && Number.isFinite(entry.relevance)) {
    return Math.max(0, Math.min(10, entry.relevance));
  }

  const text = [
    entry.heading,
    entry.organization,
    ...visibleBullets(entry.bullets).map((b) => b.value),
  ].join(" ");
  const overlap = new Set(terms(text).filter((w) => wanted.has(w))).size;
  // Eight distinct matching terms is a thoroughly on-target entry; past that
  // the extra words say nothing more.
  return Math.min(10, Math.round((overlap / 8) * 10));
}

/**
 * Which entry gives up a bullet next: the one arguing least for this posting,
 * oldest first among equals, and only if it is still above the floor.
 */
function nextToTrim(resume: TailoredResume, wanted: Set<string>): ResumeEntry | null {
  const candidates = entriesInOrder(resume)
    .map(({ entry }) => entry)
    .filter((entry) => visibleBullets(entry.bullets).length > FLOOR)
    .sort((a, b) => {
      const byRelevance = relevance(a, wanted) - relevance(b, wanted);
      if (byRelevance !== 0) return byRelevance;
      const ra = dateOrder(a.endDate) ?? dateOrder(a.startDate) ?? -Infinity;
      const rb = dateOrder(b.endDate) ?? dateOrder(b.startDate) ?? -Infinity;
      return ra - rb;
    });

  return candidates[0] ?? null;
}

/**
 * Drops the last visible bullet of the least relevant entry, appending it to
 * the cut order. Returns false when every entry is at its floor.
 */
function trimOneBullet(
  resume: TailoredResume,
  wanted: Set<string>,
  cutOrder: ResumeBullet[]
): boolean {
  const target = nextToTrim(resume, wanted);
  if (!target) return false;

  const visible = visibleBullets(target.bullets);
  const last = visible[visible.length - 1];
  if (!last) return false;

  // Mutating the bullet in place keeps every other reference to this entry
  // valid; `dropped` is exactly the field that exists for this.
  last.dropped = true;
  // The bullet itself, not its id. Ids come from the model and are unique only
  // because the prompt asks for it; the search must not depend on that.
  cutOrder.push(last);
  return true;
}

/**
 * Collapses the entry arguing least for this posting into one line.
 *
 * The step past trimming, and the reason it exists: "never drop an entry
 * entirely" is a good rule for a two page resume and a bad one for a nine page
 * source, where it kept a 2012 iOS job on a one page platform resume. A role
 * with nothing left to say for this posting still belongs on the page as a line
 * of history, not as a dated block with a bullet under it.
 */
function collapseWeakest(resume: TailoredResume, wanted: Set<string>): boolean {
  const ranked = entriesInOrder(resume)
    .filter(({ section }) => !NEVER_COLLAPSE.has(resume.sections[section].key))
    .map(({ entry, section }) => ({
      entry,
      section,
      score: relevance(entry, wanted),
      date: dateOrder(entry.endDate) ?? dateOrder(entry.startDate) ?? -Infinity,
    }))
    .sort((a, b) => a.score - b.score || a.date - b.date);

  // Never the last two entries standing: a resume is not a list of dates.
  if (ranked.length <= 2) return false;

  const weakest = ranked[0];
  const section = resume.sections[weakest.section];
  section.entries = (section.entries ?? []).filter((e) => e !== weakest.entry);

  const collapsed: CollapsedEntry = {
    sectionKey: section.key,
    heading: weakest.entry.heading,
    organization: weakest.entry.organization,
    startDate: weakest.entry.startDate,
    endDate: weakest.entry.endDate,
  };
  resume.collapsed = [...(resume.collapsed ?? []), collapsed];
  return true;
}

/** A structural clone, so trimming never mutates the caller's document. */
const clone = (resume: TailoredResume): TailoredResume =>
  JSON.parse(JSON.stringify(resume)) as TailoredResume;

/**
 * Typesets, and cuts until it fits.
 *
 * Never throws and never returns a worse document than it was given: if the
 * machine has no LaTeX engine, or a compile fails, the original comes back
 * untouched with `pages: 0`. A resume that cannot be measured is not a resume
 * that should be cut blind.
 */
export async function fitToPages(
  resume: TailoredResume,
  profile: ResumeProfile,
  jobDescription: string
): Promise<FitResult> {
  // What the posting asks for, as a bag of words. Everything the trimmer keeps
  // or discards is decided against this.
  const wanted = new Set(terms(jobDescription));
  const target = resume.pageTarget;
  const idle: FitResult = {
    resume,
    pages: 0,
    trimmed: 0,
    collapsed: 0,
    droppedSections: [],
    skillsRemoved: [],
    summaryShortened: 0,
    fits: true,
  };
  // A CV carries no target and is never trimmed to one.
  if (target === null) return idle;

  /**
   * Page count for one candidate, retried once.
   *
   * A failed compile reads as "0 pages", which the search treats as a signal to
   * stop — so a single flaky invocation ends the bisection early and ships
   * whatever it had. Tectonic does occasionally fail transiently under repeated
   * invocation, and it was doing exactly this: a half empty page, because one
   * probe out of six came back empty and the search believed it.
   */
  const measure = async (candidate: TailoredResume): Promise<number> => {
    const tex = renderResumeLatex(candidate, profile);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await compileLatex(tex);
      if (result.ok) return result.pages;
      if (process.env.FIT_DEBUG) {
        console.error(`[fit] compile failed (attempt ${attempt + 1}):`, result.message);
      }
    }
    return 0;
  };

  try {
    const working = clone(resume);
    let pages = await measure(working);
    if (pages === 0) return idle;
    if (pages <= target) {
      return {
        resume: working,
        pages,
        trimmed: 0,
        collapsed: 0,
        droppedSections: [],
        skillsRemoved: [],
        summaryShortened: 0,
        fits: true,
      };
    }

    let trimmed = 0;
    let collapsed = 0;
    const droppedSections: string[] = [];
    const skillsRemoved: string[] = [];
    let summaryShortened = 0;

    /**
     * Searches for the most content that fits, rather than cutting until it
     * does.
     *
     * The first version estimated how many bullets to remove from the current
     * bullets-per-page and cut that many. It always overshot, because bullets
     * are not the only thing on the page — the header, the skills grid and
     * every section title are fixed cost, so removing half the bullets does not
     * halve the document. It produced a one page resume carrying five bullets
     * with a third of the page white, which throws away evidence for nothing.
     *
     * Page count only ever falls as bullets are removed, so the largest number
     * that fits can be found by bisection. Every bullet is cut in relevance
     * order first, giving a fixed sequence in which the least valuable went
     * earliest; the search then decides how many to put back. Around six
     * compiles for a nine page source, against twenty for cutting one at a
     * time, and the answer is the fullest page rather than the first one that
     * happened to fit.
     */
    const searchWithin = async (): Promise<number> => {
      // Start from the whole document every time. Without this the second
      // search — the one after a collapse — would build its order from a
      // document already cut to the floors, find nothing left to trim, and so
      // have nothing it could put back: collapsing an entry would free a block
      // of the page that no bullet was ever allowed to occupy.
      for (const { entry } of entriesInOrder(working)) {
        for (const bullet of entry.bullets) bullet.dropped = false;
      }

      // Cut everything down to the floors, recording the order it went in.
      const order: ResumeBullet[] = [];
      while (trimOneBullet(working, wanted, order)) {
        /* nothing: the loop is the work */
      }

      // order[0] went first and is the least valuable; the tail is the best of
      // what was cut. Keeping k means restoring the last k.
      const keep = (k: number) => {
        order.forEach((b, i) => {
          b.dropped = i < order.length - k;
        });
      };

      let low = 0;
      let high = order.length;
      let bestFit = -1;

      keep(high);
      if ((await measure(working)) <= target) {
        // Everything fits once the collapses are in; nothing needs cutting.
        return order.length;
      }

      // Probe the floor before bisecting. When even an empty document overflows
      // — fourteen dated blocks whose headings alone fill the page — every probe
      // in between is a foregone conclusion, and the answer is to collapse an
      // entry rather than to keep measuring bullets that were never the problem.
      keep(0);
      if ((await measure(working)) > target) return -1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        keep(mid);
        const got = await measure(working);
        if (process.env.FIT_DEBUG) console.error(`[fit] keep ${mid}/${order.length} -> ${got}p`);
        // Two failed compiles in a row is the engine, not the document. Stop
        // rather than treat an unmeasurable page as an overflowing one.
        if (got === 0) break;
        if (got <= target) {
          bestFit = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      keep(Math.max(bestFit, 0));
      return bestFit;
    };

    // Before cutting anything, drop the roles that argue for nothing.
    //
    // An entry sharing no vocabulary at all with the posting still costs a
    // dated block, an organisation line and its floor bullet. Spending that on
    // a paper round is how a one page resume ends up carrying four bullets
    // spread across six jobs: the floor keeps every role alive at the expense
    // of the two the reader is actually there for. A role with a relevance of
    // zero is not competing for the page, so it becomes a line of history
    // first, and everything it was occupying goes to the roles that are.
    while (
      collapsed < MAX_ROUNDS &&
      entriesInOrder(working).some(
        ({ entry, section }) =>
          relevance(entry, wanted) === 0 && !NEVER_COLLAPSE.has(working.sections[section].key)
      ) &&
      collapseWeakest(working, wanted)
    ) {
      collapsed++;
    }

    // Optional sections go before any of the candidate's work does. Cheapest
    // possible check first: if dropping Languages gets the page, nothing else
    // has to be sacrificed at all.
    while (pages > target && droppedSections.length < MAX_ROUNDS) {
      const dropped = dropWeakestSection(working, wanted);
      if (!dropped) break;
      droppedSections.push(dropped);
      const after = await measure(working);
      if (after === 0) break;
      pages = after;
      if (pages <= target) break;
    }

    // The tail of the keyword grid is the cheapest thing on the page to lose —
    // six skills are worth about a line, where a line of bullets is a claim
    // about the work — so it goes before any of that does. But only the tail,
    // and only as far as the page actually demands: each step down the ladder
    // is measured before the next is taken, and the loop stops the moment the
    // document fits. An earlier version cleared everything the posting did not
    // name in a single unmeasured pass, which routinely cut far more than the
    // page needed and could not tell you what it had taken.
    const asked = new Set(skillTokens(jobDescription));
    for (const keep of SKILL_KEEP_LADDER) {
      if (pages <= target) break;
      const removed = trimSkillTails(working, asked, keep);
      if (removed.length === 0) continue;
      skillsRemoved.push(...removed);
      const after = await measure(working);
      if (after > 0) pages = after;
    }

    // Bisect; if not even an empty page fits, collapse the weakest entry and
    // bisect again. Collapsing frees a whole dated block, so it changes the
    // curve the search is walking and the search has to be redone.
    // When even an empty page overflows, give up structure rather than content,
    // in the order a person would: the summary's tail sentence, then a keyword
    // row, then a whole role reduced to a line of history. Each step re-runs the
    // search, because freeing space changes how many bullets fit.
    let best = await searchWithin();
    let rounds = 0;
    while (best < 0 && rounds < MAX_ROUNDS) {
      rounds++;
      if (shortenSummary(working)) {
        summaryShortened++;
      } else {
        const droppedGroup = dropWeakestSkillGroup(working);
        if (droppedGroup.length > 0) {
          skillsRemoved.push(...droppedGroup);
        } else if (collapseWeakest(working, wanted)) {
          collapsed++;
        } else {
          break;
        }
      }
      best = await searchWithin();
    }

    pages = await measure(working);
    if (pages === 0) return idle;

    trimmed = entriesInOrder(working)
      .flatMap(({ entry }) => entry.bullets)
      .filter((b) => b.dropped).length;

    return {
      resume: working,
      pages,
      trimmed,
      collapsed,
      droppedSections,
      skillsRemoved,
      summaryShortened,
      fits: pages <= target,
    };
  } catch (e) {
    if (process.env.FIT_DEBUG) console.error("[fit] threw:", e);
    return idle;
  }
}
