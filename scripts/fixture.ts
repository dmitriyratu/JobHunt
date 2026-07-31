/**
 * One resume and one posting, shared by the measurement probes.
 *
 * Built so combining is available: several facts are split across adjacent
 * lines the way a real resume splits them, and the posting asks for exactly
 * those combinations. A writer that never cites two lines is leaving value on
 * the table; one that cites two and gets reverted is overreaching.
 */
export const RESUME = `DANA OKONKWO
dana.okonkwo@example.com | (415) 555-0148 | San Francisco, CA

SUMMARY
Backend engineer working on payments infrastructure. Eight years across two
companies. Interested in correctness-critical systems.

EXPERIENCE

Staff Engineer, Meridian Pay - San Francisco, CA
March 2021 - Present
- Designed and built the settlement pipeline that replaced the batch job
- The pipeline runs in 14 markets
- It clears roughly $2B of volume a year
- Took settlement latency from 40 minutes to under 3
- Wrote the reconciliation service in Go
- Reconciliation caught 1,100 mismatched ledger entries in its first quarter
- On-call rotation owner for the payments tier
- Mentored engineers on the payments team
- Also supported the ledger team through their rewrite
- Ran the migration off the legacy MySQL ledger alongside two other engineers
- Wrote the internal guide to idempotency keys that new hires still use

Senior Engineer, Kestrel Systems - Oakland, CA
June 2017 - February 2021
- Built the ingest service for merchant transaction feeds
- Ingest handled 30,000 events per second at peak
- Cut the p99 on the merchant API from 900ms to 210ms
- Added the retry and dead-letter layer after the 2019 outage
- Interviewed candidates for the platform team
- Shipped the first version of the fraud scoring hooks

EDUCATION
BS Computer Science, University of California, Davis - 2017

SKILLS
Go, Python, PostgreSQL, MySQL, Kafka, gRPC, Terraform, AWS, Datadog,
distributed systems, idempotency, double-entry ledgers, on-call`;

export const JOB = `Senior Backend Engineer, Payments Platform - Lyra Financial

We run settlement for merchants in 20+ countries and we are rebuilding the core
ledger. You would own the settlement path end to end.

What we need:
- Deep experience with high-volume settlement or clearing systems. Tell us the
  volume you have handled and the markets you have handled it in.
- Someone who has taken a latency number down and can say by how much.
- Go, in production, at scale.
- Ledger correctness: reconciliation, double-entry, idempotency.
- Experience migrating off a legacy datastore without downtime.
- Comfort owning on-call for a tier that cannot be down.

Nice to have: Kafka, mentoring, writing internal documentation.`;
