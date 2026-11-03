import { loadAi } from "../../data/load.ts";
import type { AiCredit, AiRepo } from "../../data/schema.ts";
import { games, milestones, type Entry } from "./data.ts";

/**
 * What the games' commits say about the models and agents that co-wrote them (data/ai.json).
 * Only what a commit states is counted. How sure each figure is:
 *   named   — the commit names the model and version ("Claude Opus 5.5"): certain
 *   agent   — it names only the agent ("Claude", "Codex"): the agent is certain, the model is a guess
 *             from the date (that vendor's newest model then)
 *   files   — no commit credits anything, but agent instruction files (CLAUDE.md, AGENTS.md) are there
 */
const ai = loadAi();
export const aiSince = ai.since;

export const CONFIDENCE = { named: 1, agent: 0.5, files: 0.3 } as const;
export type Level = keyof typeof CONFIDENCE;

export type Credit = {
  model: string;
  vendor: AiCredit["vendor"];
  tool?: string;
  versioned: boolean;
  commits: number;
  first: string;
  last: string;
  /** Agent-only credits: the vendor's newest model on most of those days ("Opus 5.5"). */
  likely?: string;
};

export type EntryAi = {
  credits: Credit[];
  /** Credits summed over models (a commit naming two models counts twice). */
  credited: number;
  /** Commits on the default branch since `aiSince`. */
  total: number;
  files: string[];
  level: Level | undefined;
};

const MODEL_RELEASES = milestones.filter((m) => m.kind === "model");

/** That vendor's newest model release on or before `day`. */
function newestModel(vendor: string, day: string): string | undefined {
  return MODEL_RELEASES.filter((m) => m.vendor === vendor && m.date <= day).at(-1)?.label;
}

