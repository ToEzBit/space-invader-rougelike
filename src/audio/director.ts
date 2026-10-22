import type { BossFight } from '../game/boss';
import type { TrackId } from './tracks';

export type BossView = Pick<BossFight, 'form' | 'stanceKind'>;

// The stage's music. The second form's track starts with the transformation, before the form itself flips at its
// peak, and a dead boss fades out so the clear has a beat of quiet before the shop.
export function trackFor(boss: BossView | null): TrackId | null {
  if (!boss) return 'normal';
  if (boss.stanceKind === 'dead') return null;
  return boss.form === 1 || boss.stanceKind === 'transforming' ? 'boss2' : 'boss1';
}
