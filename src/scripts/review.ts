/**
 * Header badge: how many pull requests proposing new projects are open (discovery + suggestions).
 * Read live from the GitHub API (unauthenticated, 60 requests/hour per visitor), cached for two minutes and
 * refreshed while the page is open, so a merged proposal drops out without a reload.
 */
const API = "https://api.github.com/repos/alfaiotadev/recomp.party/pulls?state=open&per_page=100";
const CACHE = "recomp.review";
const TTL = 2 * 60_000;

type Pr = { title: string; labels: { name: string }[] };

async function openCandidates(): Promise<string[]> {
  const hit = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as { at: number; titles: string[] } | null;
  if (hit && Date.now() - hit.at < TTL) return hit.titles;
  const res = await fetch(API, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const titles = ((await res.json()) as Pr[])
    .filter((pr) => pr.labels.some((l) => l.name === "discovery" || l.name === "suggestion"))
    .map((pr) => pr.title);
  sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), titles }));
  return titles;
}

const el = document.querySelector<HTMLElement>("[data-review]");
if (el) {
  const show = (titles: string[]) => {
    el.hidden = !titles.length;
    if (!titles.length) return;
    el.querySelector(".review-n")!.textContent = String(titles.length);
    el.title = `Open pull requests proposing new projects, waiting for review:\n${titles.map((t) => `• ${t}`).join("\n")}`;
    el.setAttribute("aria-label", `${titles.length} project ${titles.length === 1 ? "proposal" : "proposals"} in review`);
  };
  const refresh = () => openCandidates().then(show).catch(() => {}); // rate-limited or offline: keep what's shown
  refresh();
  setInterval(refresh, TTL);
}
