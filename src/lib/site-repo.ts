/**
 * This site's own GitHub repo, for the carousel's "vitals" page: commits, merged pull requests and stars per
 * day. Read once per build; undefined when GitHub can't be reached (the page is then left out).
 */
import { SITE_REPO } from "./repo-stars.ts";

const DAY = 86_400_000;
/** Days of history for the chart; the repo is younger than this, so it starts at the first commit. */
const SPAN = 30;

type ApiCommit = {
  sha: string;
  html_url: string;
  parents: unknown[];
  author: { login: string } | null;
  commit: { message: string; author: { date: string } };
};

export type SiteDay = {
  date: string;
  /** Hand-made commits (no merges, no bots' data refreshes), newest first. */
  commits: { sha: string; title: string; url: string }[];
  merged: number;
  /** Stars given that day and the total at its end (undefined if GitHub didn't say when stars were given). */
  starsGained?: number;
  stars?: number;
};
export type SiteRepo = { repo: string; stars: number; days: SiteDay[] };

async function api<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: { Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const isMerge = (c: ApiCommit) => c.parents.length > 1;
/** The bots' snapshot refreshes and discovery proposals aren't news. */
const isData = (c: ApiCommit) => c.commit.message.startsWith("data:") || (c.author?.login ?? "").endsWith("[bot]");

async function load(): Promise<SiteRepo> {
  const now = Date.now();
  const repo = await api<{ stargazers_count: number }>(`repos/${SITE_REPO}`);
  const all: ApiCommit[] = [];
  const since = new Date(now - SPAN * DAY).toISOString().slice(0, 10);
  for (let page = 1; page <= 20; page++) {
    const batch = await api<ApiCommit[]>(`repos/${SITE_REPO}/commits?since=${since}T00:00:00Z&per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  // When each star was given: only the repo's own token can list these, so it may be missing.
  let starredAt: string[] | undefined = [];
  try {
    for (let page = 1; page <= 10; page++) {
      const batch = await api<{ starred_at: string }[]>(`repos/${SITE_REPO}/stargazers?per_page=100&page=${page}`, "application/vnd.github.star+json");
      starredAt.push(...batch.map((s) => s.starred_at.slice(0, 10)));
      if (batch.length < 100) break;
    }
  } catch {
    starredAt = undefined;
  }

  const day = (c: ApiCommit) => c.commit.author.date.slice(0, 10);
  const first = all.map(day).sort()[0] ?? since;
  const days: SiteDay[] = [];
  for (let t = Date.parse(first); t <= now; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const today = all.filter((c) => day(c) === date);
    days.push({
      date,
      commits: today.filter((c) => !isMerge(c) && !isData(c)).map((c) => ({ sha: c.sha.slice(0, 7), title: c.commit.message.split("\n")[0]!, url: c.html_url })),
      merged: today.filter(isMerge).length,
      starsGained: starredAt?.filter((d) => d === date).length,
      stars: starredAt?.filter((d) => d <= date).length,
    });
  }
  return { repo: SITE_REPO, stars: repo.stargazers_count, days };
}

export const siteRepo: SiteRepo | undefined = await load().catch((e) => {
  console.warn(`site repo stats: ${e instanceof Error ? e.message : e}`);
  return undefined;
});
