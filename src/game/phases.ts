import type { BossDef } from '../core/stages';

// The latest phase whose threshold the boss HP has fallen to.
export function bossPhaseIndex(phases: BossDef['phases'], hpRatio: number): number {
  let index = 0;
  phases.forEach((p, i) => {
    if (hpRatio <= p.hpRatio) index = i;
  });
  return index;
}
