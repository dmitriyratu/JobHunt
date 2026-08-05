import type { MatchReport } from "@/types";

/**
 * A match report that never existed, for a job that never existed.
 *
 * Every screenshot in What's new is taken from data like this rather than from
 * a real session, for two reasons. The obvious one is privacy: a screenshot of
 * a real report is a screenshot of someone's resume, their name, and the job
 * they are quietly applying for, committed to the repository forever. The
 * subtler one is that a real report costs an analysis call to produce and comes
 * out slightly different every time, so the same feature would be photographed
 * against different content on every run.
 *
 * The numbers here are chosen, not arbitrary. There is at least one requirement
 * at each of the four outcomes, because the outcome filter has nothing to show
 * otherwise, and the counts are what the scene's click targets name — see
 * `scenes.json`. Changing the mix means changing those labels too.
 */
export const MATCH_REPORT: MatchReport = {
  overallScore: 72,
  summary:
    "You clear the bar on the experience and the core stack, and the posting's two hard asks — real-time 3D and robotics exposure — are where the distance is. Three more requirements are partly answered by your resume and would be worth stating outright.",
  generatedAt: "2026-01-01T00:00:00.000Z",
  sourceSnapshot: { resumeLength: 4820, jobDescLength: 3140 },
  items: [
    {
      id: "req-experience",
      requirement: "5+ years building production web applications",
      importance: "critical",
      status: "match",
      strength: "exceeds",
      evidence:
        "Nine years across three companies, the last four leading the web platform team at Halcyon Freight.",
      note: "Comfortably past the asked-for five, and the years are all on production software rather than prototypes.",
    },
    {
      id: "req-react",
      requirement: "Deep expertise with React and TypeScript",
      importance: "critical",
      status: "match",
      strength: "meets",
      evidence:
        "Rebuilt the Halcyon dispatch console in React and TypeScript; owned the migration off the legacy Angular app.",
      note: "Directly stated and backed by a named project, which is the strongest form this can take.",
    },
    {
      id: "req-design-system",
      requirement: "Experience maintaining a design system at scale",
      importance: "important",
      status: "match",
      strength: "meets",
      evidence:
        "Authored and maintained the internal component library used by six product teams.",
      note: "Six teams is a fair reading of \"at scale\" for a company of this size.",
    },
    {
      id: "req-mentoring",
      requirement: "Track record of mentoring and growing engineers",
      importance: "important",
      status: "partial",
      strength: "meets",
      evidence: "Led a team of five engineers.",
      note: "Leading a team implies mentoring but does not say it. If you have run onboarding, reviews, or a formal mentorship pairing, name it — this is the kind of requirement that is answered by one sentence.",
    },
    {
      id: "req-accessibility",
      requirement: "Shipped interfaces meeting WCAG 2.1 AA",
      importance: "important",
      status: "partial",
      strength: "meets",
      evidence: "Improved keyboard navigation and screen-reader support across the console.",
      note: "The work is there but the standard is not named. If the audit was against 2.1 AA, saying so converts this to a match.",
    },
    {
      id: "req-rust",
      requirement: "Comfortable writing Rust for internal tooling",
      importance: "nice-to-have",
      status: "partial",
      strength: "meets",
      evidence: "Wrote the build cache used by the front-end monorepo.",
      note: "The resume does not say what it was written in. If that was Rust, this is a match and currently reads as a maybe.",
    },
    {
      id: "req-webgl",
      requirement: "Experience with WebGL or real-time 3D rendering",
      importance: "important",
      status: "gap",
      strength: "meets",
      evidence: "Nothing in the resume touches 3D or graphics work.",
      note: "A genuine gap. Worth deciding whether to address it directly in the cover letter rather than leaving it to be noticed.",
    },
    {
      id: "req-robotics",
      requirement: "Familiarity with robotics or hardware-adjacent systems",
      importance: "nice-to-have",
      status: "gap",
      strength: "meets",
      evidence: "No hardware or robotics work appears in the resume.",
      note: "Listed as nice-to-have, so this is unlikely to be what decides the application.",
    },
  ],
  standouts: [
    {
      id: "standout-oss",
      credential: "Maintains a routing library with 40k weekly downloads",
      evidence: "Open-source section: \"creator and maintainer of Wayfare (40k weekly downloads)\".",
      whyValuable:
        "The posting never asks for open-source work, but maintaining something other teams depend on demonstrates the API judgement it does ask for, in public and at length.",
    },
    {
      id: "standout-patent",
      credential: "Named on a patent for freight route optimisation",
      evidence: "Listed under awards: US patent 11,204,883.",
      whyValuable:
        "Rare enough to be memorable, and it places you on the algorithmic side of a logistics problem — adjacent to the path-planning work this team does.",
    },
  ],
};
