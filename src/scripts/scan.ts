/**
 * Header badge for the daily discovery run (see src/lib/discovery.ts). GitHub starts scheduled runs
 * hours late, so the badge reads the real run state from the GitHub API (unauthenticated, cached for the
 * session) and only counts down by the clock:
 *   scanning…   a discovery run is queued or in progress
 *   queued      today's scheduled time has passed but GitHub has not started the run yet (it often
 *               lags hours behind, so no overdue counter)
 *   T-…         countdown to the next scheduled run
 */
const API = "https://api.github.com/repos/alfaiotadev/recomp.party/actions/workflows/discover.yml/runs?per_page=5";
const CACHE = "recomp.scan";
const TTL = 2 * 60_000;

type Run = { event: string; status: string; created_at: string };
type State = { running: boolean; lastScheduled: number };

async function runState(): Promise<State> {
  const hit = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as ({ at: number } & State) | null;
  if (hit && Date.now() - hit.at < TTL) return hit;
  const res = await fetch(API, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const runs = ((await res.json()) as { workflow_runs: Run[] }).workflow_runs;
  const state: State = {
    running: runs.some((r) => r.status !== "completed"),
    lastScheduled: Date.parse(runs.find((r) => r.event === "schedule")?.created_at ?? "") || 0,
  };
  sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), ...state }));
  return state;
}

for (const el of document.querySelectorAll<HTMLElement>("[data-scan]")) {
  const { hour, minute } = JSON.parse(el.dataset.scan!) as { hour: number; minute: number };
  const label = el.querySelector<HTMLElement>(".scan-label")!;
  const out = el.querySelector<HTMLElement>(".scan-t")!;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  };
  // Unknown until the API answers (or for good, if it is rate-limited): then the badge just counts down.
  let state: State | undefined;
  const refresh = () =>
    runState()
      .then((s) => {
        state = s;
        tick();
      })
      .catch(() => {});

  const tick = () => {
    const now = Date.now();
    const d = new Date(now);
    const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
    const running = Boolean(state?.running);
    const due = !running && state !== undefined && now >= today && state.lastScheduled < today;
    el.classList.toggle("running", running);
    el.classList.toggle("due", due);
    if (running) {
      out.textContent = "scanning…";
    } else if (due) {
      out.textContent = "queued at GitHub";
    } else {
      label.textContent = "next scan";
      out.textContent = `T-${clock((now < today ? today : today + 86_400_000) - now)}`;
    }
  };

  tick();
  refresh();
  setInterval(tick, 1000);
  setInterval(refresh, TTL);
}

export {}; // module scope: review.ts declares the same names
