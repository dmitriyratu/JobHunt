/**
 * The hard case: a career-changer whose evidence is buried.
 *
 * The easy fixture strands its metrics on their own lines, signposted with
 * pronouns — "It clears roughly $2B a year" all but asks to be folded upward.
 * Nothing here is signposted. The figures sit mid-sentence inside descriptive
 * bullets, the relevant work is framed in the vocabulary of the job the
 * candidate is leaving rather than the one they want, and several bullets are
 * pure description with no outcome at all.
 *
 * A writer earns its price here by judging what is transferable, finding the
 * number inside the sentence, and reframing without overstating. That is the
 * work the easy fixture cannot distinguish.
 */
export const RESUME = `PRIYA RAGHAVAN
priya.raghavan@example.com | 206-555-0193 | Seattle WA

PROFESSIONAL SUMMARY
Operations lead with a background in customer support and internal tooling.
Comfortable with data and automation. Looking for a role with more technical
depth.

WORK HISTORY

Support Operations Manager, Halcyon Software
Jan 2022 to present
- Manage a support team and own the escalation process
- Responsible for reporting to leadership on support trends, which involved
  building out a set of SQL queries against the ticket database that eventually
  replaced the weekly manual report and now serves about 400 internal users
- Worked with engineering on tooling improvements
- Took ownership of the data quality problem in our reporting, tracked down the
  duplicate-ticket issue that had been inflating our volume numbers by around
  30% and wrote the dedup logic that fixed it
- Handle vendor relationships for our support stack
- Set up the nightly Python job that pulls from Zendesk and Salesforce into
  Snowflake, which the analytics team now depends on and which has run without
  manual intervention since March
- Participate in hiring

Senior Support Specialist, Halcyon Software
March 2020 - December 2021
- Handled escalated customer issues
- Built the internal knowledge base in Confluence, which cut average handle time
  from about 14 minutes to just under 9 over two quarters
- Trained new hires on the support tooling
- Was the main point of contact for the EMEA region

Customer Support Representative, Bright Harbor Retail
2018-2020
- Answered customer inquiries by phone and email
- Met or exceeded all quality targets
- Helped out with scheduling

EDUCATION
BA Communications, University of Washington, 2018
Certificate in Data Analytics, Coursera, 2021

TECHNICAL SKILLS
SQL, Python, Snowflake, Zendesk, Salesforce, Confluence, Excel, Tableau,
dbt (learning), Git, JIRA, process documentation, stakeholder management`;

export const JOB = `Analytics Engineer - Wavelength Health

We are a small data team supporting a clinical operations org. This role is for
someone who builds and owns the pipelines and models the rest of the company
reads their numbers from.

What the job actually involves:
- Writing and maintaining SQL transformations that other people depend on daily
- Owning data quality: finding out why a number is wrong and making it right
- Python for ingestion from third-party APIs into the warehouse
- Snowflake, and dbt if you have it (we will teach it if you do not)
- Working directly with non-technical stakeholders to turn a vague question
  into a metric definition

We care much more about whether you have owned a pipeline end to end than about
your job title. Several people on this team came from support, ops or analyst
backgrounds.`;
