/** Weekly highlights for the front-page carousel. Everything is computed at build time. */
import { loadStarHistory } from "../../data/load.ts";
import { games, PLATFORMS, platformLogo, tools, type Entry, type Logo, type PlatformId } from "./data.ts";

const DAY = 86_400_000;
const now = Date.now();
const weekAgo = now - 7 * DAY;

export type Riser = { entry: Entry; value: string; detail: string };

/**
 * Stars gained over the last week, from the daily counts fetch.ts records in data/stars.json.
 * Until there are a few days of history, rank young repos by stars per day since creation instead.
 */
function risers(): { title: string; note: string; items: Riser[] } {
  const all = [...games, ...tools];
  const history = loadStarHistory();
  const dates = Object.keys(history).sort();
  const target = new Date(weekAgo).toISOString().slice(0, 10);
  const base = dates.filter((d) => d <= target).at(-1) ?? dates[0];
  const spanDays = base ? Math.round((now - Date.parse(base)) / DAY) : 0;

  if (base && spanDays >= 3) {
    const items = all
      .map((entry) => ({ entry, delta: (entry.snap?.stars ?? 0) - (history[base]?.[entry.repo] ?? entry.snap?.stars ?? 0) }))
      .filter((r) => r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5)
      .map(({ entry, delta }) => ({ entry, value: `+${delta.toLocaleString("en")}`, detail: `★ ${entry.snap!.stars.toLocaleString("en")}` }));
    return { title: "Rising this week", note: spanDays >= 7 ? "most stars gained in 7 days" : `most stars gained in ${spanDays} days`, items };
  }

  const items = all
    .filter((e) => e.snap && now - Date.parse(e.snap.createdAt) < 120 * DAY)
    .map((entry) => {
      const days = Math.max(1, (now - Date.parse(entry.snap!.createdAt)) / DAY);
      return { entry, perDay: entry.snap!.stars / days };
    })
    .sort((a, b) => b.perDay - a.perDay)
    .slice(0, 5)
    .map(({ entry, perDay }) => ({
      entry,
      value: `${Math.round(perDay).toLocaleString("en")}/day`,
      detail: `★ ${entry.snap!.stars.toLocaleString("en")}`,
    }));
  return { title: "Fastest rising", note: "stars per day since the repo was created", items };
}

function newReleases(): { title: string; note: string; items: Entry[] } {
  const since = (days: number) => games.filter((g) => g.firstReleaseAt && Date.parse(g.firstReleaseAt) >= now - days * DAY);
  let days = 7;
  let list = since(days);
  if (list.length < 3) list = since((days = 14));
  return {
    title: days === 7 ? "New this week" : "New in the last two weeks",
    note: "first playable release",
    items: list.sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!)).slice(0, 5),
  };
}

export type PlatformOfWeek = {
  id: PlatformId;
  name: string;
  logo: Logo | undefined;
  releases: number;
  projects: number;
  top: { entry: Entry; releases: number }[];
  /** Weeks this platform has been #1 (over the release history we have), and its current run. */
  weeksOnTop: number;
  streak: number;
};

type WeekResult = { id: PlatformId; list: { entry: Entry; releases: number }[]; releases: number };

/** The platform whose projects shipped the most releases in [start, end); ties go to more projects. */
function winner(start: number, end: number): WeekResult | undefined {
  const perGame = games
    .map((entry) => ({
      entry,
      releases: (entry.snap?.releaseDates ?? []).filter((r) => {
        const t = Date.parse(r.date);
        return t >= start && t < end;
      }).length,
    }))
    .filter((g) => g.releases > 0);
  const byPlatform = new Map<PlatformId, typeof perGame>();
  for (const g of perGame) byPlatform.set(g.entry.platform, [...(byPlatform.get(g.entry.platform) ?? []), g]);
  const sum = (l: typeof perGame) => l.reduce((n, g) => n + g.releases, 0);
  const best = [...byPlatform.entries()].sort((a, b) => sum(b[1]) - sum(a[1]) || b[1].length - a[1].length)[0];
  return best && { id: best[0], list: best[1], releases: sum(best[1]) };
}

/**
 * The original platform whose projects shipped the most releases in the last 7 days, plus how often
 * it has won before. Past weeks are recomputed from today's list, so projects added later count too.
 */
function platformOfWeek(): PlatformOfWeek | undefined {
  const current = winner(weekAgo, now);
  if (!current) return undefined;
  const HISTORY_WEEKS = 104;
  let weeksOnTop = 0;
  let streak = 0;
  let unbroken = true;
  for (let k = 0; k < HISTORY_WEEKS; k++) {
    const w = winner(now - (k + 1) * 7 * DAY, now - k * 7 * DAY);
    const won = w?.id === current.id;
    if (won) weeksOnTop++;
    if (unbroken && won) streak++;
    else unbroken = false;
  }
  return {
    id: current.id,
    name: PLATFORMS[current.id],
    logo: platformLogo(current.id),
    releases: current.releases,
    projects: current.list.length,
    top: current.list.sort((a, b) => b.releases - a.releases).slice(0, 4),
    weeksOnTop,
    streak,
  };
}

export const highlights = { risers: risers(), fresh: newReleases(), platform: platformOfWeek() };
