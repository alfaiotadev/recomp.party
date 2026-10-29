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
