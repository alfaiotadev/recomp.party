/**
 * Which AI model or coding agent a commit credits, read from what the commit itself says: Co-authored-by
 * trailers (Claude Code writes the exact model, e.g. "Claude Opus 5.5 <noreply@anthropic.com>") and
 * agent bot authors. Pure and network-free, so it can be checked against saved commits.
 */

export type Vendor = "anthropic" | "openai" | "google" | "github" | "cursor" | "other";

export type Credit = {
  /** Display name: the model if the commit names one ("Claude Opus 5.5"), else the agent ("Codex"). */
  model: string;
  vendor: Vendor;
  /** The agent or app, when the commit tells it apart from the model. */
  tool?: string;
  /** False when the commit names only the agent; the model then stays unknown. */
  versioned: boolean;
};

export type CommitIn = { message: string; author?: { email?: string | null; name?: string | null; login?: string | null } };

const TRAILER = /^co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/gim;

/** "Claude Opus 5 (1M context)" → "Claude Opus 5"; "GPT-6.1-Sol" → "GPT-6.1 Sol". */
function cleanModel(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^(GPT-[\d.]+)-(\w+)$/i, "$1 $2")
    .trim();
}

/** One identity (trailer or commit author) → what it credits, or undefined for a person. */
export function identify(name: string, email: string, login = ""): Credit | undefined {
  const mail = email.toLowerCase();
  const who = `${login} ${name}`.toLowerCase();
  const domain = mail.split("@")[1] ?? "";

  if (domain === "anthropic.com" || domain === "anthropic.local" || /^claude(\[bot\])?$/.test(login.toLowerCase())) {
    const model = cleanModel(name);
    if (/^claude (opus|sonnet|haiku|fable|mythos)\b/i.test(model)) return { model, vendor: "anthropic", tool: "Claude Code", versioned: true };
    return { model: "Claude", vendor: "anthropic", tool: "Claude Code", versioned: false };
  }
  if (domain === "openai.com" || mail === "codex@localhost" || /chatgpt-codex-connector/.test(who)) {
    const model = cleanModel(name);
    if (/^(gpt|o\d)[-\s]?[\d.]/i.test(model)) return { model, vendor: "openai", tool: "Codex", versioned: true };
    return { model: "Codex", vendor: "openai", tool: "Codex", versioned: false };
  }
  if (domain === "google.com" && /gemini/.test(who)) return { model: "Gemini", vendor: "google", tool: "Gemini CLI", versioned: false };
  if (/google-labs-jules/.test(who)) return { model: "Jules", vendor: "google", tool: "Jules", versioned: false };
  if (/\+copilot@users\.noreply\.github\.com$/.test(mail) || /copilot-swe-agent|^copilot\b/.test(who.trim()))
    return { model: "GitHub Copilot", vendor: "github", tool: "GitHub Copilot", versioned: false };
  if (domain === "cursor.com") return { model: "Cursor", vendor: "cursor", tool: "Cursor", versioned: false };
  if (domain === "codebuff.com") return { model: "Codebuff", vendor: "other", tool: "Codebuff", versioned: false };
  if (domain === "commandcode.ai") return { model: "Command Code", vendor: "other", tool: "Command Code", versioned: false };
  if (/devin-ai-integration/.test(who)) return { model: "Devin", vendor: "other", tool: "Devin", versioned: false };
  return undefined;
}

/** Every model or agent a commit credits, each once. */
export function creditsOf(c: CommitIn): Credit[] {
  const out = new Map<string, Credit>();
  const add = (cr: Credit | undefined) => cr && !out.has(cr.model) && out.set(cr.model, cr);
  for (const m of c.message.matchAll(TRAILER)) add(identify(m[1]!, m[2]!));
  if (c.author) add(identify(c.author.name ?? "", c.author.email ?? "", c.author.login ?? ""));
  // a bare "Claude" or "Codex" next to a named model of the same vendor is the same contribution
  const named = new Set([...out.values()].filter((cr) => cr.versioned).map((cr) => cr.vendor));
  return [...out.values()].filter((cr) => cr.versioned || !named.has(cr.vendor));
}

/** Agent instruction files in a repo's root, a hint that an agent was used even with no credited commits. */
export const AGENT_FILES: Record<string, string> = {
  "CLAUDE.md": "Claude Code",
  ".claude": "Claude Code",
  "AGENTS.md": "AGENTS.md (Codex and others)",
  ".codex": "Codex",
  "GEMINI.md": "Gemini CLI",
  ".gemini": "Gemini CLI",
  ".cursor": "Cursor",
  ".cursorrules": "Cursor",
  ".windsurfrules": "Windsurf",
  ".clinerules": "Cline",
};
