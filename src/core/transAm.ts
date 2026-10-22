import type { ShipStats } from './stats';

export const TRANS_AM = {
  gaugeMax: 100,
  gain: { graze: 1, kill: 2, bossHpPercent: 1 },
  hitLoss: 20,
  // Added to the ship's core radius: a bullet that passes inside it and leaves without touching the core grazed.
  grazePadPx: 16,
  clearRadiusPx: 120,
  // The opening of the active time, while the shockwave expands.
  releaseMs: 400,
  activeMs: 6000,
  depletedMs: 4000,
  enemyTimeScale: 0.5,
  active: { fireIntervalScale: 0.5, pierce: 1, moveSpeedScale: 1.25 },
  depleted: { fireRateScale: 0.6, moveSpeedScale: 0.8 },
} as const;

// Only charging gains. Active and depleted count down, then the gauge starts again from 0.
export type TransAm = { kind: 'charging'; gauge: number } | { kind: 'active'; msLeft: number } | { kind: 'depleted'; msLeft: number };

export function charging(gauge: number): TransAm {
  return { kind: 'charging', gauge: Math.min(TRANS_AM.gaugeMax, Math.max(0, gauge)) };
}

export function gain(t: TransAm, points: number): TransAm {
  return t.kind === 'charging' ? charging(t.gauge + points) : t;
}

export function loseOnHit(t: TransAm): TransAm {
  return gain(t, -TRANS_AM.hitLoss);
}

export function isFull(t: TransAm): boolean {
  return t.kind === 'charging' && t.gauge >= TRANS_AM.gaugeMax;
}

// Null when the gauge is not full.
export function activate(t: TransAm): TransAm | null {
  return isFull(t) ? { kind: 'active', msLeft: TRANS_AM.activeMs } : null;
}

// A tick that crosses a phase boundary starts the next phase in full rather than carrying the overflow.
export function tick(t: TransAm, dtMs: number): TransAm {
  if (t.kind === 'charging') return t;
  const msLeft = t.msLeft - dtMs;
  if (msLeft > 0) return { kind: t.kind, msLeft };
  return t.kind === 'active' ? { kind: 'depleted', msLeft: TRANS_AM.depletedMs } : charging(0);
}

// 0 to 1 through the release at the start of the active time, null outside it.
export function releaseProgress(t: TransAm): number | null {
  if (t.kind !== 'active') return null;
  const elapsed = TRANS_AM.activeMs - t.msLeft;
  return elapsed < TRANS_AM.releaseMs ? elapsed / TRANS_AM.releaseMs : null;
}

export function enemyTimeScale(t: TransAm): number {
  return t.kind === 'active' ? TRANS_AM.enemyTimeScale : 1;
}

// What the next stage starts charging from.
export function carriedGauge(t: TransAm): number {
  return t.kind === 'charging' ? t.gauge : 0;
}

const FOLDS: Record<TransAm['kind'], (s: ShipStats) => void> = {
  charging: () => {},
  active: (s) => {
    s.fireIntervalMs *= TRANS_AM.active.fireIntervalScale;
    s.pierce += TRANS_AM.active.pierce;
    s.moveSpeed *= TRANS_AM.active.moveSpeedScale;
  },
  depleted: (s) => {
    s.fireIntervalMs /= TRANS_AM.depleted.fireRateScale;
    s.moveSpeed *= TRANS_AM.depleted.moveSpeedScale;
  },
};

export function withTransAm(base: ShipStats, t: TransAm): ShipStats {
  const stats = { ...base };
  FOLDS[t.kind](stats);
  return stats;
}
