/** Weekly highlights for the front-page carousel. Everything is computed at build time. */
import { loadStarHistory } from "../../data/load.ts";
import { games, PLATFORMS, platformLogo, type Entry, type Logo, type PlatformId } from "./data.ts";

const DAY = 86_400_000;
const now = Date.now();
const weekAgo = now - 7 * DAY;

/** `value` is the headline (stars gained), `growth` the gain relative to the star count at the start. */
export type Riser = { entry: Entry; value: string; stars: number; growth?: string };

/** Stars gained by all games between consecutive days of data/stars.json; only repos present on both days count. */
export type StarDay = { date: string; gained: number };
function starTrend(): StarDay[] {
  const history = loadStarHistory();
  const dates = Object.keys(history).sort();
  const repos = games.map((g) => g.repo);
  return dates.slice(1).map((date, i) => {
    const before = history[dates[i]!]!;
    const after = history[date]!;
    const gained = repos.reduce((n, r) => (before[r] !== undefined && after[r] !== undefined ? n + after[r] - before[r] : n), 0);
    return { date, gained };
  });
}

/**
 * Stars gained over the last week, from the daily counts fetch.ts records in data/stars.json
 * (GitHub no longer lists stargazers, so there is no way to backfill). With less than a week of
 * history the available span is used and labelled; with a single day, young repos are ranked by
 * stars per day since creation instead.
 */
function risers(): { title: string; note: string; items: Riser[] } {
  const all = games; // toolchains have their own page and the "Under the hood" section
  const history = loadStarHistory();
  const dates = Object.keys(history).sort();
  const target = new Date(weekAgo).toISOString().slice(0, 10);
  const base = dates.filter((d) => d <= target).at(-1) ?? dates[0];
  const spanDays = base ? Math.round((now - Date.parse(base)) / DAY) : 0;

  if (base && spanDays >= 1) {
    const span = spanDays >= 7 ? "7 days" : spanDays === 1 ? "1 day" : `${spanDays} days`;
    const pct = (gain: number, before: number) => {
      const p = (gain / Math.max(1, before)) * 100;
      return p >= 10 ? Math.round(p).toString() : p.toFixed(1);
    };
    const items = all
      .map((entry) => {
        const before = history[base]?.[entry.repo];
        return { entry, before, delta: before === undefined ? 0 : (entry.snap?.stars ?? 0) - before };
      })
      .filter((r) => r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5)
      .map(({ entry, delta, before }) => ({
        entry,
        value: `+${delta.toLocaleString("en")}`,
        stars: entry.snap!.stars,
        growth: `▲ ${pct(delta, before!)}% in ${span}`,
      }));
    if (items.length) return { title: "Rising stars", note: `stars gained in the last ${span}`, items };
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
      stars: entry.snap!.stars,
    }));
  return { title: "Rising stars", note: "stars per day since the repo was created", items };
}

function newReleases(): { title: string; note: string; items: Entry[]; rest: Entry[] } {
  const since = (days: number) => games.filter((g) => g.firstReleaseAt && Date.parse(g.firstReleaseAt) >= now - days * DAY);
  let days = 7;
  let list = since(days);
  if (list.length < 3) list = since((days = 14));
  const sorted = list.sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!));
  return {
    title: days === 7 ? "New this week" : "New in the last two weeks",
    note: "first playable release",
    items: sorted.slice(0, 5),
    /** Earlier releases in the same window that don't fit on the cards. */
    rest: sorted.slice(5),
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
  /** This week's top platforms by release count, the winner first. */
  ranking: { id: PlatformId; name: string; logo: Logo | undefined; releases: number }[];
};

type Ranked = { id: PlatformId; list: { entry: Entry; releases: number }[]; releases: number };
type WeekResult = Ranked & { ranked: Ranked[] };

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
  const ranked = [...byPlatform.entries()]
    .sort((a, b) => sum(b[1]) - sum(a[1]) || b[1].length - a[1].length)
    .map(([id, list]) => ({ id, list, releases: sum(list) }));
  return ranked[0] && { ...ranked[0], ranked };
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
    ranking: current.ranked.slice(0, 5).map((r) => ({ id: r.id, name: PLATFORMS[r.id], logo: platformLogo(r.id), releases: r.releases })),
  };
}

export type MostRecompiled = {
  title: string;
  count: number;
  recomps: number;
  ports: number;
  kind: Entry["kind"] | "mixed";
  platforms: { id: PlatformId; name: string; logo: Logo | undefined }[];
  cover?: Entry["cover"];
  /** Front-page game list filtered to this game. */
  href: string;
};

/** Games with the most projects (recomps and ports, any platform); ties go to the one with more stars. */
function mostRecompiled(): MostRecompiled[] {
  const byGame = new Map<string, Entry[]>();
  for (const g of games) {
    const key = g.wikidata ?? g.game.replace(/\s*\(.*\)$/, "").toLowerCase();
    byGame.set(key, [...(byGame.get(key) ?? []), g]);
  }
  const stars = (list: Entry[]) => list.reduce((n, e) => n + (e.snap?.stars ?? 0), 0);
  return [...byGame.values()]
    .filter((list) => list.length > 1)
    .sort((a, b) => b.length - a.length || stars(b) - stars(a))
    .slice(0, 5)
    .map((list) => {
      const title = list[0]!.meta?.title ?? list.map((e) => e.game.replace(/\s*\(.*\)$/, "")).sort((a, b) => a.length - b.length)[0]!;
      const recomps = list.filter((e) => e.kind === "recomp").length;
      const kinds = new Set(list.map((e) => e.kind));
      const platforms = [...new Set(list.map((e) => e.platform))].map((id) => ({ id, name: PLATFORMS[id], logo: platformLogo(id) }));
      const search = list[0]!.game.replace(/\s*\(.*\)$/, "");
      return {
        title,
        count: list.length,
        recomps,
        ports: list.length - recomps,
        kind: kinds.size === 1 ? list[0]!.kind : "mixed",
        platforms,
        cover: list.find((e) => e.cover)?.cover,
        href: `/?q=${encodeURIComponent(search)}#all-games`,
      };
    });
}

export const highlights = { risers: risers(), starTrend: starTrend(), fresh: newReleases(), platform: platformOfWeek(), most: mostRecompiled() };
