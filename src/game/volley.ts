import { OVERDRIVE_HOLD_MS } from '../core/perks';
import type { ShipStats } from '../core/stats';

export type Barrel = { dx: number; angle: number };

const BARREL_GAP = 9;
const SPREAD_STEP_DEG = 12;

// Parallel barrels sit side by side; spread pairs fan out from the nose.
export function volley(stats: Pick<ShipStats, 'parallelShots' | 'spreadPairs'>): Barrel[] {
  const barrels: Barrel[] = [];
  for (let i = 0; i < stats.parallelShots; i++) barrels.push({ dx: (i - (stats.parallelShots - 1) / 2) * BARREL_GAP, angle: 0 });
  for (let p = 1; p <= stats.spreadPairs; p++) barrels.push({ dx: 0, angle: -SPREAD_STEP_DEG * p }, { dx: 0, angle: SPREAD_STEP_DEG * p });
  return barrels;
}

export function fireInterval(stats: Pick<ShipStats, 'fireIntervalMs' | 'overdriveMultiplier'>, heldMs: number): number {
  return stats.fireIntervalMs * (heldMs >= OVERDRIVE_HOLD_MS ? stats.overdriveMultiplier : 1);
}
