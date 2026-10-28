/** Canonical layout of data/projects.yaml: one section per platform, toolchains last, sorted by game. */
import { stringify } from "yaml";
import { PLATFORMS, type Project } from "../../data/schema.ts";

const HEADER = `# recomp.party — curated list of playable recomps and ports.
#
# Inclusion: a game project must have at least one published release you can
# download and run (with your own game files). Toolchains (kind: tool) are listed
# for context. Decompilations are not tracked as entries, but a port should credit
# the decomp it builds on in \`based_on\`.
#
# Fields: see data/schema.ts. Layout is generated: run \`npm run format\` after editing.
`;

const FIELDS = ["repo", "game", "platform", "kind", "tool", "based_on", "note", "added"] as const;

const scalar = (v: string) => stringify(v, { lineWidth: 0 }).trim();

function entry(p: Project): string {
  const lines = FIELDS.filter((f) => p[f] !== undefined).map((f, i) => {
    const v = p[f]!;
    const value = Array.isArray(v) ? `[${v.map(scalar).join(", ")}]` : scalar(String(v));
    return `${i === 0 ? "- " : "  "}${f}: ${value}`;
  });
  return lines.join("\n");
}

function section(title: string, list: Project[]): string {
  const sorted = [...list].sort(
    (a, b) => a.game.localeCompare(b.game, "en", { sensitivity: "base" }) || a.repo.localeCompare(b.repo),
  );
  return `# --- ${title} ${"-".repeat(Math.max(3, 76 - title.length))}\n${sorted.map(entry).join("\n")}\n`;
}

export function formatProjects(projects: Project[]): string {
  const games = projects.filter((p) => p.kind !== "tool");
  const tools = projects.filter((p) => p.kind === "tool");
  const sections = (Object.keys(PLATFORMS) as (keyof typeof PLATFORMS)[])
    .map((id) => [PLATFORMS[id], games.filter((g) => g.platform === id)] as const)
    .filter(([, list]) => list.length)
    .map(([title, list]) => section(title, list));
  if (tools.length) sections.push(section("Toolchains", tools));
  return `${HEADER}\n${sections.join("\n")}`;
}
