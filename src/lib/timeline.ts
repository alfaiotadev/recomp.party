import { entryPath, fitLogo, milestonePath, PLATFORMS, platformLogo, platformsInUse, type Entry, type Milestone } from "./data.ts";
import { aiLogos } from "./ai.ts";
import { AXIS_H, BAND_H, place, type PlaceLane, type Placement, type Ranks } from "./timeline-place.ts";

export { AXIS_H, BAND_H };

/**
 * Layout for the swimlane timeline: one lane per source platform, one row per project.
 * Columns: platform logo | game name (left-aligned) | time axis.
 */

export const W = 1140;
export const LABEL_W = 132;
export const NAME_X = LABEL_W + 4;
export const NAME_W = 236;
const CHAR_W = 6.1; // ~6.1 px per 11px character
const MAX_CHARS = Math.floor((NAME_W - 14) / CHAR_W);
export const PAD_R = 12;
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

export type TimelineView = {
  id: string;
  label: string;
  /** Tab label on phones. */
  short: string;
  start: number;
  end: number;
  ticks: "hour" | "day" | "week" | "month" | "year";
};

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
  /** Logos of the AI vendors credited in the row's projects, drawn after the name from `aiX`. */
  ai: { vendor: string; label: string }[];
  aiX: number;
};

/** Width of one AI vendor logo after a row's name, gap included. */
export const AI_LOGO_W = 12;

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

/**
 * A milestone: its vendor's logo on a dashed line, with the label centred above it on one of two rows
 * (`row` 0 right above the logo, 1 above that; for two lines, the row of the first). Two `lines` (label and sub, or a long label wrapped) take both rows. `row: null`
 * leaves just the logo; the tooltip and the milestone's page still carry the text. `cx` is the label's
 * centre, nudged in from the edges.
 */
export type Mark = { m: Milestone; href: string; x: number; p: number; cx: number; row: 0 | 1 | null; w: number; lines: string[] };

export type Layout = {
  view: TimelineView;
  /** Height of the milestone band (0 when no milestone falls in the range). */
  top: number;
  marks: Mark[];
  lanes: Lane[];
  /** Input for `place()`, rendered into the page for the browser to rerun. */
  plan: PlaceLane[];
  /** First paint: default sort, all groups closed. */
  initial: Placement;
  ticks: { x: number; label: string; major: boolean }[];
  nowX: number;
  /** `miles`: logo positions on phones, spread so neighbouring logos stay tappable. */
  mobile: { ticks: { p: number; label: string; major: boolean }[]; now: number; miles: number[] };
};

/** Push positions (percent, ascending) at least `gap` apart, keeping them within 0–100. */
function spread(ps: number[], gap: number): number[] {
  const out = [...ps];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i]!, out[i - 1]! + gap);
  for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i]!, i === out.length - 1 ? 97 : out[i + 1]! - gap);
  return out.map((p) => +p.toFixed(2));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function views(now = Date.now()): TimelineView[] {
  const d = new Date(now);
  const monthsBack = (n: number) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1);
  const daysBack = (n: number) => now - n * DAY;
  // A little headroom on the right so the newest dots don't sit on the edge.
  const end = (start: number) => now + (now - start) * 0.03;
  const view = (id: string, label: string, short: string, start: number, ticks: TimelineView["ticks"]): TimelineView => ({ id, label, short, start, end: end(start), ticks });
  return [
    view("1d", "Today", "1d", daysBack(1), "hour"),
    view("1w", "Last week", "1w", daysBack(7), "day"),
    view("1m", "Last month", "1m", daysBack(30), "week"),
    view("1y", "Last year", "1y", monthsBack(11), "month"),
    view("all", "All time", "all", Date.UTC(2021, 0, 1), "year"),
  ];
}

