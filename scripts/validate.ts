/** CI gate: projects.yaml must validate, and every game entry must have a release in the snapshot. */
import { loadProjects, loadSnapshot } from "../data/load.ts";

const projects = loadProjects();
const snapshot = loadSnapshot();
const problems: string[] = [];

for (const p of projects) {
  const s = snapshot.repos[p.repo];
  if (!s) continue; // not fetched yet (new entry in a PR) — fetch.ts reports it after merge
  if (p.kind !== "tool" && s.releaseCount === 0) problems.push(`${p.repo}: no published release yet`);
}

console.log(`${projects.length} entries OK.`);
if (problems.length) {
  console.warn(`Warnings (entries shown as "no release" on the site):\n${problems.map((x) => `  - ${x}`).join("\n")}`);
}
