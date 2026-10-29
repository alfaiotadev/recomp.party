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
         (GROUP_CONCAT(DISTINCT ?devName; separator="|") AS ?devs)
         (GROUP_CONCAT(DISTINCT ?pubName; separator="|") AS ?pubs)
  WHERE {
    VALUES ?item { ${ids.map((id) => `wd:${id}`).join(" ")} }
    OPTIONAL { ?item rdfs:label ?en. FILTER(LANG(?en) = "en") }
    OPTIONAL { ?item rdfs:label ?mul. FILTER(LANG(?mul) = "mul") }
    BIND(COALESCE(?en, ?mul) AS ?title)
    OPTIONAL { ?item wdt:P577 ?date }
    OPTIONAL { ?wp schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?wikipedia }
    OPTIONAL { ?item wdt:P5794 ?igdb }
    OPTIONAL { ?item wdt:P1933 ?moby }
    OPTIONAL { ?item wdt:P178 ?dev. OPTIONAL { ?dev rdfs:label ?devEn. FILTER(LANG(?devEn) = "en") } OPTIONAL { ?dev rdfs:label ?devMul. FILTER(LANG(?devMul) = "mul") } BIND(COALESCE(?devEn, ?devMul) AS ?devName) }
    OPTIONAL { ?item wdt:P123 ?pub. OPTIONAL { ?pub rdfs:label ?pubEn. FILTER(LANG(?pubEn) = "en") } OPTIONAL { ?pub rdfs:label ?pubMul. FILTER(LANG(?pubMul) = "mul") } BIND(COALESCE(?pubEn, ?pubMul) AS ?pubName) }
  }
  GROUP BY ?item ?title ?wikipedia ?igdb ?moby`);

const games: Record<string, GameMeta> = {};
for (const r of rows) {
  const id = r.item!.value.split("/").pop()!;
  if (games[id]) continue; // an item with two IGDB or MobyGames ids: keep the first
  const split = (s?: { value: string }) => (s?.value ? s.value.split("|").sort() : []);
  games[id] = {
    title: r.title?.value ?? id,
    year: r.first ? Number(r.first.value.slice(0, 4)) : undefined,
    developers: split(r.devs),
    publishers: split(r.pubs),
    wikipedia: r.wikipedia?.value,
    igdb: r.igdb?.value,
    mobygames: r.moby?.value,
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
