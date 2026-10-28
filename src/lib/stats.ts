/** Front-page stat tiles: headline numbers, a comparison line and 12-week bar series. */
import { ago, games, platformsInUse } from "./data.ts";

const DAY = 86_400_000;
const now = Date.now();
const WEEKS = 12;

/** Week k (0 = the last 7 days) as a [start, end) time range. */
const week = (k: number): [number, number] => [now - (k + 1) * 7 * DAY, now - k * 7 * DAY];
const within = (iso: string | undefined, [a, b]: [number, number]) => !!iso && Date.parse(iso) >= a && Date.parse(iso) < b;

/** Oldest week first, so the bars read left → right towards "now". */
const series = (f: (range: [number, number]) => number) =>
  Array.from({ length: WEEKS }, (_, i) => f(week(WEEKS - 1 - i)));

const newIn = (range: [number, number]) => games.filter((g) => within(g.firstReleaseAt, range)).length;
const updatedIn = (range: [number, number]) =>
  games.filter((g) => (g.snap?.releaseDates ?? []).some((r) => within(r.date, range))).length;

export type Delta = { now: number; before: number; diff: number };
const delta = (a: number, b: number): Delta => ({ now: a, before: b, diff: a - b });

const newest = games.map((g) => g.firstReleaseAt).filter(Boolean).sort().at(-1);

export const stats = {
  projects: {
    value: games.length,
    note: `newest first release ${ago(newest)}`,
    bars: series(([, end]) => games.filter((g) => g.firstReleaseAt && Date.parse(g.firstReleaseAt) < end).length),
    barsLabel: "Playable projects over the last 12 weeks",
  },
  platforms: { value: platformsInUse.length, ids: platformsInUse },
  fresh: {
    value: newIn(week(0)),
    week: delta(newIn(week(0)), newIn(week(1))),
    bars: series(newIn),
    barsLabel: "New projects per week, last 12 weeks",
  },
  updated: {
    value: updatedIn(week(0)),
    week: delta(updatedIn(week(0)), updatedIn(week(1))),
    bars: series(updatedIn),
    barsLabel: "Projects with a release per week, last 12 weeks",
  },
};
