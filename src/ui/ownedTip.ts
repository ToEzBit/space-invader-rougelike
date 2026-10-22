import { COLORS } from '../art/palette';
import { ITEM_STACK_MAX, ITEMS, type ItemId, type OwnedItems } from '../core/items';
import { BRANCH_LABEL, PERKS, describePerk, type OwnedPerks, type PerkId } from '../core/perks';
import { WORDS } from '../input';
import { BRANCH_LOOK } from './branch';

export type OwnedRef = { kind: 'perk'; id: PerkId } | { kind: 'item'; id: ItemId };

export type Tip = { title: string; color: number; badge: string; sub: string; desc: string; next?: string };

export type Rect = { x: number; y: number; w: number; h: number };

export function ownedTip(owned: { perks: OwnedPerks; items: OwnedItems }, ref: OwnedRef): Tip {
  switch (ref.kind) {
    case 'perk': {
      const perk = PERKS[ref.id];
      const level = owned.perks[ref.id] ?? 0;
      const maxed = level >= perk.maxLevel;
      const tip: Tip = {
        title: perk.name,
        color: BRANCH_LOOK[perk.branch].color,
        badge: `Lv ${level} / ${perk.maxLevel}${maxed ? ' · MAX' : ''}`,
        sub: BRANCH_LABEL[perk.branch],
        desc: describePerk(perk, level),
      };
      if (!maxed) tip.next = `เลเวลถัดไป: ${describePerk(perk, level + 1)}`;
      return tip;
    }
    case 'item': {
      const item = ITEMS[ref.id];
      return {
        title: item.name,
        color: COLORS.gold,
        badge: `ถืออยู่ ${owned.items[ref.id] ?? 0}/${ITEM_STACK_MAX}`,
        sub: WORDS.itemUse(item),
        desc: item.desc,
      };
    }
  }
}

const GAP = 6;
const MARGIN = 4;

export function placeTip(anchor: Rect, w: number, h: number, world: { w: number; h: number }): Rect & { below: boolean } {
  const x = Math.round(Math.min(Math.max(anchor.x + anchor.w / 2 - w / 2, MARGIN), world.w - MARGIN - w));
  const above = Math.round(anchor.y - GAP - h);
  if (above >= MARGIN) return { x, y: above, w, h, below: false };
  return { x, y: Math.round(Math.min(anchor.y + anchor.h + GAP, world.h - MARGIN - h)), w, h, below: true };
}
