import { entryPath, fitLogo, PLATFORMS, platformLogo, platformsInUse, type Entry } from "./data.ts";
import { AXIS_H, place, type PlaceLane, type Placement, type Ranks } from "./timeline-place.ts";

export { AXIS_H };

/**
 * Layout for the swimlane timeline: one lane per source platform, one row per project.
 * Columns: platform logo | game name (left-aligned) | time axis.
 */

export const W = 1140;
const LABEL_W = 132;
export const NAME_X = LABEL_W + 4;
export const NAME_W = 236;
const CHAR_W = 6.1; // ~6.1 px per 11px character
const MAX_CHARS = Math.floor((NAME_W - 14) / CHAR_W);
const PAD_R = 12;
/** Child rows (a group's projects) are indented under the group's name. */
export const CHILD_INDENT = 12;

/** Row orders within a lane. Lanes themselves stay grouped by platform. */
export const SORTS = [
  { id: "first", label: "First release" },
  { id: "latest", label: "Latest release" },
  { id: "name", label: "Name" },
  { id: "stars", label: "Stars" },
  { id: "releases", label: "Most releases" },
] as const;
export type SortId = (typeof SORTS)[number]["id"];

/** What sorting looks at: one project, or a game's projects taken together. */
type Stats = { game: string; first: string; latest: string; stars: number; releases: number };
const stats = (e: Entry): Stats => ({
  game: e.game,
  first: e.firstReleaseAt!,
  latest: e.latestReleaseAt!,
  stars: e.snap?.stars ?? 0,
  releases: e.snap?.releaseCount ?? 0,
});
const COMPARE: Record<SortId, (a: Stats, b: Stats) => number> = {
  first: (a, b) => a.first.localeCompare(b.first),
  latest: (a, b) => b.latest.localeCompare(a.latest),
  name: (a, b) => a.game.localeCompare(b.game, "en", { sensitivity: "base" }),
  stars: (a, b) => b.stars - a.stars,
  releases: (a, b) => b.releases - a.releases,
};
function ranks<T>(list: T[], get: (t: T) => Stats): Map<T, Ranks> {
  const out = new Map<T, Ranks>(list.map((t) => [t, {}]));
  for (const { id } of SORTS) {
    [...list].sort((a, b) => COMPARE[id](get(a), get(b)) || COMPARE.first(get(a), get(b))).forEach((t, k) => (out.get(t)![id] = k));
  }
  return out;
}

export type TimelineView = { id: string; label: string; start: number; end: number; ticks: "month" | "year" };

type Dot = { x: number; prerelease: boolean; date: string; kind: Entry["kind"] };

/** One line of the timeline: a project, or the group row standing for a game's several projects. */
export type Row = {
  id: string;
  /** The project (a group row carries its first project, for colour and links). */
  entry: Entry;
  href: string;
  x1: number;
  x2: number;
  clipped: boolean;
  dots: Dot[];
  name: string;
  truncated: boolean;
  /** Bar and dots as percentages of the time axis (mobile layout). */
  pct: { x1: number; x2: number; dots: { x: number; prerelease: boolean; kind: Entry["kind"] }[] };
  /** Faint leader from the end of the name to the start of the bar, if there's a gap. */
  guide: { x1: number; x2: number } | null;
  ranks: Ranks;
};

/** A lane line: one project, or a game with its projects (`children`) behind a toggle. */
export type Item = {
  row: Row;
  children?: Row[];
  /** Group rows only: the projects' kinds taken together, and their summed facts for the tooltip. */
  group?: { kind: Entry["kind"] | "mixed"; count: number; stars: number; releases: number; first: string; latest: string; cover?: string };
};

export type Lane = {
  id: string;
  name: string;
  logo: { src: string; w: number; h: number } | undefined;
  /** Projects in this lane (a group counts each of its projects). */
  count: number;
  items: Item[];
};

