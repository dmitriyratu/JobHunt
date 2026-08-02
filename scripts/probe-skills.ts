/**
 * What the fitter does to the keyword grid.
 *
 * The only probe here that costs nothing and needs nothing: no OpenAI key, no
 * TeX engine, no network. Both functions it exercises are pure, and both have
 * a history — the grid was untouchable for one release and then, once the
 * fitter could reach it, was cut by literal word overlap with the posting,
 * which stripped AWS and Terraform off a resume aimed at a job asking for
 * both. This pins the behaviour that replaced it: order decides what goes, a
 * skill the posting names is exempt wherever it sits, and no group is emptied.
 *
 *   npm run check:skills
 */

import { trimSkillTails, dropWeakestSkillGroup } from "@/lib/fitToPages";
import type { TailoredResume } from "@/types";

const POSTING =
  "We are hiring a platform engineer. You will own our cloud infrastructure and IaC, " +
  "run services on Kubernetes, and work with Go. Terraform. Experience with observability a plus.";

// The token set the fitter builds from the posting, mirrored here.
const COMMON = new Set(["the", "and", "for", "with", "that", "this", "from", "was", "were", "has", "had", "have", "which", "into", "over", "our", "their", "its", "all", "not", "but", "are", "been", "than", "then", "them", "also", "about", "you", "your", "we", "role", "team", "teams", "work", "working", "experience", "someone", "what", "who", "will", "would", "can", "more", "most", "some", "other"]);
const asked = new Set(
  POSTING.toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= 2 && !COMMON.has(w))
);

function resume(groups: { label: string; items: string[] }[]): TailoredResume {
  return {
    shape: "resume",
    pageTarget: 1,
    sections: [
      { key: "skills", keywords: { value: groups, source: [] } },
    ],
    collapsed: [],
    omitted: [],
  } as unknown as TailoredResume;
}

function show(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) process.exitCode = 1;
}

// 1. Tail is cut, head is kept, count is right.
{
  const r = resume([
    { label: "Cloud", items: ["AWS", "EKS", "Docker", "Helm", "Argo", "Datadog", "Vault", "Consul", "Nomad", "Packer"] },
  ]);
  const removed = trimSkillTails(r, asked, 8);
  const kept = r.sections[0].keywords!.value[0].items;
  show(
    "keep=8 cuts only the tail of a 10-item group",
    removed.length === 2 && kept.length === 8 && kept[0] === "AWS" && removed.join(",") === "Nomad,Packer",
    `kept=[${kept.join(", ")}] removed=[${removed.join(", ")}]`
  );
}

// 2. A skill the posting names survives from the tail — the old prune's failure,
//    inverted: matching now protects rather than selects.
{
  const r = resume([
    { label: "Cloud", items: ["Docker", "Helm", "Argo", "Datadog", "Vault", "Consul", "Packer", "Ansible", "Terraform", "Nomad"] },
  ]);
  const removed = trimSkillTails(r, asked, 5);
  const kept = r.sections[0].keywords!.value[0].items;
  show(
    "a posting-named skill in the tail is exempt",
    kept.includes("Terraform") && !removed.includes("Terraform") && kept.length === 6,
    `kept=[${kept.join(", ")}] removed=[${removed.join(", ")}]`
  );
}

// 3. The whole point of the rewrite: a group with nothing the posting literally
//    names is thinned, not gutted. The old prune left exactly one item here.
{
  const r = resume([
    { label: "Data", items: ["Kafka", "Spark", "Airflow", "dbt", "Snowflake", "Flink"] },
  ]);
  const removed = trimSkillTails(r, asked, 5);
  const kept = r.sections[0].keywords!.value[0].items;
  show(
    "an entirely unnamed group thins to `keep`, not to one",
    kept.length === 5 && removed.length === 1,
    `kept=[${kept.join(", ")}] removed=[${removed.join(", ")}]`
  );
}

// 4. Groups already at or under the budget are untouched.
{
  const r = resume([{ label: "Languages", items: ["Go", "Python", "SQL"] }]);
  const removed = trimSkillTails(r, asked, 5);
  show(
    "a group under the budget is left alone",
    removed.length === 0 && r.sections[0].keywords!.value[0].items.length === 3,
    `removed=[${removed.join(", ")}]`
  );
}

// 5. No group is ever emptied, whatever the budget.
{
  const r = resume([{ label: "Misc", items: ["Excel", "Jira", "Notion"] }]);
  const removed = trimSkillTails(r, asked, 0);
  const kept = r.sections[0].keywords!.value[0].items;
  show(
    "a zero budget still leaves one item per group",
    kept.length === 1 && removed.length === 2,
    `kept=[${kept.join(", ")}] removed=[${removed.join(", ")}]`
  );
}

// 6. The last-resort group drop reports what it took, and refuses at two groups.
{
  const r = resume([
    { label: "Cloud", items: ["AWS", "EKS"] },
    { label: "Languages", items: ["Go"] },
    { label: "Misc", items: ["Jira", "Notion"] },
  ]);
  const first = dropWeakestSkillGroup(r);
  const second = dropWeakestSkillGroup(r);
  show(
    "dropWeakestSkillGroup names its casualties and stops at two groups",
    first.join(",") === "Jira,Notion" && second.length === 0 && r.sections[0].keywords!.value.length === 2,
    `first=[${first.join(", ")}] second=[${second.join(", ")}] groupsLeft=${r.sections[0].keywords!.value.length}`
  );
}
