/**
 * Suggest a Wikidata item for every game entry in data/projects.yaml that has no `wikidata` yet.
 * Prints candidates for a human to check; nothing is written. Usage: npm run match-wikidata [-- --all]
 */
import { loadProjects } from "../data/load.ts";
import { wikidataApi } from "./lib/wikidata.ts";

type Candidate = { id: string; label: string; description: string; igdb?: string; year?: string };

/** Search Wikidata for a game title; keep items that look like games (IGDB id or "video game" in the description). */
async function candidates(title: string): Promise<Candidate[]> {
  const search = await wikidataApi({ action: "wbsearchentities", search: title, language: "en", type: "item", limit: "8" });
  const ids: string[] = search.search.map((s: { id: string }) => s.id);
  if (!ids.length) return [];
  const got = await wikidataApi({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims", languages: "en" });
  return ids
    .map((id) => {
      const e = got.entities[id];
      const claim = (p: string) => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
      return {
        id,
        label: e.labels?.en?.value ?? "",
        description: e.descriptions?.en?.value ?? "",
        igdb: claim("P5794") as string | undefined,
        year: (claim("P577") as { time?: string } | undefined)?.time?.slice(1, 5),
      };
    })
    .filter((c) => c.igdb || /video game/i.test(c.description));
}

const all = process.argv.includes("--all");
const todo = loadProjects().filter((p) => p.kind !== "tool" && (all || !p.wikidata));
const seen = new Map<string, Candidate[]>();
for (const p of todo) {
  const title = p.game.replace(/\s*\(.*\)$/, "");
  if (!seen.has(title)) seen.set(title, await candidates(title));
  const list = seen.get(title)!;
  console.log(`${p.repo}  "${p.game}" (${p.platform})${p.wikidata ? `  [pinned ${p.wikidata}]` : ""}`);
  if (!list.length) console.log("    no candidates");
  for (const c of list.slice(0, 3)) console.log(`    ${c.id}  ${c.label}${c.year ? ` (${c.year})` : ""} — ${c.description}${c.igdb ? `  igdb:${c.igdb}` : ""}`);
}
