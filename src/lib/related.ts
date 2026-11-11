/** "More like this" on a game page: other listed games scored on what Wikidata says about the originals. */
import { games, type Entry } from "./data.ts";

const baseName = (g: Entry) => g.game.replace(/ \(.*\)$/, "");
const sameGame = (a: Entry, b: Entry) => (a.wikidata && a.wikidata === b.wikidata) || baseName(a) === baseName(b);

/** Genres shared by many games ("action game") say less than rare ones ("survival horror"): weight by rarity. */
const genreCount = new Map<string, number>();
for (const id of new Set(games.flatMap((g) => (g.wikidata ? [g.wikidata] : [])))) {
  const meta = games.find((g) => g.wikidata === id)!.meta;
  for (const genre of meta?.genres ?? []) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1);
}
const withMeta = new Set(games.filter((g) => g.meta).map((g) => g.wikidata)).size || 1;
const genreWeight = (genre: string) => Math.min(2.5, Math.log(withMeta / (genreCount.get(genre) ?? 1)));

export type Related = { entry: Entry; why: string };

export function moreLikeThis(e: Entry, count = 6): Related[] {
  const m = e.meta;
  if (!m) return [];
  const genres = new Set(m.genres ?? []);
  const series = new Set(m.series ?? []);
  const makers = new Set(m.developers);
  const scored = games
    .filter((g) => g !== e && g.meta && !sameGame(g, e))
    .map((g) => {
      const gm = g.meta!;
      const sharedSeries = (gm.series ?? []).filter((s) => series.has(s));
      const sharedGenres = (gm.genres ?? []).filter((x) => genres.has(x)).sort((a, b) => genreWeight(b) - genreWeight(a));
      const sharedMaker = gm.developers.find((d) => makers.has(d));
      let score = sharedSeries.length ? 4 : 0;
      score += sharedGenres.reduce((n, x) => n + genreWeight(x), 0);
      if (sharedMaker) score += 1.5;
      if (g.platform === e.platform) score += 0.75;
      if (m.year && gm.year && Math.abs(m.year - gm.year) <= 4) score += 0.5;
      const why = sharedSeries[0] ? `${sharedSeries[0]} series` : sharedGenres[0] ?? (sharedMaker ? `by ${sharedMaker}` : "");
      return { entry: g, why, score, stars: g.snap?.stars ?? 0 };
    })
    .filter((r) => r.score >= 2 && r.why)
    .sort((a, b) => b.score - a.score || b.stars - a.stars);
  // one card per original game: its most starred project
  const seen: Entry[] = [];
  const out: Related[] = [];
  for (const r of scored) {
    if (seen.some((s) => sameGame(s, r.entry))) continue;
    seen.push(r.entry);
    out.push({ entry: r.entry, why: r.why });
    if (out.length === count) break;
  }
  return out;
}