export type Layout = {
  view: TimelineView;
  lanes: Lane[];
  /** Input for `place()`, rendered into the page for the browser to rerun. */
  plan: PlaceLane[];
  /** First paint: default sort, all groups closed. */
  initial: Placement;
  ticks: { x: number; label: string; major: boolean }[];
  nowX: number;
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

/** Projects of the same game on one platform: same Wikidata item, or the same title without "(…)". */
const gameKey = (e: Entry) => e.wikidata ?? e.game.replace(/\s*\(.*\)$/, "").toLowerCase();
const baseTitle = (game: string) => game.replace(/\s*\(.*\)$/, "");
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function layout(games: Entry[], view: TimelineView, now = Date.now()): Layout {
  const plotL = NAME_X + NAME_W;
  const plotR = W - PAD_R;
  const x = (t: number) => plotL + ((t - view.start) / (view.end - view.start)) * (plotR - plotL);
  const pct = (px: number) => +(((px - plotL) / (plotR - plotL)) * 100).toFixed(2);

  /** Bar, dots and name for a span of releases. `nameX` is where the label starts, `nameLen` its length. */
  const track = (firstIso: string, latestIso: string, releases: { date: string; prerelease: boolean; kind: Entry["kind"] }[], nameX: number, nameLen: number) => {
    const first = Date.parse(firstIso);
    const x1 = x(Math.max(first, view.start));
    const x2 = x(Date.parse(latestIso));
    const inView = releases.filter((r) => Date.parse(r.date) >= view.start);
    const nameEnd = nameX + nameLen * CHAR_W + 8;
    return {
      x1,
      x2,
      clipped: first < view.start,
      dots: inView.map((r) => ({ ...r, x: x(Date.parse(r.date)) })),
      pct: { x1: pct(x1), x2: pct(x2), dots: inView.map((r) => ({ x: pct(x(Date.parse(r.date))), prerelease: r.prerelease, kind: r.kind })) },
      guide: x1 - 6 - nameEnd > 10 ? { x1: nameEnd, x2: x1 - 6 } : null,
    };
  };
  const releasesOf = (e: Entry) => (e.snap?.releaseDates ?? []).map((r) => ({ ...r, kind: e.kind }));

  const lanes: Lane[] = [];
  for (const id of platformsInUse) {
    const entries = games.filter((g) => g.platform === id && g.latestReleaseAt && Date.parse(g.latestReleaseAt) >= view.start);
    if (!entries.length) continue;

    const byGame = new Map<string, Entry[]>();
    for (const e of entries) byGame.set(gameKey(e), [...(byGame.get(gameKey(e)) ?? []), e]);

    const projectRow = (entry: Entry, child: boolean): Row => {
      const label = child ? entry.repo : entry.game.replace(/^The Legend of Zelda: /, "Zelda: ");
      const name = clip(label, MAX_CHARS - (child ? 2 : 0));
      return {
        id: entry.repo,
        entry,
        href: entryPath(entry),
        name,
        truncated: name !== label,
        ranks: {},
        ...track(entry.firstReleaseAt!, entry.latestReleaseAt!, releasesOf(entry), NAME_X + (child ? CHILD_INDENT : 0), name.length),
      };
    };

    const items: Item[] = [];
    const itemStats = new Map<Item, Stats>();
    for (const [key, list] of byGame) {
      if (list.length === 1) {
        const item = { row: projectRow(list[0]!, false) };
        items.push(item);
        itemStats.set(item, stats(list[0]!));
        continue;
      }
      const first = list.map((e) => e.firstReleaseAt!).sort()[0]!;
      const latest = list.map((e) => e.latestReleaseAt!).sort().at(-1)!;
      const title = list.map((e) => baseTitle(e.game)).sort((a, b) => a.length - b.length)[0]!.replace(/^The Legend of Zelda: /, "Zelda: ");
      const name = clip(title, MAX_CHARS - 4); // room for the count badge
      const kinds = new Set(list.map((e) => e.kind));
      const children = list.map((e) => projectRow(e, true));
      const childRanks = ranks(list, stats);
      children.forEach((c, k) => (c.ranks = childRanks.get(list[k]!)!));
      const item: Item = {
        row: {
          id: `g:${id}:${key}`,
          entry: list[0]!,
          href: entryPath(list[0]!),
          name,
          truncated: name !== title,
          ranks: {},
          ...track(first, latest, list.flatMap(releasesOf).sort((a, b) => a.date.localeCompare(b.date)), NAME_X, name.length + 4),
        },
        children,
        group: {
          kind: kinds.size === 1 ? list[0]!.kind : "mixed",
          count: list.length,
          stars: list.reduce((n, e) => n + (e.snap?.stars ?? 0), 0),
          releases: list.reduce((n, e) => n + (e.snap?.releaseCount ?? 0), 0),
          first,
          latest,
          cover: list.find((e) => e.cover)?.cover?.src,
        },
      };
      items.push(item);
      itemStats.set(item, { game: title, first, latest, stars: item.group!.stars, releases: item.group!.releases });
    }
    const itemRanks = ranks(items, (it) => itemStats.get(it)!);
    for (const it of items) it.row.ranks = itemRanks.get(it)!;

    const logo = platformLogo(id);
    lanes.push({ id, name: PLATFORMS[id], logo: logo && { src: logo.src, ...fitLogo(logo, 96, 24) }, count: entries.length, items });
  }

  const plan: PlaceLane[] = lanes.map((l) => ({
    items: l.items.map((it) => ({ id: it.row.id, ranks: it.row.ranks, children: it.children?.map((c) => ({ id: c.id, ranks: c.ranks })) })),
  }));
  const ticks = ticksFor(view, x);
  return {
    view,
    lanes,
    plan,
    initial: place(plan, "first", () => false),
    ticks,
    nowX: x(now),
    mobile: { ticks: ticks.map((t) => ({ ...t, p: pct(t.x) })), now: pct(x(now)) },
  };
}
