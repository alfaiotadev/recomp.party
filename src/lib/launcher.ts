import { available, type Entry } from "./data.ts";

/**
 * Where the listed games stand in RecompLauncher (data/launcher.json), most support first. An ordinal ramp of
 * RecompLauncher's cyan, validated for the dark surface (monotone lightness, one hue); "not there" has no colour:
 * it is drawn as the empty track.
 */
export const LAUNCHER_LEVELS = [
  { id: "own", name: "1-click, developer's own setup", short: "Developer's own", color: "#34f2e8", ink: "#0b0d14", test: (e: Entry) => Boolean(e.launcher?.easy && e.launcher.own) },
  { id: "rl", name: "1-click, set up by RecompLauncher", short: "By RecompLauncher", color: "#22aaa6", ink: "#0b0d14", test: (e: Entry) => Boolean(e.launcher?.easy && !e.launcher.own) },
  { id: "listed", name: "In the catalog, set up by hand", short: "Set up by hand", color: "#1a6f73", ink: "#e8ecf6", test: (e: Entry) => Boolean(e.launcher && !e.launcher.easy) },
  { id: "none", name: "Not in RecompLauncher", short: "Not listed", color: "", ink: "var(--muted)", test: (e: Entry) => !e.launcher },
] as const;

/** Every game you can get now, split by those levels. */
export const launcherParts = () => {
  const total = available.length;
  return LAUNCHER_LEVELS.map((l) => {
    const n = available.filter(l.test).length;
    return { ...l, n, share: n / total };
  });
};
