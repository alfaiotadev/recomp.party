/**
 * IGDB API client (https://api-docs.igdb.com). Auth is a Twitch app's client credentials:
 * IGDB_CLIENT_ID and IGDB_CLIENT_SECRET. Free for non-commercial use, 4 requests per second.
 */
export type IgdbCover = { slug: string; imageId: string; width: number; height: number };

export function igdbCredentials(): { id: string; secret: string } | undefined {
  const id = process.env.IGDB_CLIENT_ID;
  const secret = process.env.IGDB_CLIENT_SECRET;
  return id && secret ? { id, secret } : undefined;
}

async function token(id: string, secret: string): Promise<string> {
  const params = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Cover image ids for IGDB game slugs. Slugs without a game or a cover are left out. */
export async function igdbCovers(slugs: string[], creds: { id: string; secret: string }): Promise<Map<string, IgdbCover>> {
  const auth = await token(creds.id, creds.secret);
  const out = new Map<string, IgdbCover>();
  for (let i = 0; i < slugs.length; i += 200) {
    const chunk = slugs.slice(i, i + 200);
    const body = `fields slug, cover.image_id, cover.width, cover.height; where slug = (${chunk.map((s) => JSON.stringify(s)).join(",")}); limit 500;`;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: { "Client-ID": creds.id, Authorization: `Bearer ${auth}`, Accept: "application/json" },
      body,
    });
    if (!res.ok) throw new Error(`IGDB ${res.status}: ${await res.text()}`);
    for (const g of (await res.json()) as { slug: string; cover?: { image_id: string; width?: number; height?: number } }[]) {
      if (g.cover?.image_id) out.set(g.slug, { slug: g.slug, imageId: g.cover.image_id, width: g.cover.width ?? 0, height: g.cover.height ?? 0 });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

/** 2x cover (528×748) — enough for a ~260 px wide card on a retina screen. */
export const igdbCoverUrl = (imageId: string) => `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;
