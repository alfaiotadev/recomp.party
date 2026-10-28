import { entryPath, PLATFORMS, platformsInUse, type Entry } from "./data.ts";

/** Layout for the swimlane timeline: one lane per source platform, one row per project. */

export const W = 1000;
const LABEL_W = 128;
const PAD_R = 12;
const ROW_H = 18;
const LANE_PAD = 6;
const MIN_LANE_H = 42; // room for the lane name + project count
export const AXIS_H = 22;
const CHAR_W = 6.1; // rough width of one 11px character, for label placement

export type TimelineView = { id: string; label: string; start: number; end: number; ticks: "month" | "year" };

export type Row = {
  entry: Entry;
  href: string;
  y: number;
  x1: number;
  x2: number;
  clipped: boolean;
  dots: { x: number; prerelease: boolean; date: string }[];
  label: { x: number; anchor: "start" | "end" };
};

export type Lane = { id: string; name: string; y: number; height: number; rows: Row[] };

export type Layout = {
  view: TimelineView;
  lanes: Lane[];
  ticks: { x: number; label: string; major: boolean }[];
  nowX: number;
  height: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function views(now = Date.now()): TimelineView[] {
  const d = new Date(now);
  const monthsBack = (n: number) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1);
  // A little headroom on the right so the newest dots don't sit on the edge.
  const end = (start: number) => now + (now - start) * 0.03;
  return [
    { id: "3m", label: "Last 3 months", start: monthsBack(2), end: end(monthsBack(2)), ticks: "month" },
    { id: "1y", label: "Last year", start: monthsBack(11), end: end(monthsBack(11)), ticks: "month" },
    { id: "all", label: "All time", start: Date.UTC(2021, 0, 1), end: end(Date.UTC(2021, 0, 1)), ticks: "year" },
  ];
}

function ticksFor(view: TimelineView, x: (t: number) => number): Layout["ticks"] {
  const out: Layout["ticks"] = [];
  const s = new Date(view.start);
  let y = s.getUTCFullYear();
  let m = view.ticks === "year" ? 0 : s.getUTCMonth();
  if (view.ticks === "year" && Date.UTC(y, 0, 1) < view.start) y++;
  for (;;) {
    const t = Date.UTC(y, m, 1);
    if (t > view.end) break;
    if (t >= view.start) {
      const major = m === 0;
      out.push({ x: x(t), label: view.ticks === "year" ? String(y) : major ? `${MONTHS[m]} ${y}` : MONTHS[m], major });
    }
    if (view.ticks === "year") y++;
    else if (++m === 12) (m = 0), y++;
  }
  return out;
}

export function layout(games: Entry[], view: TimelineView, now = Date.now()): Layout {
  const plotL = LABEL_W;
  const plotR = W - PAD_R;
  const x = (t: number) => plotL + ((t - view.start) / (view.end - view.start)) * (plotR - plotL);

  const lanes: Lane[] = [];
  let y = AXIS_H;
  for (const id of platformsInUse) {
    const entries = games
      .filter((g) => g.platform === id && g.latestReleaseAt && Date.parse(g.latestReleaseAt) >= view.start)
      .sort((a, b) => a.firstReleaseAt!.localeCompare(b.firstReleaseAt!));
    if (!entries.length) continue;

    const laneY = y;
    y += LANE_PAD;
    const rows: Row[] = entries.map((entry) => {
      const first = Date.parse(entry.firstReleaseAt!);
      const x1 = x(Math.max(first, view.start));
      const x2 = x(Date.parse(entry.latestReleaseAt!));
      const textW = entry.game.length * CHAR_W;
      // Beside the bar if there's room (right, then left); otherwise on top of the bar with a halo.
      const label: Row["label"] =
        x2 + 7 + textW <= plotR
          ? { x: x2 + 7, anchor: "start" }
          : x1 - 7 - textW >= plotL
            ? { x: x1 - 7, anchor: "end" }
            : { x: x1 + 12, anchor: "start" };
      const row: Row = {
        entry,
        href: entryPath(entry),
        y: y + ROW_H / 2,
        x1,
        x2,
        clipped: first < view.start,
        dots: (entry.snap?.releaseDates ?? [])
          .filter((r) => Date.parse(r.date) >= view.start)
          .map((r) => ({ x: x(Date.parse(r.date)), prerelease: r.prerelease, date: r.date })),
        label,
      };
      y += ROW_H;
      return row;
    });
    y = Math.max(y + LANE_PAD, laneY + MIN_LANE_H);
    lanes.push({ id, name: PLATFORMS[id], y: laneY, height: y - laneY, rows });
  }

  return { view, lanes, ticks: ticksFor(view, x), nowX: x(now), height: y + 4 };
}
