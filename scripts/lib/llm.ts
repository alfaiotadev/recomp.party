/**
 * Tiny OpenAI-compatible chat client with a provider fallback chain.
 *
 * (GitHub Models was retired on 2026-07-30; its endpoint now answers 200 "OK" without running a model.)
 * Every provider below exposes /chat/completions with the same request shape and has a free tier.
 * Providers whose key is not set are skipped. Requests are paced per provider; a per-minute 429 waits
 * and retries the same provider, a daily-quota 429 or repeated failures move on to the next one.
 * Order matters: earlier providers gave better classifications in testing (2026-10-28). With no keys at all, `chatJSON` returns null and callers fall back to heuristics.
 */
import type { z } from "zod";

/** `minGapMs` paces requests to stay under the free tier's per-minute limit. */
type Provider = { name: string; url: string; model: string; key: string | undefined; minGapMs: number };

function providers(): Provider[] {
  const env = process.env;
  const list: Provider[] = [
    {
      name: "gemini",
      minGapMs: 4500,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: env.GEMINI_MODEL ?? "gemini-3.5-flash",
      key: env.GEMINI_API_KEY,
    },
    {
      name: "groq",
      minGapMs: 2500,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      key: env.GROQ_API_KEY,
    },
    {
      name: "nvidia",
      minGapMs: 1500,
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b",
      key: env.NVIDIA_API_KEY,
    },
    {
      name: "openrouter",
      minGapMs: 3500,
      url: "https://openrouter.ai/api/v1/chat/completions",
      // "openrouter/free" routes to whichever free model is up; slower (~10 s) but resilient.
      model: env.OPENROUTER_MODEL ?? "openrouter/free",
      key: env.OPENROUTER_API_KEY,
    },
    {
      name: "mistral",
      minGapMs: 1500,
      url: "https://api.mistral.ai/v1/chat/completions",
      // Free "Experiment" keys hit 429 on small/medium quickly; ministral answers reliably.
      model: env.MISTRAL_MODEL ?? "ministral-14b-latest",
      key: env.MISTRAL_API_KEY,
    },
    {
      name: "cloudflare",
      minGapMs: 1000,
      url: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
      model: env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      key: env.CLOUDFLARE_ACCOUNT_ID ? env.CLOUDFLARE_AI_TOKEN : undefined,
    },
  ];
  const only = env.LLM_PROVIDERS?.split(",").map((s) => s.trim());
  return list.filter((p) => p.key && (!only || only.includes(p.name)));
}

export function llmAvailable(): boolean {
  return providers().length > 0;
}

/** Providers that ran out of quota (or kept failing) are skipped for the rest of the run. */
const exhausted = new Set<string>();
const lastCall = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds to wait from a 429: Retry-After header, Gemini's retryDelay, or "try again in 12.3s" text. */
function retryAfter(res: Response, body: string): number | null {
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) return header;
  const m = body.match(/retryDelay"?\s*:\s*"([\d.]+)s"/) ?? body.match(/(?:try again|retry) in ([\d.]+)\s*s/i);
  return m ? Number(m[1]) : null;
}

const isDailyQuota = (body: string) => /per ?day|daily|PerDay|quota exceeded for.*day/i.test(body);

/** Pull the first JSON object out of a reply, tolerating ```json fences and chatter around it. */
function extractJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function chatJSON<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; provider: string } | null> {
  for (const p of providers()) {
    for (let attempt = 0; attempt < 3 && !exhausted.has(p.name); attempt++) {
      const wait = (lastCall.get(p.name) ?? 0) + p.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastCall.set(p.name, Date.now());
      try {
        const res = await fetch(p.url, {
          method: "POST",
          headers: { authorization: `Bearer ${p.key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: p.model,
            temperature: 0,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: AbortSignal.timeout(90_000),
        });
        if (res.status === 429) {
          const text = await res.text();
          const secs = retryAfter(res, text);
          if (isDailyQuota(text) || (secs ?? 20) > 90 || attempt === 2) {
            exhausted.add(p.name);
            console.warn(`  [llm] ${p.name}: quota exhausted, skipping for this run`);
            break;
          }
          console.warn(`  [llm] ${p.name}: rate limited, waiting ${Math.ceil(secs ?? 20)} s`);
          await sleep((secs ?? 20) * 1000 + 500);
          continue;
        }
        if (res.status >= 500) throw new Error(`HTTP ${res.status}`); // overloaded: try the next provider
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const parsed = schema.safeParse(extractJSON(body.choices?.[0]?.message?.content ?? ""));
        if (!parsed.success) throw new Error(`reply failed validation: ${parsed.error.issues[0]?.message}`);
        return { data: parsed.data, provider: `${p.name}/${p.model}` };
      } catch (err) {
        console.warn(`  [llm] ${p.name}: ${(err as Error).message}`);
        break;
      }
    }
  }
  return null;
}
/**
 * Ask Gemini with Google Search grounding and return the answer text. Grounding may need a billed
 * Google AI project (free keys get 429 RESOURCE_EXHAUSTED); in that case the source just yields nothing.
 * Used only to surface candidate URLs; everything it returns is re-verified against GitHub.
 */
export async function groundedSearch(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_SEARCH_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    console.warn(`  [search] gemini: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return body.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("\n") ?? null;
}
