import { loadGames, loadProjects, loadSnapshot } from "../../data/load.ts";
import { KINDS, PLATFORMS, type GameMeta, type Project, type Release, type RepoSnapshot } from "../../data/schema.ts";

export { KINDS, PLATFORMS };
export type PlatformId = keyof typeof PLATFORMS;

export type Entry = Project & {
  slug: string;
  url: string;
  snap: RepoSnapshot | undefined;
  latest: Release | undefined;
  /** Publish date of the first and latest release (ISO), if any. */
  firstReleaseAt: string | undefined;
  latestReleaseAt: string | undefined;
  /** Distinct OS targets of the latest release. */
  os: Release["os"];
  /** The original game on Wikidata, if the entry is pinned to one. */
  meta: GameMeta | undefined;
  /** IGDB cover as served from public/covers, if there is one. */
  cover: { src: string; width: number; height: number } | undefined;
};

const snapshot = loadSnapshot();
const gameMeta = loadGames();
export const generatedAt = snapshot.generatedAt;

function toEntry(p: Project): Entry {
  const snap = snapshot.repos[p.repo];
  const dates = snap?.releaseDates ?? [];
  const meta = p.wikidata ? gameMeta[p.wikidata] : undefined;
  return {
    ...p,
    slug: p.repo,
    url: `https://github.com/${snap?.canonical ?? p.repo}`,
    snap,
    latest: snap?.releases[0],
    firstReleaseAt: dates.at(-1)?.date,
    latestReleaseAt: dates[0]?.date,
    os: snap?.releases[0]?.os ?? [],
    meta,
    cover: meta?.cover && { src: `/covers/${p.wikidata}.webp`, width: meta.cover.width, height: meta.cover.height },
  };
}

const all = loadProjects().map(toEntry);

const byLatestRelease = (a: Entry, b: Entry) => (b.latestReleaseAt ?? "").localeCompare(a.latestReleaseAt ?? "");

/** Playable games (recomps + ports), newest release first. */
export const games = all.filter((e) => e.kind !== "tool").sort(byLatestRelease);
export const tools = all.filter((e) => e.kind === "tool").sort((a, b) => (b.snap?.stars ?? 0) - (a.snap?.stars ?? 0));

/** Platforms that have at least one game, in the canonical order of PLATFORMS. */
export const platformsInUse = (Object.keys(PLATFORMS) as PlatformId[]).filter((id) => games.some((g) => g.platform === id));

export function entryPath(e: Pick<Entry, "slug">): string {
  return `/p/${e.slug}/`;
}

/** Link for a `based_on` credit: owner/name means a GitHub repo, anything else is used as a URL. */
export function creditLink(credit: string): { href: string; label: string } {
  if (/^https?:\/\//.test(credit)) return { href: credit, label: credit.replace(/^https?:\/\/(www\.)?/, "") };
  return { href: `https://github.com/${credit}`, label: credit };
}

/** Reference sites for the original game, in display order. */
export function gameLinks(e: Pick<Entry, "wikidata" | "meta">): { label: string; href: string }[] {
  const m = e.meta;
  if (!e.wikidata || !m) return [];
  const links = [
    m.wikipedia && { label: "Wikipedia", href: `https://en.wikipedia.org/wiki/${encodeURIComponent(m.wikipedia.replaceAll(" ", "_"))}` },
    m.mobygames && { label: "MobyGames", href: `https://www.mobygames.com/game/${m.mobygames}` },
    m.igdb && { label: "IGDB", href: `https://www.igdb.com/games/${m.igdb}` },
    { label: "Wikidata", href: `https://www.wikidata.org/wiki/${e.wikidata}` },
  ];
  return links.filter((l): l is { label: string; href: string } => Boolean(l));
}

const DAY = 86_400_000;

/** "today", "3 days ago", "5 months ago" — relative to the build time. */
export function ago(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 18) return `${months} months ago`;
  return `${Math.round(days / 365.25)} years ago`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const OS_LABELS: Record<Release["os"][number], string> = {
  windows: "Windows",
  linux: "Linux",
  macos: "macOS",
  android: "Android",
  ios: "iOS",
  web: "Web",
};

/** Platforms with a monochrome-ready logo in public/logos (see public/logos/SOURCES.md), with width/height ratio. */
const LOGO_ASPECT: Partial<Record<PlatformId, number>> = {"nes": 2.708, "snes": 3.945, "n64": 6.913, "gc": 4.434, "wii": 2.299, "wiiu": 3.541, "switch": 0.983, "gb": 5.711, "gbc": 2.45, "gba": 11.188, "nds": 7.243, "3ds": 8.455, "genesis": 4.848, "dc": 1.323, "xbox": 3.873, "x360": 6.264, "ps1": 1.276, "ps2": 5.797, "ps3": 4.669, "ps4": 4.678, "ps5": 4.66, "psp": 5.797, "amiga": 3.033};

export type Logo = { src: string; aspect: number };

export function platformLogo(id: PlatformId): Logo | undefined {
  const aspect = LOGO_ASPECT[id];
  return aspect ? { src: `/logos/${id}.svg`, aspect } : undefined;
}

/** Compact variant for small badges: the SNES logo without its "ENTERTAINMENT SYSTEM" bar. */
export function platformMark(id: PlatformId): Logo | undefined {
  return id === "snes" ? { src: "/logos/snes-mark.svg", aspect: 5.488 } : platformLogo(id);
}

/** Size a logo by area so wide wordmarks and compact marks look equally heavy, within maxW × maxH. */
export function fitLogoArea(logo: Logo, area: number, maxW: number, maxH: number): { w: number; h: number } {
  const h = Math.min(maxH, Math.sqrt(area / logo.aspect), maxW / logo.aspect);
  return { w: h * logo.aspect, h };
}

/** Fit a logo into a box: wide wordmarks are capped by width, square marks get more height. */
export function fitLogo(logo: Logo, maxW: number, maxH: number): { w: number; h: number } {
  const h = Math.min(maxH, maxW / logo.aspect);
  return { w: h * logo.aspect, h };
}

const toolKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Games built with a toolchain entry, matching `tool` loosely ("ReXGlue" ↔ "ReXGlue SDK" / rexglue-sdk). */
export function toolUsers(tool: Entry): Entry[] {
  const names = [tool.game, tool.repo.split("/")[1]!].map(toolKey);
  return games.filter((g) => {
    if (!g.tool) return false;
    const k = toolKey(g.tool);
    return names.some((n) => n === k || n.startsWith(k) || k.startsWith(n));
  });
}

/** One project per game built with a toolchain (the most-starred one), most-starred first. */
export function toolGames(tool: Entry): Entry[] {
  const byGame = new Map<string, Entry>();
  for (const u of [...toolUsers(tool)].sort((a, b) => (b.snap?.stars ?? 0) - (a.snap?.stars ?? 0))) {
    const key = u.wikidata ?? u.game.toLowerCase();
    if (!byGame.has(key)) byGame.set(key, u);
  }
  return [...byGame.values()];
}
