/**
 * Every listed project as plain data, for the in-browser agent tools (src/components/AgentTools.astro) and anyone
 * else who wants it: what the project page shows, minus the page. Fetched on an agent's first tool call.
 */
import { aiOf, shortModel } from "../lib/ai.ts";
import { entryPath, games, generatedAt, KINDS, OS_LABELS, PLATFORMS } from "../lib/data.ts";
import { gameWords } from "../lib/search-words.ts";

const SITE = "https://recomp.party";

export function GET() {
  const projects = games.map((g) => ({
    game: g.game,
    platform: PLATFORMS[g.platform],
    kind: KINDS[g.kind].toLowerCase(),
    repo: g.repo,
    page: SITE + entryPath(g),
    github: g.url,
    description: g.snap?.description ?? null,
    stars: g.snap?.stars ?? 0,
    status: g.moved_to ? "moved" : g.gone ? "gone from GitHub" : "available",
    moved_to: g.moved_to ?? null,
    first_release: g.firstReleaseAt ?? null,
    latest_release: g.latest
      ? { tag: g.latest.tag, date: g.latest.publishedAt, url: g.latest.url, prerelease: g.latest.prerelease, runs_on: g.os.map((o) => OS_LABELS[o]) }
      : null,
    toolchain: g.tool ?? null,
    based_on: g.based_on ?? [],
    ai_coauthors: (aiOf(g)?.credits ?? []).map((c) => (c.versioned ? shortModel(c.model) : (c.tool ?? c.model))),
    original_release_year: g.meta?.year ?? null,
    /** search words: repo, platform aliases, developer, series, genres */
    words: gameWords(g),
  }));
  return new Response(JSON.stringify({ generated_at: generatedAt, count: projects.length, projects }), { headers: { "content-type": "application/json" } });
}
