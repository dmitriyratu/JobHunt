import { PERSONA } from "./persona";

/**
 * The invented posting behind the loaded-job scenes.
 *
 * Long enough that the character count beside the source reads like a real
 * posting rather than a placeholder — that number is rendered from
 * `POSTING_TEXT.length`, so it is only ever as honest as this string.
 */
export const POSTING_SOURCE = "https://www.linkedin.com/jobs/view/4123456789";

/**
 * Deliberately a mouthful.
 *
 * The role sits in the middle column of the loaded strip, which is half the
 * row, and the titles that actually turn up in postings — team, product line
 * and level all stapled together — are the case worth photographing. A tidy
 * "Frontend Engineer" would fit on one line and prove nothing.
 */
export const POSTING_TITLE = `Senior ${PERSONA.role.replace("Senior ", "")}, Real-Time Robotics Interfaces`;

export const POSTING_TEXT = [
  `${POSTING_TITLE}`,
  `${PERSONA.company} — New York, NY (Hybrid, 3 days on-site)`,
  "",
  `${PERSONA.company} builds autonomous handling systems for warehouses. The web platform team owns the interfaces our operators use to supervise fleets in real time — fleet dashboards, incident review, and the simulation tooling our robotics engineers work in every day.`,
  "",
  "What you'll do",
  "· Own the operator console end to end, from the rendering layer to the API contracts behind it.",
  "· Work alongside robotics engineers to turn telemetry nobody can read into interfaces an operator can act on in seconds.",
  "· Set the front-end direction for a team of eight, and mentor the engineers on it.",
  "",
  "What we're looking for",
  "· 5+ years building production web applications.",
  "· Deep expertise with React and TypeScript.",
  "· Experience with WebGL or real-time 3D rendering.",
  "· Familiarity with robotics or hardware-adjacent systems is a plus.",
  "· A track record of mentoring and growing engineers.",
  "· Experience maintaining a design system at scale.",
  "· Shipped interfaces meeting WCAG 2.1 AA.",
  "· Comfortable writing Rust for internal tooling is a plus.",
  "",
  "Compensation: $185,000 – $240,000 per year, plus equity and an annual bonus.",
  "",
  `${PERSONA.company} is an equal opportunity employer. We consider all qualified applicants without regard to race, colour, religion, sex, sexual orientation, gender identity, national origin, disability or veteran status.`,
].join("\n");
