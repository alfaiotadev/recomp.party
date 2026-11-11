/** Index for the front-page quick search: games, toolchains and outside events, fetched on first use. Results open the item's own page. */
import { entryPath, games, KINDS, MILESTONE_KINDS, milestonePath, milestones, PLATFORMS, tools, VENDORS, type PlatformId } from "../lib/data.ts";

/** What people type for a platform besides its name and id. */
const ALIASES: Partial<Record<PlatformId, string[]>> = {
  nes: ["famicom"],
  snes: ["super nintendo", "super famicom", "sfc"],
  n64: ["nintendo 64"],
  gc: ["gamecube", "ngc", "gcn"],
  wiiu: ["wii u"],
  switch: ["nx", "ns"],
  switch2: ["ns2"],
  gb: ["gameboy"],
  gbc: ["gameboy color", "game boy colour"],
  gba: ["gameboy advance"],
  nds: ["ds"],
  genesis: ["mega drive", "megadrive", "md", "sega"],
  saturn: ["sega saturn"],
  dc: ["dreamcast", "sega"],
  ps1: ["psx", "psone", "playstation 1", "ps"],
  ps2: ["playstation 2"],
  ps3: ["playstation 3"],
  ps4: ["playstation 4"],
  ps5: ["playstation 5"],
  psp: ["playstation portable"],
  vita: ["psvita", "playstation vita"],
  xbox: ["og xbox", "original xbox"],
  x360: ["xbox 360", "360"],
  pc: ["dos", "windows"],
};
const platformWords = (id: PlatformId) => [id, PLATFORMS[id], ...(ALIASES[id] ?? [])];

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
    const m = g.meta;
    items.push({
      t: "g",
      n: g.game,
      s: `${PLATFORMS[g.platform]} · ${KINDS[g.kind].toLowerCase()} · ${g.repo.split("/")[0]}`,
      h: entryPath(g),
      c: g.cover?.src,
      k: [g.repo, ...platformWords(g.platform), g.tool, ...(g.based_on ?? []), m?.title, ...(m?.developers ?? []), ...(m?.series ?? []), ...(m?.genres ?? []), m?.year]
        .filter(Boolean)
        .join(" | "),
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
  for (const m of milestones) {
    items.push({
      t: "e",
      n: m.title,
      s: `${MILESTONE_KINDS[m.kind]} · ${VENDORS[m.vendor]} · ${m.date}`,
      h: milestonePath(m),
      k: [m.label, m.sub, VENDORS[m.vendor], m.vendor === "anthropic" ? "claude" : m.vendor === "google" ? "gemini" : "chatgpt gpt"].filter(Boolean).join(" | "),
      w: 0,
    });
  }
  return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
}
