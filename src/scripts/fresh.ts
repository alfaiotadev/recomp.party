/**
 * Header badge: how long ago the GitHub data was fetched, as hh:mm. Fetches run every six hours, so past
 * seven hours the badge turns amber: a run was missed or failed.
 */
const STALE_H = 7;

for (const el of document.querySelectorAll<HTMLElement>("[data-fresh]")) {
  const at = Date.parse(el.dataset.fresh!);
  const out = el.querySelector<HTMLElement>(".fresh-t")!;
  const pad = (n: number) => String(n).padStart(2, "0");
  const tick = () => {
    const min = Math.max(0, Math.floor((Date.now() - at) / 60_000));
    out.textContent = `${pad(Math.floor(min / 60))}:${pad(min % 60)} ago`;
    el.classList.toggle("stale", min >= STALE_H * 60);
  };
  tick();
  setInterval(tick, 15_000);
}

export {}; // module scope, like the other header scripts
