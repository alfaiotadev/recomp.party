/**
 * Refresh data/games.json (original-game facts from Wikidata) and public/covers/*.webp (covers from IGDB)
 * for every `wikidata` id in data/projects.yaml. Covers are skipped, and existing ones kept, without IGDB credentials.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { COVERS_DIR, GAMES_PATH, loadGames, loadProjects } from "../data/load.ts";
import { Games, type GameMeta } from "../data/schema.ts";
import { igdbCovers, igdbCoverUrl, igdbCredentials } from "./lib/igdb.ts";
import { sparql } from "./lib/wikidata.ts";

const COVER_WIDTH = 400;
if (existsSync(".env")) process.loadEnvFile(".env"); // local runs; CI passes the secrets as env vars

const ids = [...new Set(loadProjects().flatMap((p) => (p.wikidata ? [p.wikidata] : [])))].sort();
const previous = loadGames();

// --- Wikidata: one query for every item. Multi-valued facts come back as "|"-joined strings.
// Newer items often carry only a language-neutral "mul" label, so that is the fallback for English.
const rows = await sparql(`
  SELECT ?item ?title (MIN(?date) AS ?first) ?wikipedia ?igdb ?moby
         (GROUP_CONCAT(DISTINCT CONCAT(STR(?dateValue), "@", STR(?precision)); separator="|") AS ?dates)
         (GROUP_CONCAT(DISTINCT ?devName; separator="|") AS ?devs)
         (GROUP_CONCAT(DISTINCT ?pubName; separator="|") AS ?pubs)
         (GROUP_CONCAT(DISTINCT ?genreName; separator="|") AS ?genres)
         (GROUP_CONCAT(DISTINCT ?seriesName; separator="|") AS ?series)
  WHERE {
    VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }
    OPTIONAL { ?item rdfs:label ?en. FILTER(LANG(?en) = "en") }
    OPTIONAL { ?item rdfs:label ?mul. FILTER(LANG(?mul) = "mul") }
    BIND(COALESCE(?en, ?mul) AS ?title)
    OPTIONAL { ?item wdt:P577 ?date }
    OPTIONAL { ?item p:P577 ?pubStatement. ?pubStatement wikibase:rank ?pubRank; psv:P577 [ wikibase:timeValue ?dateValue; wikibase:timePrecision ?precision ]. FILTER(?pubRank != wikibase:DeprecatedRank) }
    OPTIONAL { ?wp schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?wikipedia }
    OPTIONAL { ?item wdt:P5794 ?igdb }
    OPTIONAL { ?item wdt:P1933 ?moby }
    OPTIONAL { ?item wdt:P178 ?dev. OPTIONAL { ?dev rdfs:label ?devEn. FILTER(LANG(?devEn) = "en") } OPTIONAL { ?dev rdfs:label ?devMul. FILTER(LANG(?devMul) = "mul") } BIND(COALESCE(?devEn, ?devMul) AS ?devName) }
    OPTIONAL { ?item wdt:P123 ?pub. OPTIONAL { ?pub rdfs:label ?pubEn. FILTER(LANG(?pubEn) = "en") } OPTIONAL { ?pub rdfs:label ?pubMul. FILTER(LANG(?pubMul) = "mul") } BIND(COALESCE(?pubEn, ?pubMul) AS ?pubName) }
    OPTIONAL { ?item wdt:P136 ?genre. ?genre rdfs:label ?genreName. FILTER(LANG(?genreName) = "en") }
    OPTIONAL { ?item wdt:P179 ?ser. ?ser rdfs:label ?seriesName. FILTER(LANG(?seriesName) = "en") }
  }
  GROUP BY ?item ?title ?wikipedia ?igdb ?moby`);

// --- Store ids, in a second query so the many-valued joins above don't multiply. Wikidata property per store.
const STORE_PROPS = { steam: "P1733", gog: "P2725", eshop: "P8084", psn: "P5944", msstore: "P5885" } as const;
type Store = keyof typeof STORE_PROPS;
const storeRows = await sparql(`
  SELECT ?item ?prop ?value WHERE {
    VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }
    VALUES ?prop { ${Object.values(STORE_PROPS).map((p) => `wdt:${p}`).join(" ")} }
    ?item ?prop ?value.
  }`);
const storeValues = new Map<string, Partial<Record<Store, string[]>>>();
for (const r of storeRows) {
  const id = r.item!.value.split("/").pop()!;
  const prop = r.prop!.value.split("/").pop()!;
  const store = (Object.keys(STORE_PROPS) as Store[]).find((k) => STORE_PROPS[k] === prop)!;
  const per = storeValues.get(id) ?? {};
  (per[store] ??= []).push(r.value!.value);
  storeValues.set(id, per);
}
/** GOG sends delisted games to its catalogue page: keep only listings that still exist. */
async function gogListed(path: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.gog.com/${path}`, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    return res.ok && !/\/games\/?$/.test(new URL(res.url).pathname);
  } catch {
    return true; // can't tell: keep it
  }
}
async function pickStores(id: string): Promise<GameMeta["stores"]> {
  const v = storeValues.get(id);
  if (!v) return undefined;
  const shortest = (list?: string[]) => list?.slice().sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  const gog = shortest(v.gog);
  const stores: NonNullable<GameMeta["stores"]> = {
    steam: v.steam?.slice().sort((a, b) => Number(a) - Number(b))[0],
    gog: gog && (await gogListed(gog)) ? gog : undefined,
    // the base game's listing, not a "Nintendo Switch 2 Edition" upgrade
    eshop: shortest(v.eshop),
    // PS3 and Vita products (NP… ids) are gone from the web store; PS4 (CUSA) and PS5 (PPSA) pages still open
    psn: shortest(v.psn?.filter((x) => /-(CUSA|PPSA)\d/.test(x))),
    msstore: shortest(v.msstore),
  };
  const kept = Object.fromEntries(Object.entries(stores).filter(([, x]) => x));
  return Object.keys(kept).length ? kept : undefined;
}

/** Earliest of "date@precision" values, cut to what is known: 11 = day, 10 = month, 9 = year. */
function released(dates: string | undefined): string | undefined {
  const known = (dates ?? "")
    .split("|")
    .map((d) => d.split("@"))
    .filter(([date, prec]) => date && Number(prec) >= 9 && !date.startsWith("-"))
    .map(([date, prec]) => ({ at: date!.slice(0, 10), cut: date!.slice(0, Number(prec) >= 11 ? 10 : Number(prec) === 10 ? 7 : 4) }));
  // A year or month stands in for 1 January / the 1st: drop it when a more precise date falls inside it.
  const refined = known.filter((k) => !known.some((o) => o.cut.length > k.cut.length && o.cut.startsWith(k.cut)));
  // earliest first; on the same day prefer the most precise value
  return refined.sort((a, b) => a.at.localeCompare(b.at) || b.cut.length - a.cut.length)[0]?.cut;
}

const games: Record<string, GameMeta> = {};
for (const r of rows) {
  const id = r.item!.value.split("/").pop()!;
  if (games[id]) continue; // an item with two IGDB or MobyGames ids: keep the first
  const split = (s?: { value: string }) => (s?.value ? s.value.split("|").sort() : []);
  games[id] = {
    title: r.title?.value ?? id,
    year: r.first ? Number(r.first.value.slice(0, 4)) : undefined,
    released: released(r.dates?.value),
    developers: split(r.devs),
    publishers: split(r.pubs),
    genres: split(r.genres),
    series: split(r.series),
    wikipedia: r.wikipedia?.value,
    igdb: r.igdb?.value,
    mobygames: r.moby?.value,
    stores: await pickStores(id),
    cover: previous[id]?.cover,
  };
}
for (const id of ids) if (!games[id]) console.warn(`  not on Wikidata: ${id}`);

// --- IGDB covers: download only new or changed ones.
mkdirSync(COVERS_DIR, { recursive: true });
const coverFile = (id: string) => join(COVERS_DIR, `${id}.webp`);
const creds = igdbCredentials();
if (creds) {
  const slugs = [...new Set(Object.values(games).flatMap((g) => (g.igdb ? [g.igdb] : [])))];
  const covers = await igdbCovers(slugs, creds);
  for (const [id, g] of Object.entries(games)) {
    const c = g.igdb ? covers.get(g.igdb) : undefined;
    if (!c) {
      g.cover = undefined;
      continue;
    }
    if (g.cover?.igdbImage === c.imageId && existsSync(coverFile(id))) continue;
    const res = await fetch(igdbCoverUrl(c.imageId));
    if (!res.ok) {
      console.warn(`  cover ${c.imageId} for ${id}: HTTP ${res.status}`);
      continue;
    }
    const info = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: COVER_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(coverFile(id));
    g.cover = { igdbImage: c.imageId, width: info.width, height: info.height };
    console.log(`  cover: ${id} ${g.title}`);
  }
} else {
  console.log("No IGDB_CLIENT_ID / IGDB_CLIENT_SECRET: keeping existing covers.");
}

// Drop covers whose file is gone, and files nobody refers to.
for (const [id, g] of Object.entries(games)) if (g.cover && !existsSync(coverFile(id))) g.cover = undefined;
for (const f of readdirSync(COVERS_DIR)) if (!f.startsWith(".") && !games[f.replace(/\.webp$/, "")]?.cover) rmSync(join(COVERS_DIR, f));

const sorted = Object.fromEntries(Object.keys(games).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).map((k) => [k, games[k]]));
writeFileSync(GAMES_PATH, `${JSON.stringify(Games.parse(sorted), null, 1)}\n`);
const withCover = Object.values(games).filter((g) => g.cover).length;
console.log(`${Object.keys(games).length} games, ${withCover} with a cover.`);
