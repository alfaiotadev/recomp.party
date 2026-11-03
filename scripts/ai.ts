/**
 * Refresh data/ai.json: which models and coding agents each repo's commits credit, per day.
 * Incremental: a repo whose default branch hasn't moved is skipped, and one that has is read back only
 * to the commit the last run stopped at (all the way to AI_SINCE after a force push or on first sight).
 *   npm run ai                 every repo in data/projects.yaml
 *   npm run ai -- owner/name   just these (rescanned in full)
 */
import { existsSync, writeFileSync } from "node:fs";
import { AI_PATH, AI_SINCE, loadAi, loadProjects } from "../data/load.ts";
import type { AiData, AiRepo } from "../data/schema.ts";
import { AGENT_FILES, creditsOf } from "./lib/ai-traces.ts";
import { graphql } from "./lib/github.ts";

const only = process.argv.slice(2).filter((a) => a.includes("/"));
const repos = only.length ? only : loadProjects().map((p) => p.repo);
const data: AiData = existsSync(AI_PATH) ? loadAi() : { generatedAt: "", since: AI_SINCE, repos: {} };
const save = () => {
  data.generatedAt = new Date().toISOString();
  // repos dropped from projects.yaml leave with the next full run
  if (!only.length) for (const r of Object.keys(data.repos)) if (!repos.includes(r)) delete data.repos[r];
  data.repos = Object.fromEntries(Object.entries(data.repos).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(AI_PATH, `${JSON.stringify(data, null, 1)}\n`);
};
const repoArg = (slug: string) => {
  const [owner, name] = slug.split("/");
  return `owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}`;
};

// 1. Cheap pass: where each default branch points, and what sits in the repo root.
type Head = { oid: string | null; files: string[] };
const heads = new Map<string, Head>();
for (let i = 0; i < repos.length; i += 40) {
  const batch = repos.slice(i, i + 40);
  const res = await graphql<Record<string, { defaultBranchRef: { target: { oid: string } } | null; root: { entries: { name: string }[] } | null } | null>>(
    `query {\n${batch.map((s, j) => `r${j}: repository(${repoArg(s)}) { defaultBranchRef { target { oid } } root: object(expression: "HEAD:") { ... on Tree { entries { name } } } }`).join("\n")}\n}`,
  );
  batch.forEach((s, j) => {
    const r = res.data?.[`r${j}`];
    if (r) heads.set(s, { oid: r.defaultBranchRef?.target.oid ?? null, files: (r.root?.entries ?? []).map((e) => e.name).filter((n) => n in AGENT_FILES) });
  });
}

// 2. Read new commits, newest first, until the last run's head or AI_SINCE.
type Commit = { oid: string; committedDate: string; message: string; author: { email: string | null; name: string | null; user: { login: string } | null } | null };
type History = { totalCount: number; pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Commit[] };
type Page = { defaultBranchRef: { target: { history: History } } | null };
const PAGE = 100;

async function readSince(slug: string, stopAt: string | null): Promise<{ commits: Commit[]; reachedStop: boolean; total: number }> {
  const commits: Commit[] = [];
  let after: string | null = null;
  let total = 0;
  for (let size = PAGE; ; ) {
    const q = `query($after: String) { repository(${repoArg(slug)}) { defaultBranchRef { target { ... on Commit {
      history(first: ${size}, after: $after, since: "${AI_SINCE}T00:00:00Z") { totalCount pageInfo { hasNextPage endCursor }
        nodes { oid committedDate message author { email name user { login } } } } } } } } }`;
    let res: Awaited<ReturnType<typeof graphql<{ repository: Page | null }>>>;
    try {
      res = await graphql<{ repository: Page | null }>(q, { after });
    } catch (e) {
      // a page of very long commit messages can time out at GitHub: ask for fewer
      if (size > 10) {
        size = Math.floor(size / 2);
        continue;
      }
      throw e;
    }
    const h: History | undefined = res.data?.repository?.defaultBranchRef?.target.history;
    if (!h) return { commits, reachedStop: false, total };
    total = h.totalCount;
    for (const c of h.nodes) {
      if (c.oid === stopAt) return { commits, reachedStop: true, total };
      commits.push(c);
    }
    if (!h.pageInfo.hasNextPage) return { commits, reachedStop: false, total };
    after = h.pageInfo.endCursor;
  }
}

function addCommits(repo: AiRepo, commits: Commit[]) {
  for (const c of commits) {
    for (const cr of creditsOf({ message: c.message, author: { email: c.author?.email, name: c.author?.name, login: c.author?.user?.login } })) {
      const entry = (repo.credits[cr.model] ??= { vendor: cr.vendor, tool: cr.tool, versioned: cr.versioned, days: {} });
      const day = c.committedDate.slice(0, 10);
      entry.days[day] = (entry.days[day] ?? 0) + 1;
    }
  }
}

let scanned = 0;
let read = 0;
const started = Date.now();
for (const slug of repos) {
  const head = heads.get(slug);
  if (!head) continue; // missing on GitHub: keep what we had
  const prev = only.length ? undefined : data.repos[slug];
  if (prev && prev.head === head.oid) {
    prev.files = head.files;
    continue;
  }
  const { commits, reachedStop, total } = await readSince(slug, prev?.head ?? null);
  const repo: AiRepo =
    prev && reachedStop
      ? { ...prev, head: head.oid, scannedAt: new Date().toISOString(), commits: total, files: head.files }
      : { head: head.oid, scannedAt: new Date().toISOString(), commits: total, credits: {}, files: head.files };
  addCommits(repo, commits);
  repo.credits = Object.fromEntries(Object.entries(repo.credits).sort(([a], [b]) => a.localeCompare(b)));
  data.repos[slug] = repo;
  scanned++;
  read += commits.length;
  if (scanned % 10 === 0) {
    save();
    console.log(`  ${scanned} repos rescanned, ${read} commits read (${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
save();
const credited = Object.values(data.repos).filter((r) => Object.keys(r.credits).length).length;
console.log(`Scanned ${scanned} changed repos (${read} commits); ${credited} of ${Object.keys(data.repos).length} credit a model or agent.`);
