/**
 * Refresh data/launcher.json: which listed repos are in RecompLauncher's catalog (recomplauncher.com), and which of
 * them have one-click setup. The catalog is one public JSON file the launcher itself downloads.
 */
import { writeFileSync } from "node:fs";
import { LAUNCHER_PATH, loadProjects } from "../data/load.ts";
import type { LauncherData } from "../data/schema.ts";

const CATALOG = "https://recomplauncher.com/pc-catalog.json";

type App = { id: string; repo: string; soon?: boolean; support?: { sdk?: string; easy_setup?: string } };

const res = await fetch(CATALOG, { headers: { "user-agent": "recomp.party data fetch (+https://recomp.party/about/)" } });
if (!res.ok) throw new Error(`${CATALOG}: HTTP ${res.status}`);
const apps = ((await res.json()) as { apps: App[] }).apps;

const listed = new Map(loadProjects().map((p) => [p.repo.toLowerCase(), p.repo]));
const games: LauncherData["games"] = {};
for (const app of apps) {
  const repo = listed.get(app.repo?.toLowerCase());
  // Coming Soon entries can't be installed yet; a repo listed twice keeps the entry with setup
  if (!repo || app.soon || games[repo]?.easy) continue;
  games[repo] = {
    id: app.id,
    easy: Boolean(app.support?.easy_setup),
    own: app.support?.sdk === "release" || app.support?.sdk === "repo",
  };
}

const sorted = Object.fromEntries(Object.entries(games).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(LAUNCHER_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), games: sorted }, null, 1)}\n`);
const all = Object.values(games);
console.log(`RecompLauncher: ${all.length} listed repos in the catalog, ${all.filter((g) => g.easy).length} with one-click setup.`);
