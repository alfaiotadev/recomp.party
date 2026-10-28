import { OS, type Release, type RepoSnapshot } from "../../data/schema.ts";

const API = "https://api.github.com";

export function token(): string {
  const t = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!t) throw new Error("Set GITHUB_TOKEN (or GH_TOKEN) to call the GitHub API");
  return t;
}

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${token()}`,
    accept: "application/vnd.github+json",
    "user-agent": "recomp.party",
  };
}

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(), ...init.headers } });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type GqlResponse<T> = { data?: T; errors?: { type?: string; path?: (string | number)[]; message: string }[] };

export async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResponse<T>> {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL: ${res.status} ${await res.text()}`);
  return (await res.json()) as GqlResponse<T>;
}

const OS_PATTERNS: [(typeof OS)[number], RegExp][] = [
  ["windows", /(^|[^a-z])(win(dows)?(32|64)?|msvc|mingw)([^a-z]|$)|\.(exe|msi)$/i],
  ["linux", /linux|\.appimage$|\.flatpak(ref)?$|\.deb$|\.rpm$|steam-?deck/i],
  ["macos", /(^|[^a-z])(mac(os)?|osx|darwin|apple|universal2?)([^a-z]|$)|\.dmg$/i],
  ["android", /android|\.apk$/i],
  ["ios", /(^|[^a-z])ios([^a-z]|$)|\.ipa$/i],
];

/** Guess which operating systems a release ships builds for, from its asset file names. */
export function osFromAssets(names: string[]): Release["os"] {
  return OS_PATTERNS.filter(([, re]) => names.some((n) => re.test(n))).map(([os]) => os);
}

const REPO_FIELDS = `
  nameWithOwner description homepageUrl stargazerCount isArchived isFork pushedAt createdAt
  licenseInfo { spdxId }
  releases(first: 5, orderBy: { field: CREATED_AT, direction: DESC }) {
    totalCount
    nodes {
      tagName name url publishedAt isPrerelease isDraft
      releaseAssets(first: 40) { nodes { name downloadCount } }
    }
  }
  history: releases(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
    nodes { publishedAt isPrerelease isDraft }
  }`;

type GqlRepo = {
  nameWithOwner: string;
  description: string | null;
  homepageUrl: string | null;
  stargazerCount: number;
  isArchived: boolean;
  isFork: boolean;
  pushedAt: string;
  createdAt: string;
  licenseInfo: { spdxId: string } | null;
  releases: {
    totalCount: number;
    nodes: {
      tagName: string;
      name: string | null;
      url: string;
      publishedAt: string | null;
      isPrerelease: boolean;
      isDraft: boolean;
      releaseAssets: { nodes: { name: string; downloadCount: number }[] };
    }[];
  };
  history: { nodes: { publishedAt: string | null; isPrerelease: boolean; isDraft: boolean }[] };
};

function toSnapshot(repo: string, r: GqlRepo): RepoSnapshot {
  const releases = r.releases.nodes
    .filter((n) => !n.isDraft && n.publishedAt)
    .map((n) => {
      const assets = n.releaseAssets.nodes;
      return {
        tag: n.tagName,
        name: n.name?.trim() || null,
        url: n.url,
        publishedAt: n.publishedAt!,
        prerelease: n.isPrerelease,
        os: osFromAssets(assets.map((a) => a.name)),
        downloads: assets.reduce((sum, a) => sum + a.downloadCount, 0),
      };
    });
  return {
    repo,
    canonical: r.nameWithOwner,
    description: r.description,
    homepage: r.homepageUrl || null,
    stars: r.stargazerCount,
    license: r.licenseInfo?.spdxId && r.licenseInfo.spdxId !== "NOASSERTION" ? r.licenseInfo.spdxId : null,
    archived: r.isArchived,
    isFork: r.isFork,
    pushedAt: r.pushedAt,
    createdAt: r.createdAt,
    releases,
    releaseDates: r.history.nodes
      .filter((n) => !n.isDraft && n.publishedAt)
      .map((n) => ({ date: n.publishedAt!, prerelease: n.isPrerelease })),
    releaseCount: r.releases.totalCount,
  };
}

/**
 * Fetch metadata and recent releases for many repos, batching repos per GraphQL query
 * (small batches: release assets make each repo expensive against GitHub's resource limits).
 * Repos that no longer resolve (deleted, DMCA'd, private) are returned in `missing`.
 */
const BATCH = 12;

export async function fetchRepos(repos: string[]): Promise<{ found: RepoSnapshot[]; missing: string[] }> {
  const found: RepoSnapshot[] = [];
  const missing: string[] = [];
  for (let i = 0; i < repos.length; i += BATCH) {
    const batch = repos.slice(i, i + BATCH);
    const query = `query {\n${batch
      .map((slug, j) => {
        const [owner, name] = slug.split("/");
        return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`;
      })
      .join("\n")}\n}`;
    const res = await graphql<Record<string, GqlRepo | null>>(query);
    const unexpected = res.errors?.filter((e) => e.type !== "NOT_FOUND") ?? [];
    if (unexpected.length) throw new Error(`GitHub GraphQL errors (${unexpected.length}): ${JSON.stringify(unexpected.slice(0, 3))}`);
    batch.forEach((slug, j) => {
      const r = res.data?.[`r${j}`];
      if (r) found.push(toSnapshot(slug, r));
      else missing.push(slug);
    });
  }
  return { found, missing };
}

