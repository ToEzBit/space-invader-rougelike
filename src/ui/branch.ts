import type { Branch } from '../core/perks';
import { COLORS } from '../art/palette';
import type { SpriteKey } from '../art/sprites';

export const BRANCH_LOOK: Record<Branch, { color: number; icon: SpriteKey }> = {
  rapid: { color: COLORS.orange, icon: 'iconRapid' },
  laser: { color: COLORS.cyan, icon: 'iconLaser' },
  ram: { color: COLORS.pink, icon: 'iconRam' },
};
