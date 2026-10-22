import type { Point } from '../game/geometry';
import { VIEW } from '../viewSize';

// Four skill slots from the bottom-left and five item slots from the bottom-right fit across the playfield at this gap.
export const TRAY = { x: 32, y: 604, gap: 52, r: 22 } as const;
export const ITEM_TRAY_RIGHT = VIEW.w - TRAY.x;

const BAND_SCALE_MAX = 1.4;
// Room left above and below the rows inside the band.
const BAND_SLACK = 12;

export type TrayPlacement = { scale: number; skills: Point[]; items: Point[] };

// `band` is the height of the letterbox band below the playfield, or null to keep the tray on the playfield's bottom
// edge. In the band the tray takes whichever arrangement draws it largest: one row, or skills on a row above items.
export function placeTray(skills: number, items: number, band: number | null): TrayPlacement {
  const inWorld = row(skills, items, 1, TRAY.y, TRAY.y);
  if (band === null) return inWorld;
  const fit = (rows: number, perRow: number) =>
    Math.min(BAND_SCALE_MAX, VIEW.w / (2 * TRAY.x + (perRow - 1) * TRAY.gap), (band - BAND_SLACK) / (rows * TRAY.gap));
  const oneRow = fit(1, skills + items);
  const twoRows = fit(2, Math.max(skills, items));
  const scale = Math.max(oneRow, twoRows);
  if (scale < 1) return inWorld;
  const mid = VIEW.h + band / 2;
  const lift = oneRow >= twoRows ? 0 : (scale * TRAY.gap) / 2;
  return row(skills, items, scale, mid - lift, mid + lift);
}

function row(skills: number, items: number, scale: number, skillY: number, itemY: number): TrayPlacement {
  const gap = scale * TRAY.gap;
  const inset = scale * TRAY.x;
  return {
    scale,
    skills: Array.from({ length: skills }, (_, i) => ({ x: inset + i * gap, y: skillY })),
    items: Array.from({ length: items }, (_, i) => ({ x: VIEW.w - inset - (items - 1 - i) * gap, y: itemY })),
  };
}
