import type { ResolvedProposal } from "@/types";

/**
 * A change the report chat is proposing, waiting to be accepted or rejected.
 *
 * This is the shape behind the v0.2.0 release — you tell the chat something
 * true that your resume never said, and rather than silently believing you, it
 * offers the claim back as a proposal you have to agree to.
 *
 * `resolution: "pending"` is the only state worth a screenshot. Accepted and
 * rejected cards are the same card with the buttons gone, and a picture of the
 * outcome does not show you the decision you were being asked to make.
 */
export const FACT_PROPOSAL: ResolvedProposal = {
  id: "proposal-postgres",
  target: "fact",
  action: "add",
  targetItemId: null,
  rationale:
    "You mentioned running the migration onto PostgreSQL, and the posting asks for it, but your resume never names the database. Recording it as a fact lets your tailored resume and cover letter cite it.",
  before: null,
  after: { text: "Worked with PostgreSQL, including a production migration off MySQL." },
  resolution: "pending",
};
