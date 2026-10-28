import { entryPath, fitLogo, PLATFORMS, platformLogo, platformsInUse, type Entry } from "./data.ts";

/**
 * Layout for the swimlane timeline: one lane per source platform, one row per project.
 * Columns: platform logo | game name (left-aligned) | time axis.
 */

export const W = 1140;
const LABEL_W = 132;
export const NAME_X = LABEL_W + 4;
export const NAME_W = 236;
const MAX_CHARS = Math.floor((NAME_W - 14) / 6.1); // ~6.1 px per 11px character
const PAD_R = 12;
const ROW_H = 18;
const LANE_PAD = 6;
const MIN_LANE_H = 58; // room for the platform logo + project count
export const AXIS_H = 30; // also hosts the sort control above the name column

/** Row orders within a lane. Lanes themselves stay grouped by platform. */
export const SORTS = [
  { id: "first", label: "First release" },
  { id: "latest", label: "Latest release" },
  { id: "name", label: "Name" },
  { id: "stars", label: "Stars" },
  { id: "releases", label: "Most releases" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

const COMPARE: Record<SortId, (a: Entry, b: Entry) => number> = {
  first: (a, b) => a.firstReleaseAt!.localeCompare(b.firstReleaseAt!),
  latest: (a, b) => b.latestReleaseAt!.localeCompare(a.latestReleaseAt!),
  name: (a, b) => a.game.localeCompare(b.game, "en", { sensitivity: "base" }),
  stars: (a, b) => (b.snap?.stars ?? 0) - (a.snap?.stars ?? 0),
  releases: (a, b) => (b.snap?.releaseCount ?? 0) - (a.snap?.releaseCount ?? 0),
};

export type TimelineView = { id: string; label: string; start: number; end: number; ticks: "month" | "year" };

export type Row = {
  entry: Entry;
  href: string;
  y: number;
  x1: number;
  x2: number;
  clipped: boolean;
  dots: { x: number; prerelease: boolean; date: string }[];
  name: string;
  truncated: boolean;
  /** Row centre (y) for each sort order; the default order is `first`. */
  slots: Record<SortId, number>;
  /** Position of the row within its lane for each sort order (mobile layout uses CSS `order`). */
  ranks: Record<SortId, number>;
  /** Bar and dots as percentages of the time axis (mobile layout). */
  pct: { x1: number; x2: number; dots: { x: number; prerelease: boolean }[] };
  /** Faint leader from the end of the name to the start of the bar, if there's a gap. */
  guide: { x1: number; x2: number } | null;
};

export type Lane = {
  id: string;
  name: string;
  logo: { src: string; w: number; h: number } | undefined;
  y: number;
  height: number;
  rows: Row[];
};

export type Layout = {
  view: TimelineView;
  lanes: Lane[];
  ticks: { x: number; label: string; major: boolean }[];
  nowX: number;
  height: number;
  mobile: { ticks: { p: number; label: string; major: boolean }[]; now: number };
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
  const plotL = NAME_X + NAME_W;
  const plotR = W - PAD_R;
  const x = (t: number) => plotL + ((t - view.start) / (view.end - view.start)) * (plotR - plotL);
  const pct = (px: number) => +(((px - plotL) / (plotR - plotL)) * 100).toFixed(2);

  const lanes: Lane[] = [];
  let y = AXIS_H;
  for (const id of platformsInUse) {
    const entries = games
      .filter((g) => g.platform === id && g.latestReleaseAt && Date.parse(g.latestReleaseAt) >= view.start)
      .sort(COMPARE.first);
    if (!entries.length) continue;

    const laneY = y;
    y += LANE_PAD;
    const rows: Row[] = entries.map((entry) => {
      const first = Date.parse(entry.firstReleaseAt!);
      const x1 = x(Math.max(first, view.start));
      const x2 = x(Date.parse(entry.latestReleaseAt!));
      const short = entry.game.replace(/^The Legend of Zelda: /, "Zelda: ");
      const name = short.length > MAX_CHARS ? `${short.slice(0, MAX_CHARS - 1).trimEnd()}…` : short;
      const row: Row = {
        entry,
        href: entryPath(entry),
        y: y + ROW_H / 2,
        slots: {} as Row["slots"],
        ranks: {} as Row["ranks"],
        pct: {
          x1: pct(x(Math.max(first, view.start))),
          x2: pct(x(Date.parse(entry.latestReleaseAt!))),
          dots: (entry.snap?.releaseDates ?? [])
            .filter((r) => Date.parse(r.date) >= view.start)
            .map((r) => ({ x: pct(x(Date.parse(r.date))), prerelease: r.prerelease })),
        },
        x1,
        x2,
        clipped: first < view.start,
        dots: (entry.snap?.releaseDates ?? [])
          .filter((r) => Date.parse(r.date) >= view.start)
          .map((r) => ({ x: x(Date.parse(r.date)), prerelease: r.prerelease, date: r.date })),
        name,
        truncated: name !== entry.game,
        guide: x1 - 6 - (NAME_X + name.length * 6.1 + 8) > 10 ? { x1: NAME_X + name.length * 6.1 + 8, x2: x1 - 6 } : null,
      };
      y += ROW_H;
      return row;
    });
    const slotYs = rows.map((r) => r.y);
    for (const { id: sort } of SORTS) {
      [...rows].sort((a, b) => COMPARE[sort](a.entry, b.entry) || COMPARE.first(a.entry, b.entry)).forEach((r, k) => {
        r.slots[sort] = slotYs[k]!;
        r.ranks[sort] = k;
      });
    }
    y = Math.max(y + LANE_PAD, laneY + MIN_LANE_H);
    const logo = platformLogo(id);
    lanes.push({ id, name: PLATFORMS[id], logo: logo && { src: logo.src, ...fitLogo(logo, 96, 24) }, y: laneY, height: y - laneY, rows });
  }

  const ticks = ticksFor(view, x);
  return {
    view,
    lanes,
    ticks,
    nowX: x(now),
    height: y + 4,
    mobile: { ticks: ticks.map((t) => ({ ...t, p: pct(t.x) })), now: pct(x(now)) },
  };
}
