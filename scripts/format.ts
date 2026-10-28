/** Rewrite data/projects.yaml into its canonical layout. `--check` only reports (for CI). */
import { readFileSync, writeFileSync } from "node:fs";
import { loadProjects, PROJECTS_PATH } from "../data/load.ts";
import { formatProjects } from "./lib/format.ts";

const formatted = formatProjects(loadProjects());
const current = readFileSync(PROJECTS_PATH, "utf8");
if (process.argv.includes("--check")) {
  if (formatted !== current) {
    console.error("data/projects.yaml is not formatted — run `npm run format`.");
    process.exit(1);
  }
  console.log("data/projects.yaml is formatted.");
} else if (formatted !== current) {
  writeFileSync(PROJECTS_PATH, formatted);
  console.log("Formatted data/projects.yaml.");
}
