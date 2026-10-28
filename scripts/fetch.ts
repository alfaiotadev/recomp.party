/** Refresh data/snapshot.json from GitHub for every repo in data/projects.yaml. */
import { writeFileSync } from "node:fs";
import { loadProjects, SNAPSHOT_PATH } from "../data/load.ts";
import type { Snapshot } from "../data/schema.ts";
import { fetchRepos } from "./lib/github.ts";

const projects = loadProjects();
const { found, missing } = await fetchRepos(projects.map((p) => p.repo));

const snapshot: Snapshot = {
  generatedAt: new Date().toISOString(),
  repos: Object.fromEntries(found.map((r) => [r.repo, r])),
  missing,
};
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

const renamed = found.filter((r) => r.canonical.toLowerCase() !== r.repo.toLowerCase());
console.log(`Fetched ${found.length} repos, ${missing.length} missing.`);
for (const r of renamed) console.log(`  renamed: ${r.repo} -> ${r.canonical}`);
for (const m of missing) console.log(`  missing: ${m}`);
