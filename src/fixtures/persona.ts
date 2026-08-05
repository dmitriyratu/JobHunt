/**
 * The invented person every scene is about.
 *
 * One persona across all of them, not a fresh name per fixture. Screenshots
 * from different scenes end up stacked in the same What's new panel, and a
 * candidate who is called Rowan on the upload screen and Sam in the letter
 * reads as a bug in the app rather than as two examples.
 *
 * Chosen to be unmistakably fictional. Nothing here should be findable, and
 * nothing should resemble the person whose repository this is: the whole reason
 * fixtures exist is that real screenshots leak a real resume.
 */
export const PERSONA = {
  name: "Rowan Vasquez",
  /** The company being applied to. */
  company: "Northwind Robotics",
  role: "Senior Frontend Engineer",
  /** Where they work now — cited as evidence throughout the match report. */
  employer: "Halcyon Freight",
  years: 9,
  /** The person the outreach letter is addressed to. */
  recipient: "Priya Raman",
} as const;
