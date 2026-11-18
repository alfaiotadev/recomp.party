/** Front-page stat tiles: headline numbers, a comparison line and 12-week bar series. */
import { available, countGames, gameKey, games as listed, platformsInUse, type Entry } from "./data.ts";

/** Gone repos are left out: the numbers are about what you can get today. */
const games = available;

const DAY = 86_400_000;
const now = Date.now();
const WEEKS = 12;

/** Week k as the 168 hours ending k weeks before the build (0 = the last 7 days). */
const week = (k: number): [number, number] => [now - (k + 1) * 7 * DAY, now - k * 7 * DAY];
const within = (iso: string | undefined, [a, b]: [number, number]) => !!iso && Date.parse(iso) >= a && Date.parse(iso) < b;

/** Oldest week first, so the bars read left → right towards "now". */
const series = (f: (range: [number, number]) => number) =>
  Array.from({ length: WEEKS }, (_, i) => f(week(WEEKS - 1 - i)));

const newGamesIn = (range: [number, number]) => games.filter((g) => within(g.firstReleaseAt, range));
const newIn = (range: [number, number]) => newGamesIn(range).length;
const updatedIn = (range: [number, number]) =>
  games.filter((g) => (g.snap?.releaseDates ?? []).some((r) => within(r.date, range))).length;

/** Releases per 24 hours over the last 7 days, oldest first (the last entry is the latest 24 hours). */
function lastDays() {
  const dates = games.flatMap((g) => (g.snap?.releaseDates ?? []).map((r) => Date.parse(r.date)));
  const days = Array.from({ length: 7 }, (_, i) => {
    const end = now - (6 - i) * DAY;
    return dates.filter((t) => t >= end - DAY && t < end).length;
  });
  return { days, total: days.reduce((a, b) => a + b, 0) };
}

export type Delta = { now: number; before: number; diff: number };
const delta = (a: number, b: number): Delta => ({ now: a, before: b, diff: a - b });


/** Projects grouped by game, the game's first playable release first. */
const byGame = new Map<string, Entry[]>();
for (const g of games) byGame.set(gameKey(g), [...(byGame.get(gameKey(g)) ?? []), g]);
const gameFirst = [...byGame.values()].map((list) => list.map((e) => e.firstReleaseAt).filter(Boolean).sort()[0]);
const newGamesWeek = (range: [number, number]) => gameFirst.filter((d) => within(d, range)).length;

/**
 * Different games coming onto the list and leaving it, per calendar day (UTC) over the last 7 days, oldest first.
 * A game comes on the day its first project was added, and leaves on the day its last available project went
 * missing from GitHub (a confirmed move keeps it).
 */
function gameDays() {
  const all = new Map<string, Entry[]>();
  for (const g of listed) all.set(gameKey(g), [...(all.get(gameKey(g)) ?? []), g]);
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const keys = Array.from({ length: 7 }, (_, i) => day(now - (6 - i) * DAY));
  const plus = new Map<string, number>();
  const minus = new Map<string, number>();
  for (const list of all.values()) {
    const on = list.map((e) => e.added).sort()[0]!;
    plus.set(on, (plus.get(on) ?? 0) + 1);
    if (list.every((e) => e.gone && !e.moved_to)) {
      const off = list.map((e) => e.gone!.since.slice(0, 10)).sort().at(-1)!;
      minus.set(off, (minus.get(off) ?? 0) + 1);
    }
  }
  const days = keys.map((d) => ({ date: d, plus: plus.get(d) ?? 0, minus: minus.get(d) ?? 0 }));
  return { days, net: days.reduce((s, d) => s + d.plus - d.minus, 0) };
}

export const stats = {
  projects: {
    value: games.length,
    /** Different games among them: several projects can port the same game. */
    games: countGames(games),
    /** The project whose first release is the most recent. */
    newest: games.filter((g) => g.firstReleaseAt).sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!))[0],
  },
  platforms: { value: platformsInUse.length, ids: platformsInUse },
  games: {
    value: byGame.size,
    week: delta(newGamesWeek(week(0)), newGamesWeek(week(1))),
    bars: series(newGamesWeek),
    barsLabel: "Games playable for the first time per 7 days, last 12 weeks",
    days: gameDays(),
    /** Games with more than one project. */
    multi: [...byGame.values()].filter((l) => l.length > 1).length,
    /** The games with the most projects; each shown by its most-starred project. */
    most: [...byGame.values()]
      .filter((l) => l.length > 1)
      .sort((a, b) => b.length - a.length || (b[0]!.firstReleaseAt ?? "").localeCompare(a[0]!.firstReleaseAt ?? ""))
      .slice(0, 3)
      .map((l) => ({ n: l.length, entry: [...l].sort((a, b) => (b.snap?.stars ?? 0) - (a.snap?.stars ?? 0))[0]! })),
  },
  fresh: {
    value: newIn(week(0)),
    /** This week's new projects, newest first. */
    entries: newGamesIn(week(0)).sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!)),
    week: delta(newIn(week(0)), newIn(week(1))),
    bars: series(newIn),
    barsLabel: "New projects per 7 days, last 12 weeks",
  },
  updated: {
    value: updatedIn(week(0)),
    week: delta(updatedIn(week(0)), updatedIn(week(1))),
    bars: series(updatedIn),
    barsLabel: "Projects with a release per 7 days, last 12 weeks",
    days: lastDays(),
  },
};
