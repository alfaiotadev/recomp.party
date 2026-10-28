import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { entryPath, games, KINDS, PLATFORMS } from "../lib/data.ts";

/** RSS: the 60 newest releases across all listed games. */
export function GET(context: APIContext) {
  const items = games
    .flatMap((g) => (g.snap?.releases ?? []).map((r) => ({ g, r })))
    .sort((a, b) => b.r.publishedAt.localeCompare(a.r.publishedAt))
    .slice(0, 60)
    .map(({ g, r }) => ({
      title: `${g.game}: ${r.name || r.tag}${r.prerelease ? " (pre-release)" : ""}`,
      link: r.url,
      pubDate: new Date(r.publishedAt),
      description: `${KINDS[g.kind]} of ${g.game} (${PLATFORMS[g.platform]}) by ${g.repo}. More: ${new URL(entryPath(g), context.site)}`,
    }));
  return rss({
    title: "recomp.party — new releases",
    description: "New releases of playable game recompilations and source ports.",
    site: context.site!,
    items,
  });
}
