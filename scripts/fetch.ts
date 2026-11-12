/** Refresh data/snapshot.json from GitHub for every repo in data/projects.yaml. */
import { writeFileSync } from "node:fs";
import { loadProjects, loadSnapshot, loadStarHistory, SITE_REPO, SNAPSHOT_PATH, STARS_PATH } from "../data/load.ts";
import type { RepoSnapshot, Snapshot } from "../data/schema.ts";
import { fetchRepos, inSoftwareHeritage, whyGone } from "./lib/github.ts";

const projects = loadProjects();
const before = loadSnapshot();
const previous = before.repos;
const { found, missing } = await fetchRepos(projects.map((p) => p.repo));

// Keep the earliest release date ever seen: a repo that deletes its old releases must not look new again.
for (const r of found) {
  const seen = [previous[r.repo]?.firstReleaseAt, r.releaseDates.at(-1)?.date].filter((d): d is string => !!d).sort();
  if (seen[0]) r.firstReleaseAt = seen[0];
}

// A repo that no longer resolves keeps its last snapshot, marked gone, so a takedown or a deleted repo doesn't wipe
// the entry's releases. Why it went is asked again every run: a DMCA block can follow a plain 404.
const generatedAt = new Date().toISOString();
const kept: RepoSnapshot[] = [];
for (const slug of missing) {
  const last = previous[slug];
  if (!last) {
    console.log(`  gone before its first fetch, nothing to keep: ${slug}`);
    continue;
  }
  const why = await whyGone(slug).catch((e: Error) => console.warn(`  [gone] ${slug}: ${e.message}`));
  if (!why) {
    kept.push(last); // REST still finds it, or couldn't tell: a hiccup, keep what we had as it was
    continue;
  }
  kept.push({
    ...last,
    gone: {
      since: last.gone?.since ?? generatedAt,
      lastSeen: last.gone ? last.gone.lastSeen : before.generatedAt,
      reason: why.reason,
      ...(why.notice && { notice: why.notice }),
      misses: (last.gone?.misses ?? 0) + 1,
      archived: (await inSoftwareHeritage(slug)) ?? last.gone?.archived,
    },
  });
}

const snapshot: Snapshot = {
  generatedAt,
  repos: Object.fromEntries([...found, ...kept].map((r) => [r.repo, r])),
  missing,
};
writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

// Daily star counts: GitHub no longer lists stargazers, so weekly growth is tracked here.
const history = loadStarHistory();
// The site's own repo too, for the carousel's vitals page (only its owner may list when stars were given).
const site = (await fetchRepos([SITE_REPO])).found[0];
history[snapshot.generatedAt.slice(0, 10)] = Object.fromEntries([...found, ...(site ? [site] : [])].map((r) => [r.repo, r.stars]));
const keep = Object.keys(history).sort().slice(-35);
writeFileSync(STARS_PATH, `${JSON.stringify(Object.fromEntries(keep.map((d) => [d, history[d]])), null, 1)}\n`);

const renamed = found.filter((r) => r.canonical.toLowerCase() !== r.repo.toLowerCase());
console.log(`Fetched ${found.length} repos, ${missing.length} missing.`);
for (const r of renamed) console.log(`  renamed: ${r.repo} -> ${r.canonical}`);
for (const m of missing) console.log(`  missing: ${m}${snapshot.repos[m]?.gone ? ` (${snapshot.repos[m].gone.reason}, since ${snapshot.repos[m].gone.since.slice(0, 10)})` : ""}`);
