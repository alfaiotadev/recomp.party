/**
 * Tiny OpenAI-compatible chat client with a provider fallback chain.
 *
 * (GitHub Models was retired on 2026-07-30; its endpoint now answers 200 "OK" without running a model.)
 * Every provider below exposes /chat/completions with the same request shape and has a free tier.
 * Providers whose key is not set are skipped; on rate limits, errors or unusable output the next one
 * is tried. With no keys at all, `chatJSON` returns null and callers fall back to heuristics.
 */
import type { z } from "zod";

type Provider = { name: string; url: string; model: string; key: string | undefined };

function providers(): Provider[] {
  const env = process.env;
  const list: Provider[] = [
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: env.GEMINI_MODEL ?? "gemini-3.5-flash",
      key: env.GEMINI_API_KEY,
    },
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      key: env.GROQ_API_KEY,
    },
    {
      name: "mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
      // Free "Experiment" keys hit 429 on small/medium quickly; ministral answers reliably.
      model: env.MISTRAL_MODEL ?? "ministral-14b-latest",
      key: env.MISTRAL_API_KEY,
    },
    {
      name: "nvidia",
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: env.NVIDIA_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b",
      key: env.NVIDIA_API_KEY,
    },
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      // "openrouter/free" routes to whichever free model is up; slower (~10 s) but resilient.
      model: env.OPENROUTER_MODEL ?? "openrouter/free",
      key: env.OPENROUTER_API_KEY,
    },
    {
      name: "cloudflare",
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

/** Providers that hit a rate limit are skipped for the rest of the run. */
const exhausted = new Set<string>();

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
    if (exhausted.has(p.name)) continue;
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
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429) {
        exhausted.add(p.name);
        console.warn(`  [llm] ${p.name}: rate limited, skipping for this run`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = schema.safeParse(extractJSON(body.choices?.[0]?.message?.content ?? ""));
      if (!parsed.success) throw new Error(`reply failed validation: ${parsed.error.issues[0]?.message}`);
      return { data: parsed.data, provider: `${p.name}/${p.model}` };
    } catch (err) {
      console.warn(`  [llm] ${p.name}: ${(err as Error).message}`);
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