function credit(model: string, c: AiCredit): Credit {
  const days = Object.keys(c.days).sort();
  const commits = Object.values(c.days).reduce((a, b) => a + b, 0);
  let likely: string | undefined;
  if (!c.versioned) {
    const votes = new Map<string, number>();
    for (const [day, n] of Object.entries(c.days)) {
      const guess = newestModel(c.vendor, day);
      if (guess) votes.set(guess, (votes.get(guess) ?? 0) + n);
    }
    likely = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  return { model, vendor: c.vendor, tool: c.tool, versioned: c.versioned, commits, first: days[0]!, last: days.at(-1)!, likely };
}

function entryAi(r: AiRepo | undefined): EntryAi | undefined {
  if (!r) return undefined;
  const credits = Object.entries(r.credits)
    .map(([m, c]) => credit(m, c))
    .sort((a, b) => b.commits - a.commits);
  const level: Level | undefined = credits.some((c) => c.versioned) ? "named" : credits.length ? "agent" : r.files.length ? "files" : undefined;
  return { credits, credited: credits.reduce((n, c) => n + c.commits, 0), total: r.commits, files: r.files, level };
}

const byRepo = new Map(games.map((g) => [g.repo, entryAi(ai.repos[g.repo])]));
export const aiOf = (e: Pick<Entry, "repo">) => byRepo.get(e.repo);

/** "Claude Opus 5.5" → "Opus 5.5": the vendor's logo stands for the brand. */
export const shortModel = (model: string) => model.replace(/^Claude (?=\S)/, "");

export type ModelStat = Credit & { repos: Entry[] };

/** Every credited model or agent across the games, most commits first. */
export const modelStats: ModelStat[] = (() => {
  const out = new Map<string, ModelStat>();
  for (const g of games) {
    for (const c of aiOf(g)?.credits ?? []) {
      const s = out.get(c.model);
      if (!s) out.set(c.model, { ...c, repos: [g] });
      else {
        s.commits += c.commits;
        s.repos.push(g);
        if (c.first < s.first) s.first = c.first;
        if (c.last > s.last) s.last = c.last;
      }
    }
  }
  // the likely model of an agent-only credit, recomputed over every repo's days
  for (const s of out.values()) {
    if (s.versioned) continue;
    const merged: AiCredit = { vendor: s.vendor, versioned: false, days: {} };
    for (const g of s.repos) for (const [d, n] of Object.entries(ai.repos[g.repo]!.credits[s.model]!.days)) merged.days[d] = (merged.days[d] ?? 0) + n;
    s.likely = credit(s.model, merged).likely;
  }
  for (const s of out.values()) s.repos.sort((a, b) => (aiOf(b)!.credits.find((c) => c.model === s.model)!.commits - aiOf(a)!.credits.find((c) => c.model === s.model)!.commits));
  return [...out.values()].sort((a, b) => b.commits - a.commits);
})();

export const aiTotals = {
  credited: modelStats.reduce((n, s) => n + s.commits, 0),
  repos: games.filter((g) => aiOf(g)?.credits.length).length,
  scanned: games.filter((g) => aiOf(g)).length,
  filesOnly: games.filter((g) => aiOf(g)?.level === "files"),
};

/** Monthly credited commits for the chart: the top models by name, everything else as "Other". */
export function monthlySeries(top = 7) {
  const named = modelStats.slice(0, top);
  // colour slots follow first appearance, so a model keeps its colour as later ones arrive
  const series = [...named].sort((a, b) => a.first.localeCompare(b.first)).map((s) => s.model);
  const months = new Map<string, Map<string, number>>();
  for (const g of games) {
    const r = ai.repos[g.repo];
    if (!r) continue;
    for (const [model, c] of Object.entries(r.credits)) {
      const key = series.includes(model) ? model : "Other";
      for (const [day, n] of Object.entries(c.days)) {
        const m = months.get(day.slice(0, 7)) ?? months.set(day.slice(0, 7), new Map()).get(day.slice(0, 7))!;
        m.set(key, (m.get(key) ?? 0) + n);
      }
    }
  }
  if (modelStats.length > top) series.push("Other");
  const keys = [...months.keys()].sort();
  // every month from the first credited one to now, empty months included
  const all: string[] = [];
  if (keys.length) {
    const end = new Date().toISOString().slice(0, 7);
    for (let [y, m] = keys[0]!.split("-").map(Number) as [number, number]; `${y}-${String(m).padStart(2, "0")}` <= end; m === 12 ? ((m = 1), y++) : m++)
      all.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return { series, months: all.map((month) => ({ month, values: series.map((s) => months.get(month)?.get(s) ?? 0) })) };
}

/** Filter token for a model ("claude-opus-5-5") and for its vendor ("v:anthropic"). */
export const modelKey = (model: string) => model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Space-separated filter tokens for a game: its credited models and their vendors. */
export function aiTokens(e: Pick<Entry, "repo">): string {
  const credits = aiOf(e)?.credits ?? [];
  return [...new Set(credits.flatMap((c) => [modelKey(c.model), `v:${c.vendor}`]))].join(" ");
}

const VENDOR_NAMES: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", google: "Gemini", github: "GitHub Copilot", cursor: "Cursor", other: "other agent" };

/** Choices for an "AI co-author" filter: vendors, then models credited in at least two projects. */
export const aiFilterOptions: { value: string; label: string }[] = [
  ...[...new Set(modelStats.map((s) => s.vendor))]
    .map((v) => ({ value: `v:${v}`, label: `Any ${VENDOR_NAMES[v] ?? v}`, n: games.filter((g) => aiTokens(g).split(" ").includes(`v:${v}`)).length }))
    // a vendor line only where it groups several models ("Any Claude"), not for a lone agent
    .filter((o) => o.n > 1 && modelStats.filter((s) => `v:${s.vendor}` === o.value).length > 1)
    .map(({ value, label, n }) => ({ value, label: `${label} (${n})` })),
  ...modelStats.filter((s) => s.repos.length > 1).map((s) => ({ value: modelKey(s.model), label: `${s.versioned ? shortModel(s.model) : (s.tool ?? s.model)} (${s.repos.length})` })),
];

/** The model credited in the most of a game's commits. */
export const topCredit = (e: Pick<Entry, "repo">) => aiOf(e)?.credits[0];

/** Credited commits in the last `days` days: models ranked, and the games with the most. */
export function recentCredits(days = 7, now = Date.now()) {
  const from = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const models = new Map<string, { model: string; vendor: string; versioned: boolean; commits: number }>();
  const top: { entry: Entry; commits: number; model: string; vendor: string }[] = [];
  for (const g of games) {
    const r = ai.repos[g.repo];
    if (!r) continue;
    let sum = 0;
    let best = { model: "", vendor: "", n: 0 };
    for (const [model, c] of Object.entries(r.credits)) {
      const n = Object.entries(c.days).reduce((a, [d, k]) => a + (d >= from ? k : 0), 0);
      if (!n) continue;
      sum += n;
      if (n > best.n) best = { model, vendor: c.vendor, n };
      const m = models.get(model) ?? models.set(model, { model, vendor: c.vendor, versioned: c.versioned, commits: 0 }).get(model)!;
      m.commits += n;
    }
    if (sum) top.push({ entry: g, commits: sum, model: best.model, vendor: best.vendor });
  }
  return {
    ranking: [...models.values()].sort((a, b) => b.commits - a.commits).slice(0, 5),
    top: top.sort((a, b) => b.commits - a.commits).slice(0, 5),
    total: top.reduce((n, t) => n + t.commits, 0),
  };
}
