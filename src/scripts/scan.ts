/** Header countdown to the next daily discovery run (see src/lib/discovery.ts). */
for (const el of document.querySelectorAll<HTMLElement>("[data-scan]")) {
  const { hour, minute, run } = JSON.parse(el.dataset.scan!) as { hour: number; minute: number; run: number };
  const out = el.querySelector<HTMLElement>(".scan-t")!;
  const pad = (n: number) => String(n).padStart(2, "0");
  const tick = () => {
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute);
    const since = now.getTime() - today;
    const running = since >= 0 && since < run * 60_000;
    el.classList.toggle("running", running);
    if (running) {
      out.textContent = "scanning…";
      return;
    }
    const next = since < 0 ? today : today + 86_400_000;
    const s = Math.floor((next - now.getTime()) / 1000);
    out.textContent = `T-${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  };
  tick();
  setInterval(tick, 1000);
}
