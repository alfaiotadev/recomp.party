import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { Projects, Rejected, Snapshot, StarHistory, type Project, type Snapshot as SnapshotT } from "./schema.ts";

// Resolved from the repo root rather than import.meta.url: Astro bundles this module into dist/.
export const PROJECTS_PATH = resolve(process.cwd(), "data/projects.yaml");
export const SNAPSHOT_PATH = resolve(process.cwd(), "data/snapshot.json");
export const STARS_PATH = resolve(process.cwd(), "data/stars.json");
export const REJECTED_PATH = resolve(process.cwd(), "data/rejected.yaml");

/** Parse and validate data/projects.yaml; throws a readable error listing every problem. */
export function loadProjects(path = PROJECTS_PATH): Project[] {
  const result = Projects.safeParse(parse(readFileSync(path, "utf8")));
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - [${i.path.join(".")}] ${i.message}`);
    throw new Error(`Invalid ${path}:\n${lines.join("\n")}`);
  }
  return result.data;
}

export function loadSnapshot(path = SNAPSHOT_PATH): SnapshotT {
  if (!existsSync(path)) return { generatedAt: new Date(0).toISOString(), repos: {}, missing: [] };
  return Snapshot.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function loadRejected(path = REJECTED_PATH): Rejected {
  return Rejected.parse(parse(readFileSync(path, "utf8")) ?? []);
}

export function loadStarHistory(path = STARS_PATH): StarHistory {
  if (!existsSync(path)) return {};
  return StarHistory.parse(JSON.parse(readFileSync(path, "utf8")));
}
