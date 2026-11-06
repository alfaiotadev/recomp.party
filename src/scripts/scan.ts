/**
 * Header badge for the daily discovery run (see src/lib/discovery.ts). GitHub starts scheduled runs
 * hours late, so the badge reads the real run state from the GitHub API (unauthenticated, cached for the
 * session) and only counts down by the clock:
 *   scanning…   a discovery run is queued or in progress
 *   queued      the run is later than GitHub usually is, and still hasn't started
 *   T-…         countdown to when the next run is expected: the cron time plus GitHub's usual lag, learned
 *               from the recent scheduled runs (it has been starting them 7-8 hours late)
 */
const API = "https://api.github.com/repos/alfaiotadev/recomp.party/actions/workflows/discover.yml/runs?per_page=15";
const CACHE = "recomp.scan";
const TTL = 2 * 60_000;

type Run = { event: string; status: string; created_at: string };
/** lag: how late GitHub usually starts the scheduled run (median of recent ones), in ms */
type State = { running: boolean; lastScheduled: number; lag: number };

const DAY = 86_400_000;
const MAX_LAG = 20 * 3_600_000;

async function runState(hour: number, minute: number): Promise<State> {
  const hit = JSON.parse(sessionStorage.getItem(CACHE) ?? "null") as ({ at: number } & State) | null;
  if (hit && Date.now() - hit.at < TTL) return hit;
  const res = await fetch(API, { headers: { accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const runs = ((await res.json()) as { workflow_runs: Run[] }).workflow_runs;
  const lags = runs
    .filter((r) => r.event === "schedule")
    .map((r) => {
      const t = Date.parse(r.created_at);
      const d = new Date(t);
      let cron = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
      if (cron > t) cron -= DAY; // started after midnight UTC: it belonged to the day before
      return t - cron;
    })
    .filter((l) => l >= 0 && l < MAX_LAG)
    .sort((a, b) => a - b);
  const state: State = {
    running: runs.some((r) => r.status !== "completed"),
    lastScheduled: Date.parse(runs.find((r) => r.event === "schedule")?.created_at ?? "") || 0,
    lag: lags.length ? lags[Math.floor(lags.length / 2)]! : 0,
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
    runState(hour, minute)
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
    const lag = state?.lag ?? 0;
    // has today's run (or, before today's cron time, yesterday's) already happened?
    const cron = now >= today ? today : today - DAY;
    const done = state === undefined || state.lastScheduled >= cron;
    const expected = done ? cron + DAY + lag : cron + lag;
    // half an hour of grace past the usual lag before calling it queued
    const due = !running && !done && now >= expected + 30 * 60_000;
    el.classList.toggle("running", running);
    el.classList.toggle("due", due);
    if (running) {
      out.textContent = "scanning…";
    } else if (due) {
      out.textContent = "queued at GitHub";
    } else {
      label.textContent = "next scan";
      // past the usual start, inside the grace half hour
      out.textContent = now >= expected ? "any minute" : `T-${clock(expected - now)}`;
    }
  };

  tick();
  refresh();
  setInterval(tick, 1000);
  setInterval(refresh, TTL);
}

export {}; // module scope: review.ts declares the same names
