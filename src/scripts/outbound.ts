/**
 * Count clicks on links that leave the site as GoatCounter events, so the dashboard shows which projects
 * people actually open. GitHub links are grouped per repo ("out/owner/repo", "out/owner/repo/releases"),
 * anything else per host ("out/en.wikipedia.org").
 */
declare global {
  interface Window {
    goatcounter?: { count(vars: { path: string; title?: string; event?: boolean }): void };
  }
}

function track(ev: MouseEvent) {
  if (ev.type === "auxclick" && ev.button !== 1) return;
  const a = (ev.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.host === location.host) return;
  const m = a.host === "github.com" ? a.pathname.match(/^\/([^/]+\/[^/]+)(\/releases)?/) : null;
  const path = m ? `out/${m[1]}${m[2] ?? ""}` : `out/${a.host}`;
  window.goatcounter?.count({ path, title: a.textContent?.trim().slice(0, 100), event: true });
}

document.addEventListener("click", track);
document.addEventListener("auxclick", track); // middle-click opens a new tab without a "click"

export {};
