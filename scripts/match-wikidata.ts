/**
 * Find a Wikidata item for every game entry in data/projects.yaml that has no `wikidata` yet (games without one get
 * no cover, release date or developer on the site).
 *
 *   npm run match-wikidata            print candidates for a human to check; nothing is written
 *   npm run match-wikidata -- --all   the same for every entry, pinned or not
 *   npm run match-wikidata -- --write pin the matches that are safe to take without a human, and list the rest
 *
 * A match is safe when the entry builds on (based_on) another project for the same platform that is already
 * pinned, or when exactly one search result (a game, not a series) lists the entry's platform and has the same
 * title, or, if none has, a title that ends with it. The discovery workflow runs --write before opening its pull
 * request, so new candidates arrive pinned where possible.
 */
import { writeFileSync } from "node:fs";
import { loadProjects, PROJECTS_PATH } from "../data/load.ts";
import { PLATFORMS } from "../data/schema.ts";
import { formatProjects } from "./lib/format.ts";
import { titleKey, wikidataCandidates as candidates, type WikidataCandidate as Candidate } from "./lib/wikidata.ts";

const all = process.argv.includes("--all");
const write = process.argv.includes("--write");
const projects = loadProjects();
const todo = projects.filter((p) => p.kind !== "tool" && (all || !p.wikidata));

/** How Wikidata names each platform (P400 labels); our own display name is always accepted too. */
const PLATFORM_NAMES: Partial<Record<keyof typeof PLATFORMS, string[]>> = {
  nes: ["Nintendo Entertainment System", "Family Computer"],
  snes: ["Super Nintendo Entertainment System", "Super Famicom"],
  gc: ["Nintendo GameCube"],
  switch: ["Nintendo Switch"],
  switch2: ["Nintendo Switch 2"],
  vb: ["Virtual Boy"],
  pce: ["TurboGrafx-16", "PC Engine", "TurboGrafx-CD", "PC Engine CD-ROM²", "CD-ROM²", "Super CD-ROM²", "PC Engine Duo", "TurboDuo"],
  genesis: ["Sega Genesis", "Mega Drive", "Sega Mega Drive"],
  saturn: ["Sega Saturn"],
  dc: ["Sega Dreamcast"],
  ps1: ["PlayStation (console)"],
  psp: ["PlayStation Portable"],
  vita: ["PlayStation Vita"],
  amiga: ["Amiga 500", "Amiga 1200", "Amiga CD32"],
};
const onPlatform = (c: Candidate, platform: keyof typeof PLATFORMS) => {
  const names = new Set([PLATFORMS[platform], ...(PLATFORM_NAMES[platform] ?? [])].map(titleKey));
  return c.platforms.some((p) => names.has(titleKey(p)));
};

const byRepo = new Map(projects.map((p) => [p.repo, p]));
const seen = new Map<string, Candidate[]>();
const pinned: string[] = [];
for (const p of todo) {
  const title = p.game.replace(/\s*\(.*\)$/, "");
  if (!seen.has(title)) seen.set(title, await candidates(title));
  const list = seen.get(title)!;

  // 1. built on an already pinned project for the same platform: the same game
  const parent = (p.based_on ?? []).map((r) => byRepo.get(r)).find((b) => b?.wikidata && b.platform === p.platform);
  // 2. exactly one game (not a series) with this title on this platform; failing that, exactly one whose title
  //    ends with it ("Tom Clancy's Ghost Recon Advanced Warfighter" for "Ghost Recon Advanced Warfighter")
  const games = list.filter((c) => onPlatform(c, p.platform) && !/\b(series|franchise)\b/i.test(c.description));
  const key = titleKey(title);
  const exact = games.filter((c) => titleKey(c.label) === key);
  const suffix = games.filter((c) => titleKey(c.label).endsWith(` ${key}`));
  const found = exact.length === 1 ? exact[0] : !exact.length && suffix.length === 1 ? suffix[0] : undefined;
  const match = parent?.wikidata ?? found?.id;
  const why = parent?.wikidata ? `same game as ${parent.repo}` : `only ${found === exact[0] ? "title" : "longer-title"} match on this platform`;

  if (write && !p.wikidata && match) {
    p.wikidata = match;
    pinned.push(`${p.repo}  "${p.game}" (${p.platform}) → ${match}  (${why})`);
    continue;
  }
  console.log(`${p.repo}  "${p.game}" (${p.platform})${p.wikidata ? `  [pinned ${p.wikidata}]` : ""}${match && !p.wikidata ? `  → ${match} (${why})` : ""}`);
  if (!list.length) console.log("    no candidates");
  for (const c of list.slice(0, 3))
    console.log(
      `    ${c.id}  ${c.label}${c.year ? ` (${c.year})` : ""} — ${c.description}${c.platforms.length ? ` [${c.platforms.join(", ")}]` : ""}${c.igdb ? `  igdb:${c.igdb}` : ""}`,
    );
}

if (write) {
  if (pinned.length) writeFileSync(PROJECTS_PATH, formatProjects(projects));
  console.log(pinned.length ? `\nPinned ${pinned.length}:\n${pinned.map((l) => `  ${l}`).join("\n")}` : "\nNothing safe to pin.");
}
