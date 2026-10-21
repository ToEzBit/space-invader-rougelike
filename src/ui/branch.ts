import type { Branch } from '../core/perks';
import { COLORS } from '../art/palette';
import type { IconKey } from '../art/ui';

export const BRANCH_LOOK: Record<Branch, { color: number; icon: IconKey }> = {
  rapid: { color: COLORS.orange, icon: 'iconRapid' },
  laser: { color: COLORS.cyan, icon: 'iconLaser' },
  ram: { color: COLORS.pink, icon: 'iconRam' },
};
