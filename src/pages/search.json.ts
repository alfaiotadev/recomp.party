/** Index for the front-page quick search: games, toolchains and outside events, fetched on first use. Results open the item's own page. */
import { gameWords, platformWords } from "../lib/search-words.ts";
import { entryPath, games, KINDS, MILESTONE_KINDS, milestonePath, milestones, PLATFORMS, tools, VENDORS } from "../lib/data.ts";


export type SearchItem = {
  /** g game, t toolchain, e event */
  t: "g" | "t" | "e";
  n: string;
  s: string;
  h: string;
  c?: string;
  /** extra words to match: repo, platform aliases, tool, developer, series, genres, year */
  k: string;
  /** popularity, for ties */
  w: number;
};

export function GET() {
  const items: SearchItem[] = [];
  for (const g of games) {
    items.push({
      t: "g",
      n: g.game,
      s: `${PLATFORMS[g.platform]} · ${KINDS[g.kind].toLowerCase()} · ${g.repo.split("/")[0]}`,
      h: entryPath(g),
      c: g.cover?.src,
      k: gameWords(g),
      w: g.snap?.stars ?? 0,
    });
  }
  for (const t of tools) {
    items.push({
      t: "t",
      n: t.game,
      s: `Toolchain · ${PLATFORMS[t.platform]} · ${t.repo.split("/")[0]}`,
      h: entryPath(t),
      k: [t.repo, ...platformWords(t.platform), "toolchain recompiler", t.note].filter(Boolean).join(" | "),
      w: t.snap?.stars ?? 0,
    });
  }
  /** Other words people search a milestone's vendor by. */
  const VENDOR_WORDS: Record<keyof typeof VENDORS, string> = {
    anthropic: "claude",
    google: "gemini",
    openai: "chatgpt gpt",
    nintendo: "takedown dmca",
    rockstar: "gta grand theft auto launch",
    recompparty: "count celebration",
  };
  for (const m of milestones) {
    items.push({
      t: "e",
      n: m.title,
      s: `${MILESTONE_KINDS[m.kind]} · ${VENDORS[m.vendor]} · ${m.date}`,
      h: milestonePath(m),
      k: [m.label, m.sub, VENDORS[m.vendor], VENDOR_WORDS[m.vendor]].filter(Boolean).join(" | "),
      w: 0,
    });
  }
  return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
}
