import { loadProjects, loadSnapshot } from "../../data/load.ts";
import { KINDS, PLATFORMS, type Project, type Release, type RepoSnapshot } from "../../data/schema.ts";

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
};

const snapshot = loadSnapshot();
export const generatedAt = snapshot.generatedAt;

function toEntry(p: Project): Entry {
  const snap = snapshot.repos[p.repo];
  const dates = snap?.releaseDates ?? [];
  return {
    ...p,
    slug: p.repo,
    url: `https://github.com/${snap?.canonical ?? p.repo}`,
    snap,
    latest: snap?.releases[0],
    firstReleaseAt: dates.at(-1)?.date,
    latestReleaseAt: dates[0]?.date,
    os: snap?.releases[0]?.os ?? [],
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
