import type { JobFacts } from "@/types";

/**
 * Three postings, invented, differing only in how much they admit.
 *
 * The middle and worst cases are the point. Every layout looks fine against a
 * posting that answered all ten questions; the ones worth judging are the
 * posting that names a city and nothing else, and the posting that is a wall of
 * text with a job title at the top — which is most of them.
 */

/** A posting that states almost everything. Rare, and the easy case. */
export const FACTS_RICH: JobFacts = {
  salary: {
    min: 185000,
    max: 235000,
    currency: "USD",
    period: "year",
    raw: "$185,000 — $235,000 base, plus equity and an annual performance bonus",
    note: "plus equity + bonus",
  },
  locations: ["San Francisco, CA", "New York, NY"],
  workplace: "hybrid",
  workplaceNote: "3 days on-site",
  employment: "full-time",
  seniority: "Staff",
  team: "Payments Infrastructure",
  postedAt: "4 days ago",
  deadline: "Aug 29, 2026",
  visaSponsorship: true,
  travel: "Up to 10%",
  extractedAt: "2026-08-05T09:12:00.000Z",
  editedKeys: [],
};

/** The common case: a location, a setup, a type, and silence about pay. */
export const FACTS_PARTIAL: JobFacts = {
  salary: null,
  locations: ["Austin, TX"],
  workplace: "remote",
  workplaceNote: "US time zones",
  employment: "full-time",
  seniority: "",
  team: "Data Platform",
  postedAt: "2 weeks ago",
  deadline: "",
  visaSponsorship: null,
  travel: "",
  extractedAt: "2026-08-05T09:12:00.000Z",
  editedKeys: [],
};

/** A posting that states one thing. The layout has to survive this. */
export const FACTS_SPARSE: JobFacts = {
  salary: null,
  locations: [],
  workplace: "onsite",
  workplaceNote: "",
  employment: null,
  seniority: "",
  team: "",
  postedAt: "",
  deadline: "",
  visaSponsorship: null,
  travel: "",
  extractedAt: "2026-08-05T09:12:00.000Z",
  editedKeys: [],
};

/** An hourly contract, to prove the pay formatter isn't annual-only. */
export const FACTS_HOURLY: JobFacts = {
  salary: {
    min: 85,
    max: 110,
    currency: "USD",
    period: "hour",
    raw: "$85–$110/hr W2, depending on experience",
    note: "W2",
  },
  locations: ["Remote (US)"],
  workplace: "remote",
  workplaceNote: "",
  employment: "contract",
  seniority: "Senior",
  team: "",
  postedAt: "Yesterday",
  deadline: "",
  visaSponsorship: false,
  travel: "",
  extractedAt: "2026-08-05T09:12:00.000Z",
  editedKeys: [],
};

export const POSTING_TEXT = `Staff Software Engineer, Payments Infrastructure

Northwind builds the settlement rails that move money for 40,000 merchants across 14 countries. The Payments Infrastructure team owns the ledger, the reconciliation pipeline and the systems that keep every cent accounted for at the end of the day.

About the role

You will lead the design of the next generation of our double-entry ledger, working across a distributed system that processes roughly $2B annually. This is a hands-on staff role: you will write code, set direction for three engineers, and be the person the rest of engineering asks when a settlement question comes up.

What you'll do
- Own the architecture of the ledger and reconciliation services end to end.
- Drive our migration from batch settlement to a streaming model.
- Partner with Finance and Compliance on audit and regulatory requirements.
- Raise the bar on testing, observability and incident response for money-movement systems.

What we're looking for
- 8+ years building backend systems, with at least 3 in payments, banking or another domain where correctness is non-negotiable.
- Deep experience with distributed systems and event-driven architecture.
- Fluency in Go or Java, and comfort in PostgreSQL at scale.
- Experience with double-entry accounting concepts, ledger design or financial reconciliation.
- A track record of mentoring senior engineers.

Nice to have
- Exposure to card network integrations or ACH.
- Open-source contributions to infrastructure or data tooling.

Location and setup

This role is hybrid, based out of our San Francisco or New York office, with three days a week on-site. We sponsor visas for candidates already authorised to work in the US or eligible for transfer.

Compensation

$185,000 — $235,000 base, plus equity and an annual performance bonus. Final offer depends on level, location and experience. Applications close August 29, 2026.`;
