import type { BossFight } from '../game/boss';
import type { TrackId } from './tracks';

export type BossView = Pick<BossFight, 'form' | 'stanceKind'>;

export function trackFor(boss: BossView | null): TrackId | null {
  if (!boss) return 'normal';
  if (boss.stanceKind === 'dead') return null;
  return secondFormStarted(boss) ? 'boss2' : 'boss1';
}

function secondFormStarted(boss: BossView): boolean {
  return boss.form === 1 || boss.stanceKind === 'transforming';
}
