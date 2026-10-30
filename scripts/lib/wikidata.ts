/** Minimal Wikidata clients. Wikimedia asks for a descriptive User-Agent with contact info. */
const UA = "recomp.party/1.0 (https://recomp.party; https://github.com/alfaiotadev/recomp.party)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function wikidataApi(params: Record<string, string>, tries = 4): Promise<any> {
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: "json", maxlag: "5" })}`;
  for (let attempt = 1; ; attempt++) {
    await sleep(250); // stay well under the anonymous rate limit
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const body = res.ok ? await res.json() : undefined;
    if (body && !body.error) return body;
    const why = body?.error ? `${body.error.code}: ${body.error.info}` : `HTTP ${res.status}`;
    if (attempt >= tries) throw new Error(`Wikidata API ${why} (${url})`);
    await sleep(2000 * attempt);
  }
}

/** Run a SPARQL query against the Wikidata Query Service; returns the result bindings. */
export async function sparql(query: string): Promise<Record<string, { value: string }>[]> {
  const res = await fetch("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL ${res.status}: ${await res.text()}`);
  return (await res.json()).results.bindings;
}

export type WikidataCandidate = { id: string; label: string; description: string; igdb?: string; year?: string };

/** Search Wikidata for a game title; keep items that look like games (IGDB id or "video game" in the description). */
export async function wikidataCandidates(title: string): Promise<WikidataCandidate[]> {
  const search = await wikidataApi({ action: "wbsearchentities", search: title, language: "en", type: "item", limit: "8" });
  const ids: string[] = search.search.map((s: { id: string }) => s.id);
  if (!ids.length) return [];
  const got = await wikidataApi({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims", languages: "en|mul" });
  return ids
    .map((id) => {
      const e = got.entities[id];
      const claim = (p: string) => e.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
      return {
        id,
        label: e.labels?.en?.value ?? e.labels?.mul?.value ?? "",
        description: e.descriptions?.en?.value ?? "",
        igdb: claim("P5794") as string | undefined,
        year: (claim("P577") as { time?: string } | undefined)?.time?.slice(1, 5),
      };
    })
    .filter((c) => c.igdb || /video game/i.test(c.description));
}

/** Loose title key: case, accents, punctuation, a leading "The" and a trailing "(…)" don't matter. */
export const titleKey = (s: string) =>
  s
    .replace(/\s*\(.*\)$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
