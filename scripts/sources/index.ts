/**
 * Discovery sources. Each returns GitHub repo slugs plus a hint of where they were seen.
 * Sources are best-effort: a failing source logs a warning and contributes nothing.
 */
import { rest } from "../lib/github.ts";
import { groundedSearch } from "../lib/llm.ts";

export type Candidate = { repo: string; via: string };

const NOT_REPOS = new Set(["orgs", "topics", "sponsors", "features", "settings", "marketplace", "collections", "about", "apps"]);

/** Find owner/name slugs in free text (URLs like github.com/owner/name). */
export function githubSlugs(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/github\.com\/([\w-]+)\/([\w.-]+)/gi)) {
    const owner = m[1]!;
    const name = m[2]!.replace(/[.]+$/, "").replace(/\.git$/, "");
    if (!NOT_REPOS.has(owner.toLowerCase()) && name) out.add(`${owner}/${name}`);
  }
  return [...out];
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** GitHub repository search over names, descriptions and topics that recomps tend to use. */
export async function fromGitHubSearch(days: number): Promise<Candidate[]> {
  const since = daysAgo(days);
  const queries = [
    `recomp in:name fork:false pushed:>${since} stars:>=10`,
    `recompiled in:name fork:false pushed:>${since} stars:>=10`,
    `"static recompilation" in:description,readme fork:false pushed:>${since} stars:>=10`,
    `"pc port" in:description fork:false pushed:>${since} stars:>=20`,
    `"native port" in:description fork:false pushed:>${since} stars:>=20`,
    `topic:n64recomp fork:false pushed:>${since}`,
    `topic:static-recompilation fork:false pushed:>${since}`,
    `topic:rexglue fork:false pushed:>${since}`,
  ];
  const out: Candidate[] = [];
  for (const q of queries) {
    try {
      const res = await rest<{ items: { full_name: string }[] }>(
        `/search/repositories?q=${encodeURIComponent(q)}&sort=updated&per_page=100`,
      );
      out.push(...res.items.map((i) => ({ repo: i.full_name, via: `GitHub search: ${q.split(" fork:")[0]}` })));
    } catch (err) {
      console.warn(`  [github-search] ${q}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Hacker News stories (via the Algolia API) that link to GitHub repos. */
export async function fromHackerNews(days: number): Promise<Candidate[]> {
  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const out: Candidate[] = [];
  for (const q of ["recompilation", "recompiled", "static recompilation", "pc port"]) {
    try {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=100`;
      const res = (await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).json()) as {
        hits: { url?: string; story_text?: string; objectID: string }[];
      };
      for (const h of res.hits) {
        for (const repo of githubSlugs(`${h.url ?? ""} ${h.story_text ?? ""}`)) {
          out.push({ repo, via: `Hacker News https://news.ycombinator.com/item?id=${h.objectID}` });
        }
      }
    } catch (err) {
      console.warn(`  [hn] ${q}: ${(err as Error).message}`);
    }
  }
  return out;
}

/** Gemini + Google Search grounding: news, forums and videos outside GitHub. Needs GEMINI_API_KEY. */
export async function fromWebSearch(days: number): Promise<Candidate[]> {
  const text = await groundedSearch(
    `Find GitHub repositories of playable static recompilations or source ports of console or classic PC games ` +
      `(for example N64: Recompiled, XenonRecomp or ReXGlue based projects, or decompilation-based PC ports) that were ` +
      `announced or had a downloadable release in the last ${days} days. Search news sites, Reddit, forums and video ` +
      `descriptions. Answer with a plain list of full https://github.com/owner/repo URLs, one per line, nothing else.`,
  );
  if (!text) return [];
  return githubSlugs(text).map((repo) => ({ repo, via: "web search (Gemini grounding)" }));
}
