/**
 * Lost & found: look for a new home for every listed project whose GitHub repo is gone and that has no confirmed
 * `moved_to` yet. Writes tmp/lost-found.md for a maintainer to review; nothing here changes the site. A candidate
 * becomes a link on the site only when a person adds it as `moved_to:` in data/projects.yaml.
 *
 *   tsx scripts/lost-found.ts
 *
 * Where it looks: the same owner and repo name on Codeberg and GitLab (the author moving it themselves), then repos
 * with the same name, or the game's name and "recomp"/"port", on Codeberg, GitLab and GitHub (forks of a deleted repo
 * stay on GitHub).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { loadProjects, loadSnapshot } from "../data/load.ts";
import { rest } from "./lib/github.ts";

type Candidate = { url: string; host: string; why: string; sameOwner: boolean; updated?: string; stars?: number };

const UA = { "user-agent": "recomp.party lost-found (+https://recomp.party)" };
const getJson = async <T>(url: string): Promise<T | undefined> => {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
    return res.ok ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
};

type Forge = { full_name: string; html_url: string; updated_at?: string; stars_count?: number; owner: { login: string } };
async function codeberg(owner: string, name: string, game: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const own = await getJson<Forge>(`https://codeberg.org/api/v1/repos/${owner}/${name}`);
  if (own) out.push({ url: own.html_url, host: "codeberg.org", why: "same owner and name", sameOwner: true, updated: own.updated_at });
  for (const q of [name, `${game} recomp`]) {
    const res = await getJson<{ data: Forge[] }>(`https://codeberg.org/api/v1/repos/search?q=${encodeURIComponent(q)}&limit=5`);
    for (const r of res?.data ?? [])
      out.push({ url: r.html_url, host: "codeberg.org", why: `search “${q}”`, sameOwner: r.owner.login.toLowerCase() === owner.toLowerCase(), updated: r.updated_at, stars: r.stars_count });
  }
  return out;
}

type GitLabProject = { web_url: string; path_with_namespace: string; last_activity_at?: string; star_count?: number; namespace: { path: string } };
async function gitlab(owner: string, name: string, game: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const own = await getJson<GitLabProject>(`https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${name}`)}`);
  if (own) out.push({ url: own.web_url, host: "gitlab.com", why: "same owner and name", sameOwner: true, updated: own.last_activity_at });
  for (const q of [name, `${game} recomp`]) {
    const res = await getJson<GitLabProject[]>(`https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=5&order_by=last_activity_at`);
    for (const r of res ?? [])
      out.push({ url: r.web_url, host: "gitlab.com", why: `search “${q}”`, sameOwner: r.namespace.path.toLowerCase() === owner.toLowerCase(), updated: r.last_activity_at, stars: r.star_count });
  }
  return out;
}

type GhRepo = { full_name: string; html_url: string; pushed_at: string; stargazers_count: number; fork: boolean; owner: { login: string } };
async function github(slug: string, owner: string, name: string, game: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const q of [`${name} in:name`, `"${game}" recomp in:name,description`, `"${game}" port in:name,description`]) {
    const res = await rest<{ items: GhRepo[] }>(`/search/repositories?q=${encodeURIComponent(q)}&per_page=5&sort=updated`).catch(() => undefined);
    for (const r of res?.items ?? [])
      if (r.full_name.toLowerCase() !== slug.toLowerCase())
        out.push({ url: r.html_url, host: "github.com", why: `search ${q}${r.fork ? " (a fork)" : ""}`, sameOwner: r.owner.login.toLowerCase() === owner.toLowerCase(), updated: r.pushed_at, stars: r.stargazers_count });
  }
  return out;
}

const snapshot = loadSnapshot();
const listed = new Set(loadProjects().map((p) => p.repo.toLowerCase()));
const lost = loadProjects().filter((p) => {
  const g = snapshot.repos[p.repo]?.gone;
  return g && (g.misses >= 2 || g.reason === "dmca") && !p.moved_to && p.kind !== "tool";
});

const sections: string[] = [];
for (const p of lost) {
  const [owner, name] = p.repo.split("/") as [string, string];
  const gone = snapshot.repos[p.repo]!.gone!;
  const all = [...(await codeberg(owner, name, p.game)), ...(await gitlab(owner, name, p.game)), ...(await github(p.repo, owner, name, p.game))];
  // one line per URL, the strongest reason first; repos already on the list are not new homes
  const seen = new Map<string, Candidate>();
  for (const c of all.sort((a, b) => Number(b.sameOwner) - Number(a.sameOwner))) {
    const key = c.url.toLowerCase().replace(/\/$/, "");
    const ghSlug = c.host === "github.com" ? key.replace("https://github.com/", "") : "";
    if (!seen.has(key) && !listed.has(ghSlug)) seen.set(key, c);
  }
  const cands = [...seen.values()];
  const line = (c: Candidate) =>
    `- ${c.sameOwner ? "**same owner** · " : ""}[${c.url.replace(/^https:\/\//, "")}](${c.url}) — ${c.why}${c.stars !== undefined ? ` · ★ ${c.stars}` : ""}${c.updated ? ` · updated ${c.updated.slice(0, 10)}` : ""}`;
  sections.push(
    [
      `### ${p.game} — \`${p.repo}\``,
      `Gone since ${gone.since.slice(0, 10)} (${gone.reason}).${gone.archived ? " Software Heritage has an archive." : ""}`,
      "",
      cands.length ? cands.map(line).join("\n") : "_No candidates found._",
      "",
    ].join("\n"),
  );
  console.log(`${p.repo}: ${cands.length} candidates (${cands.filter((c) => c.sameOwner).length} same owner)`);
}

const report = [
  `## Lost & found — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `Listed projects whose GitHub repo is gone and that have no confirmed new home: **${lost.length}**.`,
  "",
  "These are search hits, not verified moves. Before linking one, check that it is the author's own (same name, same",
  "history, an announcement) and not a re-upload: re-uploads can carry malware, and a copy of a project taken down",
  "under the DMCA is not something to link. To link a confirmed move, add `moved_to: <url>` to the entry in",
  "`data/projects.yaml`.",
  "",
  ...sections,
].join("\n");
mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/lost-found.md", report);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: "a" });
console.log(`\n${lost.length} gone projects checked; report in tmp/lost-found.md`);
