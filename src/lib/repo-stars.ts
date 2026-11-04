/** This site's own GitHub repo and its star count, read once per build (undefined if GitHub can't be reached). */
import { SITE_REPO } from "../../data/load.ts";

export { SITE_REPO };

async function stars(): Promise<number | undefined> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(`https://api.github.com/repos/${SITE_REPO}`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? ((await res.json()) as { stargazers_count: number }).stargazers_count : undefined;
  } catch {
    return undefined;
  }
}

export const siteStars = await stars();
/** Below this the count would look lonely: the button just says "Star". */
export const SHOW_STARS_FROM = 10;
