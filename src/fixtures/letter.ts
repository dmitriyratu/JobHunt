import { PERSONA } from "./persona";

/**
 * A generated outreach email, in the shape the editor stores it.
 *
 * The body is TipTap's HTML rather than plain text, because that is what
 * `LetterOutput` is handed at runtime — a fixture that passed a string would be
 * photographing a code path the app does not have.
 *
 * Written the way a good generation reads: specific about the two things the
 * match report called strengths, honest about the gap, and short enough that a
 * hiring manager finishes it. Screenshots of an app that writes for you are
 * also screenshots of how well it writes.
 */
export const LETTER_SUBJECT = `${PERSONA.role} — ${PERSONA.years} years on production web platforms`;

export const LETTER_BODY = [
  `<p>Hi ${PERSONA.recipient},</p>`,
  `<p>I saw the ${PERSONA.role} opening at ${PERSONA.company} and wanted to reach out directly. I've spent the last four years leading the web platform team at ${PERSONA.employer}, where I rebuilt our dispatch console in React and TypeScript and moved six product teams onto a shared component library.</p>`,
  `<p>The part of your posting that caught me was real-time 3D. I haven't shipped WebGL in production — that's a genuine gap rather than something I'll dress up — but the routing library I maintain outside work has taught me more about performance budgets and API design under load than any framework has.</p>`,
  `<p>If it would help, I'm happy to walk through how we cut the console's time-to-interactive by half without a rewrite.</p>`,
  `<p>Best,<br>${PERSONA.name}</p>`,
].join("");
