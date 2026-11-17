/**
 * Record the list passing a round number as a milestone in data/milestones.yaml, so it gets its line on the timeline,
 * a row in Highlights, its own page and, for a week, the front-page banner. Two counts, every 1000:
 *
 * - projects: the front page's "playable projects", recomps and ports you can get today (`available`);
 * - games: the different games among them (six projects of one game count once, see `gameKey`).
 *
 *   tsx scripts/count-milestones.ts
 *
 * Runs after every data fetch. A milestone is written once and then left alone: if a repo later goes missing and
 * the count dips under the mark, the day the list got there stays recorded. The Nth is counted in the order the
 * projects were added to the list; within one day, by their first release.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { stringify } from "yaml";
import { loadMilestones, MILESTONES_PATH } from "../data/load.ts";
import { available, entryPath, gameKey, PLATFORMS, type Entry } from "../src/lib/data.ts";

const STEP = 1000;
const SITE = "https://recomp.party";
const longDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const num = (n: number) => n.toLocaleString("en");

const ordered = [...available].sort(
  (a, b) => a.added.localeCompare(b.added) || (a.firstReleaseAt ?? "").localeCompare(b.firstReleaseAt ?? "") || a.repo.localeCompare(b.repo),
);
// each game once, at the project that first brought it to the list
const seen = new Set<string>();
const firstOfGame = ordered.filter((e) => !seen.has(gameKey(e)) && seen.add(gameKey(e)));

const have = new Set(loadMilestones().map((m) => m.id));
const blocks: string[] = [];

function record(unit: "projects" | "games", list: Entry[], id: (n: number) => string) {
  for (let n = STEP; n <= list.length; n += STEP) {
    if (have.has(id(n))) continue;
    const nth = list[n - 1]!;
    // everything listed up to and including the Nth
    const sofar = ordered.slice(0, ordered.indexOf(nth) + 1);
    const platforms = new Set(sofar.map((e) => e.platform)).size;
    const recomps = sofar.filter((e) => e.kind === "recomp").length;
    const games = new Set(sofar.map(gameKey)).size;
    const what =
      unit === "projects"
        ? `${num(n)} playable projects on ${longDate(nth.added)}, for ${num(games)} different games: ${num(recomps)} static\nrecompilations and ${num(sofar.length - recomps)} source ports across ${platforms} platforms.`
        : `${num(n)} different playable games on ${longDate(nth.added)}, in ${num(sofar.length)} projects (some games\nhave several) across ${platforms} platforms.`;
    const milestone = {
      id: id(n),
      date: nth.added,
      kind: "count",
      vendor: "recompparty",
      label: `${num(n)} ${unit}`,
      sub: "on recomp.party",
      title: unit === "projects" ? `recomp.party lists ${num(n)} playable recomps and ports` : `${num(n)} different games playable natively`,
      summary: [
        `The list reached ${what} Every one can be downloaded and run natively today with your own game files.`,
        "",
        `Counted in the order projects were added, the ${num(n)}th${unit === "games" ? " game" : ""} is ${nth.game}`,
        `(${nth.repo}, ${PLATFORMS[nth.platform]}). Projects whose repo has gone missing without a confirmed new home`,
        "are not counted.",
      ].join("\n"),
      sources: [
        { label: `The ${num(n)}th: ${nth.game}`, url: `${SITE}${entryPath(nth)}` },
        { label: "recomp.party: every listed game", url: `${SITE}/#all-games` },
      ],
      project: nth.repo,
    };
    blocks.push(stringify([milestone], { lineWidth: 0 }));
    console.log(`${id(n)}: reached on ${nth.added} with ${nth.repo}`);
  }
}

record("projects", ordered, (n) => `recomp-party-${n}`);
record("games", firstOfGame, (n) => `recomp-party-${n}-games`);

if (blocks.length) {
  // newest first, right under the file's header comment, like the hand-written entries
  const text = readFileSync(MILESTONES_PATH, "utf8");
  const at = text.indexOf("\n- id:");
  const head = at === -1 ? `${text.trimEnd()}\n\n` : text.slice(0, at + 1);
  const rest = at === -1 ? "" : text.slice(at + 1);
  writeFileSync(MILESTONES_PATH, head + blocks.reverse().map((b) => `${b.trimEnd()}\n\n`).join("") + rest);
} else {
  console.log(`${ordered.length} playable projects, ${firstOfGame.length} different games. Nothing to record.`);
}
