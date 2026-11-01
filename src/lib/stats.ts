/** Front-page stat tiles: headline numbers, a comparison line and 12-week bar series. */
import { games, platformsInUse } from "./data.ts";

const DAY = 86_400_000;
const now = Date.now();
const WEEKS = 12;

/** Week k (0 = the last 7 days) as a [start, end) time range. */
const week = (k: number): [number, number] => [now - (k + 1) * 7 * DAY, now - k * 7 * DAY];
const within = (iso: string | undefined, [a, b]: [number, number]) => !!iso && Date.parse(iso) >= a && Date.parse(iso) < b;

/** Oldest week first, so the bars read left → right towards "now". */
const series = (f: (range: [number, number]) => number) =>
  Array.from({ length: WEEKS }, (_, i) => f(week(WEEKS - 1 - i)));

const newGamesIn = (range: [number, number]) => games.filter((g) => within(g.firstReleaseAt, range));
const newIn = (range: [number, number]) => newGamesIn(range).length;
const updatedIn = (range: [number, number]) =>
  games.filter((g) => (g.snap?.releaseDates ?? []).some((r) => within(r.date, range))).length;

/** The calendar week (ISO, UTC) so far: releases per day Mon–Sun, null for days still to come. */
function calendarWeek() {
  const d = new Date(now);
  const today = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today * DAY;
  const thursday = new Date(monday + 3 * DAY); // ISO weeks belong to the year of their Thursday
  const number = Math.floor((thursday.getTime() - Date.UTC(thursday.getUTCFullYear(), 0, 1)) / DAY / 7) + 1;
  const dates = games.flatMap((g) => (g.snap?.releaseDates ?? []).map((r) => Date.parse(r.date)));
  const days = Array.from({ length: 7 }, (_, i) =>
    i > today ? null : dates.filter((t) => t >= monday + i * DAY && t < monday + (i + 1) * DAY).length,
  );
  return { number, today, days, total: days.reduce<number>((a, b) => a + (b ?? 0), 0) };
}

export type Delta = { now: number; before: number; diff: number };
const delta = (a: number, b: number): Delta => ({ now: a, before: b, diff: a - b });


export const stats = {
  projects: {
    value: games.length,
    /** The project whose first release is the most recent. */
    newest: games.filter((g) => g.firstReleaseAt).sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!))[0],
    bars: series(([, end]) => games.filter((g) => g.firstReleaseAt && Date.parse(g.firstReleaseAt) < end).length),
    barsLabel: "Playable projects over the last 12 weeks",
  },
  platforms: { value: platformsInUse.length, ids: platformsInUse },
  fresh: {
    value: newIn(week(0)),
    /** This week's new projects, newest first. */
    entries: newGamesIn(week(0)).sort((a, b) => b.firstReleaseAt!.localeCompare(a.firstReleaseAt!)),
    week: delta(newIn(week(0)), newIn(week(1))),
    bars: series(newIn),
    barsLabel: "New projects per week, last 12 weeks",
  },
  updated: {
    value: updatedIn(week(0)),
    week: delta(updatedIn(week(0)), updatedIn(week(1))),
    bars: series(updatedIn),
    barsLabel: "Projects with a release per week, last 12 weeks",
    calendar: calendarWeek(),
  },
};
