import type { ItemId } from '../core/items';
import { COLORS } from '../art/palette';
import type { SpriteKey } from '../art/sprites';

export const ITEM_LOOK: Record<ItemId, { color: number; icon: SpriteKey }> = {
  repairKit: { color: COLORS.green, icon: 'itemRepairKit' },
  nitro: { color: COLORS.violet, icon: 'itemNitro' },
  powerCell: { color: COLORS.red, icon: 'itemPowerCell' },
  overclock: { color: COLORS.yellow, icon: 'itemOverclock' },
  barrierCapsule: { color: COLORS.cyan, icon: 'itemBarrier' },
};
