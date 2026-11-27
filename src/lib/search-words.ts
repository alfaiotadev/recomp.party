/** Words a game or platform is searched by, shared by the quick search index and the agent tools' data. */
import { PLATFORMS, type Entry, type PlatformId } from "./data.ts";

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
  vb: ["virtual boy", "virtualboy"],
  pce: ["pc engine", "pc-engine", "turbografx", "turbografx-16", "tg16", "tg-16", "pc engine cd", "turbografx-cd", "turbo duo"],
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
  j2me: ["java", "j2me", "java me", "mobile", "phone"],
  android: ["android", "mobile", "phone", "apk"],
  ios: ["ios", "iphone", "ipad", "mobile", "phone"],
  wsc: ["wonderswan", "wonderswan color", "bandai"],
};
export const platformWords = (id: PlatformId) => [id, PLATFORMS[id], ...(ALIASES[id] ?? [])];

/** Extra words to match a game by: repo, platform aliases, tool, credited bases, developer, series, genres, year. */
export function gameWords(g: Entry): string {
  const m = g.meta;
  return [g.repo, ...platformWords(g.platform), g.tool, ...(g.based_on ?? []), m?.title, ...(m?.developers ?? []), ...(m?.series ?? []), ...(m?.genres ?? []), m?.year]
    .filter(Boolean)
    .join(" | ");
}
