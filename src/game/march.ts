import type { Point } from './geometry';
import { VIEW } from '../viewSize';

// Classic invaders: the formation speeds up as it thins out, up to MAX_SPEEDUP times its base pace.
const MAX_SPEEDUP = 3.2;

export function marchSpeed(base: number, alive: number, total: number): number {
  if (total <= 0) return base;
  return base * (1 + (MAX_SPEEDUP - 1) * (1 - alive / total));
}

// Only the lowest living enemy in each column has a clear shot.
export function frontRank<T extends { col: number; row: number }>(members: readonly T[]): T[] {
  const front = new Map<number, T>();
  for (const m of members) {
    const cur = front.get(m.col);
    if (!cur || m.row > cur.row) front.set(m.col, m);
  }
  return [...front.values()];
}

const OFFSCREEN_PX = 24;

// A diving enemy rejoins its slot from above the top edge once it has flown off the screen.
export function diveOver(at: Point): boolean {
  return at.y > VIEW.h + OFFSCREEN_PX;
}
