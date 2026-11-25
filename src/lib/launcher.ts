import { available, type Entry } from "./data.ts";

/**
 * Where the listed games stand in RecompLauncher (data/launcher.json), most support first. Pastel traffic lights
 * and a grey, checked on the dark surface: every pair that touches in the bar or the ring (grey wraps round to
 * green) stays apart under protan/deutan simulation; green and red never touch, yellow is between them.
 */
export const LAUNCHER_LEVELS = [
  { id: "own", name: "1-click, developer's own setup", short: "Developer's own", color: "#3fb98a", ink: "#0b0d14", test: (e: Entry) => Boolean(e.launcher?.easy && e.launcher.own) },
  { id: "rl", name: "1-click, set up by RecompLauncher", short: "By RecompLauncher", color: "#f5d46a", ink: "#0b0d14", test: (e: Entry) => Boolean(e.launcher?.easy && !e.launcher.own) },
  { id: "listed", name: "In the catalog, set up by hand", short: "Set up by hand", color: "#ef8d84", ink: "#0b0d14", test: (e: Entry) => Boolean(e.launcher && !e.launcher.easy) },
  { id: "none", name: "Not in RecompLauncher", short: "Not listed", color: "#5c6378", ink: "#e8ecf6", test: (e: Entry) => !e.launcher },
] as const;

/** Every game you can get now, split by those levels. */
export const launcherParts = () => {
  const total = available.length;
  return LAUNCHER_LEVELS.map((l) => {
    const n = available.filter(l.test).length;
    return { ...l, n, share: n / total };
  });
};
