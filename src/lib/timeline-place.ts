/**
 * Vertical placement of the swimlane timeline: lanes stacked, rows in sort order, a game's projects
 * listed under its group row while the group is open. Pure and DOM-free: the build uses it for the
 * first paint and the browser reruns it when the sort changes or a group opens or closes.
 */
export const ROW_H = 18;
export const LANE_PAD = 6;
export const MIN_LANE_H = 58; // room for the platform logo + project count
export const AXIS_H = 30; // also hosts the sort control above the name column

export type Ranks = Record<string, number>;
export type PlaceItem = { id: string; ranks: Ranks; children?: { id: string; ranks: Ranks }[] };
export type PlaceLane = { items: PlaceItem[] };

export type Placement = {
  /** Row centre per row id; a closed group's children sit on the group row. */
  y: Record<string, number>;
  /** Children of closed groups. */
  hidden: Set<string>;
  lanes: { y: number; height: number }[];
  height: number;
};

const byRank = (sort: string) => (a: { ranks: Ranks }, b: { ranks: Ranks }) => a.ranks[sort]! - b.ranks[sort]!;

export function place(lanes: PlaceLane[], sort: string, open: (id: string) => boolean): Placement {
  const out: Placement = { y: {}, hidden: new Set(), lanes: [], height: 0 };
  let y = AXIS_H;
  for (const lane of lanes) {
    const laneY = y;
    y += LANE_PAD;
    for (const item of [...lane.items].sort(byRank(sort))) {
      const rowY = y + ROW_H / 2;
      out.y[item.id] = rowY;
      y += ROW_H;
      if (!item.children) continue;
      const isOpen = open(item.id);
      for (const child of [...item.children].sort(byRank(sort))) {
        if (isOpen) {
          out.y[child.id] = y + ROW_H / 2;
          y += ROW_H;
        } else {
          out.y[child.id] = rowY;
          out.hidden.add(child.id);
        }
      }
    }
    y = Math.max(y + LANE_PAD, laneY + MIN_LANE_H);
    out.lanes.push({ y: laneY, height: y - laneY });
  }
  out.height = y + 4;
  return out;
}
