import type { Branch } from '../core/perks';
import { COLORS } from '../art/palette';
import type { FrameKey, IconKey } from '../art/ui';

export const BRANCH_LOOK: Record<Branch, { color: number; icon: IconKey; card: FrameKey; chip: FrameKey }> = {
  rapid: { color: COLORS.orange, icon: 'iconRapid', card: 'perkCardRapid', chip: 'chipRapid' },
  laser: { color: COLORS.cyan, icon: 'iconLaser', card: 'perkCardLaser', chip: 'chipLaser' },
  ram: { color: COLORS.pink, icon: 'iconRam', card: 'perkCard', chip: 'chipRam' },
  // Placeholder icon, card and chip until the graze art lands.
  graze: { color: COLORS.lime, icon: 'iconOrbital', card: 'perkCard', chip: 'chipGold' },
};
