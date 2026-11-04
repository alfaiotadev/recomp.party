/**
 * This site's own GitHub repo, for the carousel's "vitals" page: commits, merged pull requests and stars per
 * day. Read once per build; undefined when GitHub can't be reached (the page is then left out).
 */
import { loadStarHistory, SITE_REPO } from "../../data/load.ts";

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
  // The star total per day from the daily counts in data/stars.json (GitHub only tells the repo's owner
  // when each star was given); today's comes live.
  const history = loadStarHistory();
  const recorded = Object.keys(history)
    .filter((d) => history[d]![SITE_REPO] !== undefined)
    .sort();
  const starsOn = (date: string, isToday: boolean) => {
    if (isToday) return repo.stargazers_count;
    const at = recorded.filter((d) => d <= date).at(-1);
    return at ? history[at]![SITE_REPO] : recorded.length ? 0 : undefined;
  };

  const day = (c: ApiCommit) => c.commit.author.date.slice(0, 10);
  const first = all.map(day).sort()[0] ?? since;
  const days: SiteDay[] = [];
  const todayDate = new Date(now).toISOString().slice(0, 10);
  for (let t = Date.parse(first); t <= now; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const stars = starsOn(date, date === todayDate);
    const before = days.at(-1)?.stars;
    const today = all.filter((c) => day(c) === date);
    days.push({
      date,
      commits: today.filter((c) => !isMerge(c) && !isData(c)).map((c) => ({ sha: c.sha.slice(0, 7), title: c.commit.message.split("\n")[0]!, url: c.html_url })),
      merged: today.filter(isMerge).length,
      starsGained: stars !== undefined ? Math.max(0, stars - (before ?? 0)) : undefined,
      stars,
    });
  }
  return { repo: SITE_REPO, stars: repo.stargazers_count, days };
}

export const siteRepo: SiteRepo | undefined = await load().catch((e) => {
  console.warn(`site repo stats: ${e instanceof Error ? e.message : e}`);
  return undefined;
});
