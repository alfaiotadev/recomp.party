/** Front-page stat tiles: headline numbers, a comparison line and 12-week bar series. */
import { available, platformsInUse } from "./data.ts";

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


export const stats = {
  projects: {
    value: games.length,
    /** The project whose first release is the most recent. */
    newest: games.filter((g) => g.firstReleaseAt).sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!))[0],
  },
  platforms: { value: platformsInUse.length, ids: platformsInUse },
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
