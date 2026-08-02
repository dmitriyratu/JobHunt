/**
 * The volume case: a long career document, badly written, mostly irrelevant.
 *
 * Roughly nine pages of real material. Every bullet is something the candidate
 * actually did, and almost every one is written the way people write them —
 * "Responsible for", passive voice, the number buried in the middle of a
 * subordinate clause, three facts jammed into one sentence.
 *
 * The posting is a platform/infrastructure role. Deliberately, only about half
 * the document argues for it: the mobile, design-system, people-management and
 * marketing-analytics material is real and good and belongs to a different job.
 * What this fixture measures is whether the writer can tell the difference at
 * volume, and what happens to the 50% it has to leave behind.
 */
export const RESUME = `MARCUS ADEYEMI-HALL
marcus.adeyemihall@example.com | (312) 555-0177 | Chicago, IL
linkedin.com/in/marcusah | github.com/marcusah

PROFESSIONAL SUMMARY
Experienced software engineer with over twelve years of experience across a
variety of domains including backend services, mobile applications, data
infrastructure and engineering management. Proven track record of delivering
results in fast-paced environments. Passionate about building great products
and mentoring engineers. Seeking a challenging role where I can leverage my
diverse skill set.

PROFESSIONAL EXPERIENCE

Principal Engineer, Corvid Logistics
February 2021 - Present
- Responsible for the overall architecture of the shipment tracking platform,
  which handles somewhere in the region of 40 million events per day across our
  carrier integrations and was previously a single Rails monolith that could not
  keep up during peak season
- Led the effort to decompose the monolith into services, a project that took
  about eighteen months and involved coordinating across four teams
- Was responsible for introducing Kafka as the backbone for event distribution,
  replacing a polling-based system that added an average of six minutes of
  latency to every status update
- Designed and implemented the idempotency layer that made carrier webhook
  ingestion safe to retry, which eliminated the duplicate-shipment problem that
  had been generating roughly 200 support tickets a week
- Built out the observability story, adding distributed tracing via OpenTelemetry
  and getting mean time to detection down from about 45 minutes to under 5
- Participated in the on-call rotation and served as the escalation point for
  platform incidents
- Was heavily involved in the migration from self-managed Postgres to Aurora,
  which we completed with about 90 seconds of total downtime
- Wrote the internal RFC process that the engineering org still uses
- Mentored several engineers, two of whom were promoted to senior
- Represented engineering in quarterly planning with product and operations
- Helped interview and hire approximately 15 engineers over three years
- Ran the weekly architecture review meeting
- Contributed to the cost optimization initiative, where my work on right-sizing
  our Kubernetes node pools and moving batch workloads to spot instances saved
  approximately $430,000 annually
- Set up the CI pipeline improvements that took our median build time from
  22 minutes down to just under 7 minutes
- Was the primary author of the disaster recovery runbook

Senior Software Engineer, Corvid Logistics
March 2019 - January 2021
- Worked on the carrier integration team building and maintaining integrations
  with approximately 30 shipping carriers, each with its own API quirks
- Built the retry and backoff framework that all carrier integrations now use
- Responsible for the SLA reporting pipeline, which aggregates delivery
  performance across carriers and is used by the operations team daily
- Fixed a long-standing bug in the rate-shopping logic that had been causing us
  to select suboptimal carriers, worth around $1.2M a year in shipping spend
- Participated in code review and helped establish the team's review guidelines
- Took part in the hiring process as an interviewer

Staff Software Engineer, Meridian Health Systems
June 2016 - February 2019
- Worked on the patient data platform, specifically the ingestion side, taking
  HL7 and FHIR feeds from about 60 hospital systems
- Built the deduplication service for patient records, which reduced duplicate
  patient records in the master index by around 78%
- Responsible for HIPAA compliance review of all new data flows
- Designed the audit logging system that tracks every access to patient data
- Worked with the data science team to expose a feature store, though this was
  eventually deprecated
- Was on the incident response rotation
- Helped migrate the platform from on-premise VMware to AWS over about a year
- Wrote a lot of Python for ETL and a fair amount of Java for the core services
- Presented our architecture at two internal engineering conferences

Senior iOS Engineer, Bellweather Retail Group
August 2013 - May 2016
- Built and shipped the flagship iOS shopping application, which reached about
  2 million downloads and maintained a 4.6 star rating
- Responsible for the app's checkout flow, including Apple Pay integration
- Reduced app launch time from 3.2 seconds to about 1.1 seconds through
  profiling and lazy loading of the product catalog
- Built the offline mode that let customers browse without connectivity
- Worked closely with the design team on the visual refresh
- Established the unit and UI testing practice for the mobile team, taking
  coverage from essentially zero to around 70%
- Mentored two junior iOS engineers
- Contributed to the shared design system used across iOS and Android
- Handled App Store submissions and release management

iOS Engineer, Bellweather Retail Group
July 2012 - July 2013
- Built features for the shopping application including search and wish lists
- Fixed bugs and responded to crash reports
- Worked on the loyalty card feature

Software Engineer, Northgate Marketing Analytics
September 2010 - June 2012
- Built dashboards for marketing attribution using Ruby on Rails and D3
- Responsible for the nightly ETL that pulled from Google Analytics, Facebook
  Ads and several ad networks into our warehouse
- Wrote SQL for analyst-requested reports
- Maintained the legacy PHP reporting tool
- Helped with the office move

SELECTED PROJECTS

ledgerlint (open source)
2022 - Present
- A static analyzer for double-entry bookkeeping code that catches unbalanced
  transaction paths, roughly 900 GitHub stars
- Written in Rust, used by three fintech companies that I know of

Chicago Transit Delay Map
2019
- A weekend project visualizing CTA delays, which got written up in a local
  publication and had about 30,000 visitors in its first month

EDUCATION
MS Computer Science, University of Illinois at Urbana-Champaign, 2010
BS Computer Engineering, Purdue University, 2008

CERTIFICATIONS
AWS Certified Solutions Architect - Professional, 2022
Certified Kubernetes Administrator (CKA), 2021

PUBLICATIONS AND TALKS
"Idempotency at the Edge: Safe Retries for Third-Party Webhooks" - QCon Chicago, 2023
"Decomposing a Monolith Without Stopping the World" - internal tech talk, 2022

HONORS AND AWARDS
Corvid Logistics Engineering Excellence Award, 2022
Hackathon winner, Meridian Health Systems, 2017

VOLUNTEER
Mentor, Code Chicago - 2018 to present, mentoring high school students in
introductory programming, roughly 40 students so far
Board member, Rogers Park Community Garden - 2020 to 2022

LANGUAGES
English (native), Yoruba (conversational), Spanish (basic)

TECHNICAL SKILLS
Languages: Go, Python, Java, Rust, Swift, Ruby, SQL, JavaScript, TypeScript
Infrastructure: Kubernetes, Terraform, AWS, Kafka, Postgres, Aurora, Redis,
Elasticsearch, Docker, ArgoCD
Observability: OpenTelemetry, Datadog, Prometheus, Grafana, PagerDuty
Mobile: iOS, Swift, Objective-C, XCTest, Core Data
Other: HL7, FHIR, HIPAA, distributed systems, event-driven architecture,
idempotency, disaster recovery, incident response, technical writing`;

export const JOB = `Staff Platform Engineer - Halyard Freight

Halyard moves freight for mid-market shippers. Our platform ingests status
events from carrier APIs and webhooks, normalizes them, and drives everything
downstream: customer notifications, SLA reporting, billing.

The platform team owns that ingestion path. It is currently a Rails application
with a polling worker, and it is at the end of what it can do. We are hiring a
staff engineer to lead the move to an event-driven architecture.

What this role needs:
- Someone who has decomposed a monolith into services in production, not in
  theory. We want to hear about the one you did and what went wrong.
- Deep event-streaming experience. Kafka specifically.
- Third-party integration at scale: carrier APIs, webhooks, and everything that
  makes them unreliable. Retries, idempotency, duplicate suppression.
- Production observability. We currently find out about incidents from
  customers.
- Postgres at scale, including migrations you cannot take downtime for.
- Kubernetes and Terraform. We run on EKS.
- Comfort owning on-call for the ingestion path.

Nice to have: logistics or supply chain background, cost optimization
experience, open source work.

This is an individual contributor role. We are not looking for a manager.`;