const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Tick times and labels: every 3 hours, every day, every Monday, every month or every year (UTC). */
function ticksFor(view: TimelineView, x: (t: number) => number): Layout["ticks"] {
  const out: Layout["ticks"] = [];
  const s = new Date(view.start);
  const dayStart = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const dayLabel = (t: number) => `${new Date(t).getUTCDate()} ${MONTHS[new Date(t).getUTCMonth()]}`;
  const push = (t: number, label: string, major: boolean) => {
    if (t >= view.start && t <= view.end) out.push({ x: x(t), label, major });
  };
  if (view.ticks === "hour") {
    for (let t = dayStart; t <= view.end; t += 3 * 3_600_000) {
      const h = new Date(t).getUTCHours();
      push(t, h === 0 ? dayLabel(t) : `${String(h).padStart(2, "0")}:00`, h === 0);
    }
  } else if (view.ticks === "day") {
    for (let t = dayStart; t <= view.end; t += DAY) push(t, `${WEEKDAYS[new Date(t).getUTCDay()]} ${new Date(t).getUTCDate()}`, new Date(t).getUTCDay() === 1);
  } else if (view.ticks === "week") {
    const monday = dayStart - ((new Date(dayStart).getUTCDay() + 6) % 7) * DAY;
    for (let t = monday; t <= view.end; t += 7 * DAY) push(t, dayLabel(t), new Date(t).getUTCDate() <= 7);
  } else {
    let y = s.getUTCFullYear();
    let m = view.ticks === "year" ? 0 : s.getUTCMonth();
    if (view.ticks === "year" && Date.UTC(y, 0, 1) < view.start) y++;
    for (let t = Date.UTC(y, m, 1); t <= view.end; t = Date.UTC(y, m, 1)) {
      const major = m === 0;
      push(t, view.ticks === "year" ? String(y) : major ? `${MONTHS[m]} ${y}` : MONTHS[m]!, major);
      if (view.ticks === "year") y++;
      else if (++m === 12) (m = 0), y++;
    }
  }
  return out;
}

/** Projects of the same game on one platform: same Wikidata item, or the same title without "(…)". */
const gameKey = (e: Entry) => e.wikidata ?? e.game.replace(/\s*\(.*\)$/, "").toLowerCase();
const baseTitle = (game: string) => game.replace(/\s*\(.*\)$/, "");
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const LABEL_CHAR = 6; // 10.5px semibold sans
const SUB_CHAR = 5.4; // 9px mono
const MARK_GAP = 6; // between the line and its label, and between neighbouring labels

/** A label split at the space that leaves the shorter longest line ("Gemini 4 Argon" → "Gemini 4", "Argon"). */
function wrap(label: string): [string, string] | undefined {
  let best: [string, string] | undefined;
  for (let i = label.indexOf(" "); i > 0; i = label.indexOf(" ", i + 1)) {
    const two: [string, string] = [label.slice(0, i), label.slice(i + 1)];
    if (!best || Math.max(...two.map((t) => t.length)) < Math.max(...best.map((t) => t.length))) best = two;
  }
  return best;
}

/**
 * Place milestone labels newest first, so the latest events keep theirs: one line right above the logo,
 * else on the row above that, else wrapped onto both; a label with a `sub` needs both rows. Otherwise logo only.
 */
function marks(list: Milestone[], view: TimelineView, x: (t: number) => number, pct: (px: number) => number, minX: number, maxX: number): Mark[] {
  // "Today" is re-timed to the visitor's day in the browser; a milestone there would need moving too.
  if (view.ticks === "hour") return [];
  const inView = list.filter((m) => Date.parse(m.date) >= view.start && Date.parse(m.date) <= view.end);
  const taken: [number, number][][] = [[], []];
  const free = (rows: number[], a: number, b: number) => rows.every((r) => taken[r]!.every(([c, d]) => b + MARK_GAP <= c || a >= d + MARK_GAP));
  const out = inView.map((m): Mark => {
    const mx = x(Date.parse(m.date));
    return { m, href: milestonePath(m), x: mx, p: pct(mx), cx: mx, row: null, w: 0, lines: [] };
  });
  for (const mk of [...out].reverse()) {
    const { label, sub } = mk.m;
    const split = wrap(label);
    const options: { rows: number[]; lines: string[]; w: number }[] = sub
      ? [{ rows: [0, 1], lines: [label, sub], w: Math.max(label.length * LABEL_CHAR, sub.length * SUB_CHAR) }]
      : [
          { rows: [0], lines: [label], w: label.length * LABEL_CHAR },
          { rows: [1], lines: [label], w: label.length * LABEL_CHAR },
          ...(split ? [{ rows: [0, 1], lines: split, w: Math.max(...split.map((t) => t.length)) * LABEL_CHAR }] : []),
        ];
    for (const o of options) {
      const cx = Math.min(Math.max(mk.x, minX + o.w / 2), maxX - o.w / 2);
      const span: [number, number] = [cx - o.w / 2, cx + o.w / 2];
      if (!free(o.rows, ...span)) continue;
      Object.assign(mk, { cx, w: o.w, lines: o.lines, row: Math.max(...o.rows) as 0 | 1 });
      for (const r of o.rows) taken[r]!.push(span);
      break;
    }
  }
  return out;
}

