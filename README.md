# recomp.party

A tracker for **playable static recompilations and source ports** of console and classic PC games, at
[recomp.party](https://recomp.party).

New recomps are appearing every week — N64: Recompiled projects, Xbox 360 recomps built with XenonRecomp or
ReXGlue, PS2, PSP, Switch… recomp.party keeps one plain list of the ones you can actually download and run, plus a
timeline (one lane per original platform) of how the scene is moving.

## What gets listed

- A **game-specific static recompilation or source port** with at least one **published release**.
- **Recompiler toolchains** those projects are built with (on the Toolchains page).
- Not listed: decompilation progress (no percentages, no leaderboards), emulators, mods, ROMs or game files.
  When a port builds on a decompilation, its page credits it via `based_on`.

## Suggest a project / opt out

- [Suggest a project](../../issues/new?template=suggest-project.yml) — a bot checks it and opens a pull request.
- Maintainers: [correction or opt-out](../../issues/new?template=opt-out.yml). Opted-out repos go to
  `data/rejected.yaml` so they are never proposed again.
- Or edit [`data/projects.yaml`](data/projects.yaml) directly in a pull request (then `npm run format`).

## How it works

```
data/projects.yaml  ← curated list (human-merged only)
        │  Fetch data (every 6 h): GitHub GraphQL → data/snapshot.json
        ▼
Astro static build  →  GitHub Pages  →  recomp.party
```

| Workflow | When | What |
|---|---|---|
| `fetch.yml` | every 6 h | refresh `data/snapshot.json` (releases, stars, activity) and commit it |
| `deploy.yml` | push to main, after fetch | validate, build with Astro, deploy to GitHub Pages |
| `discover.yml` | weekly | find candidates (GitHub search, Hacker News, web search), classify with an LLM, open a PR |
| `suggestion.yml` | issue labeled `suggestion` | classify the suggested repo, open a PR, reply on the issue |
| `ci.yml` | pull requests | validate data, type-check, build |

### AI-assisted discovery

`scripts/lib/llm.ts` talks to any OpenAI-compatible endpoint and walks a chain of free tiers, skipping providers
without a key and falling back on rate limits. Add at least one key as an Actions secret; with none, discovery
still runs but only reports candidates for manual review.

| Provider | Secret(s) | Default model (override with env) |
|---|---|---|
| Google Gemini | `GEMINI_API_KEY` (also web search via Google Search grounding — needs a billed project) | `gemini-3.5-flash` (`GEMINI_MODEL`) |
| Groq | `GROQ_API_KEY` | `openai/gpt-oss-120b` (`GROQ_MODEL`) |
| Mistral | `MISTRAL_API_KEY` | `ministral-14b-latest` (`MISTRAL_MODEL`) |
| NVIDIA | `NVIDIA_API_KEY` | `nvidia/nemotron-3.5-lightning-30b-a3b` (`NVIDIA_MODEL`) |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/free` (`OPENROUTER_MODEL`) |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_TOKEN` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (`CLOUDFLARE_MODEL`) |

Ground rules: README text and web results are untrusted input — the model only returns a JSON verdict that is
schema-validated, and the result is always a pull request a human merges. Secrets are only exposed to scheduled,
manual and issue-triggered workflows, never to pull requests.

## Development

```sh
npm ci
GITHUB_TOKEN=$(gh auth token) npm run fetch   # refresh data/snapshot.json
npm run dev                                   # http://localhost:4321
npm run validate && npm run check && npm run build
GITHUB_TOKEN=$(gh auth token) npm run discover -- --only owner/repo
```

Data model: [`data/schema.ts`](data/schema.ts).

## License

Code: MIT. recomp.party links to projects and hosts no game content; every listed project needs your own legally
obtained copy of the game.
