/**
 * Suggest a Wikidata item for every game entry in data/projects.yaml that has no `wikidata` yet.
 * Prints candidates for a human to check; nothing is written. Usage: npm run match-wikidata [-- --all]
 */
import { loadProjects } from "../data/load.ts";
import { wikidataCandidates as candidates, type WikidataCandidate as Candidate } from "./lib/wikidata.ts";

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
