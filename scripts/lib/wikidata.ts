/** Minimal Wikidata clients. Wikimedia asks for a descriptive User-Agent with contact info. */
const UA = "recomp.party/1.0 (https://recomp.party; https://github.com/alfaiotadev/recomp.party)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function wikidataApi(params: Record<string, string>, tries = 6): Promise<any> {
  // No maxlag: it is meant for bots that edit. These are reads, and with it every lookup failed whenever the
  // query-service replicas fell 5+ s behind (e.g. the 2026-11-02 discovery run).
  const url = `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: "json" })}`;
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

/**
 * Run a SPARQL query against the Wikidata Query Service; returns the result bindings. The service is often
 * overloaded (502/503/429, timeouts), so it retries with a growing pause before giving up.
 */
export async function sparql(query: string, tries = 5): Promise<Record<string, { value: string }>[]> {
  for (let attempt = 1; ; attempt++) {
    let why: string;
    try {
      const res = await fetch("https://query.wikidata.org/sparql", {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return (await res.json()).results.bindings;
      why = `${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status < 500 && res.status !== 429) throw new Error(`Wikidata SPARQL ${why}`); // a bad query: don't retry
    } catch (err) {
      if ((err as Error).message.startsWith("Wikidata SPARQL")) throw err;
      why = (err as Error).message;
    }
    if (attempt >= tries) throw new Error(`Wikidata SPARQL ${why}`);
    console.warn(`  [wikidata] SPARQL ${why.split("\n")[0]}; retrying in ${15 * attempt} s`);
    await sleep(15_000 * attempt);
  }
}

/** platforms: English labels of the item's platforms (P400) */
export type WikidataCandidate = { id: string; label: string; description: string; igdb?: string; year?: string; platforms: string[] };

/** Search Wikidata for a game title; keep items that look like games (IGDB id or "video game" in the description). */
export async function wikidataCandidates(title: string): Promise<WikidataCandidate[]> {
  const search = await wikidataApi({ action: "wbsearchentities", search: title, language: "en", type: "item", limit: "8" });
  const ids: string[] = search.search.map((s: { id: string }) => s.id);
  if (!ids.length) return [];
  const got = await wikidataApi({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims", languages: "en|mul" });
  const platformIds = (e: any): string[] =>
    (e.claims?.P400 ?? []).map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
  const allPlatforms = [...new Set(ids.flatMap((id) => platformIds(got.entities[id])))];
  const platformLabel: Record<string, string> = {};
  for (let i = 0; i < allPlatforms.length; i += 50) {
    const batch = await wikidataApi({ action: "wbgetentities", ids: allPlatforms.slice(i, i + 50).join("|"), props: "labels", languages: "en|mul" });
    for (const [pid, pe] of Object.entries<any>(batch.entities)) platformLabel[pid] = pe.labels?.en?.value ?? pe.labels?.mul?.value ?? pid;
  }
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
        platforms: platformIds(e).map((pid) => platformLabel[pid] ?? pid),
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