export function layout(games: Entry[], view: TimelineView, milestones: Milestone[] = [], now = Date.now()): Layout {
  const plotL = NAME_X + NAME_W;
  const plotR = W - PAD_R;
  const x = (t: number) => plotL + ((t - view.start) / (view.end - view.start)) * (plotR - plotL);
  const pct = (px: number) => +(((px - plotL) / (plotR - plotL)) * 100).toFixed(2);

  /** Bar, dots and name for a span of releases. `nameX` is where the label starts, `nameLen` its length. */
  /** `extra`: pixels drawn after the name (a group's badge, AI logos) that the leader must clear. */
  const track = (firstIso: string, latestIso: string, releases: { date: string; prerelease: boolean; kind: Entry["kind"] }[], nameX: number, nameLen: number, extra = 0) => {
    const first = Date.parse(firstIso);
    const x1 = x(Math.max(first, view.start));
    const x2 = x(Date.parse(latestIso));
    const inView = releases.filter((r) => Date.parse(r.date) >= view.start);
    const nameEnd = nameX + nameLen * CHAR_W + 8 + extra;
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
      const ai = aiLogos([entry]);
      return {
        id: entry.repo,
        entry,
        href: entryPath(entry),
        name,
        truncated: name !== label,
        ranks: {},
        ai,
        aiX: NAME_X + (child ? CHILD_INDENT : 0) + name.length * CHAR_W + 5,
        ...track(entry.firstReleaseAt!, entry.latestReleaseAt!, releasesOf(entry), NAME_X + (child ? CHILD_INDENT : 0), name.length, ai.length * AI_LOGO_W),
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
      // the "×N" badge after the name, then every vendor credited across the game's projects
      const badgeW = list.length > 9 ? 22 : 17;
      const groupAi = aiLogos(list);
      const item: Item = {
        row: {
          id: `g:${id}:${key}`,
          entry: list[0]!,
          href: entryPath(list[0]!),
          name,
          truncated: name !== title,
          ranks: {},
          ai: groupAi,
          aiX: NAME_X + name.length * CHAR_W + 7 + badgeW + 5,
          ...track(first, latest, list.flatMap(releasesOf).sort((a, b) => a.date.localeCompare(b.date)), NAME_X, name.length, 7 + badgeW + groupAi.length * AI_LOGO_W),
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
    id: l.id,
    items: l.items.map((it) => ({ id: it.row.id, ranks: it.row.ranks, children: it.children?.map((c) => ({ id: c.id, ranks: c.ranks })) })),
  }));
  const ticks = ticksFor(view, x);
  const ms = marks(milestones, view, x, pct, NAME_X, plotR);
  const top = ms.length ? BAND_H : 0;
  return {
    view,
    top,
    marks: ms,
    lanes,
    plan,
    initial: place(plan, "first", () => false, top),
    ticks,
    nowX: x(now),
    mobile: { ticks: ticks.map((t) => ({ ...t, p: pct(t.x) })), now: pct(x(now)), miles: spread(ms.map((mk) => mk.p), 7) },
  };
}
