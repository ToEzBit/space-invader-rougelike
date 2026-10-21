import { describe, expect, it } from 'vitest';
import { ITEMS } from '../core/items';
import { PERKS, describePerk } from '../core/perks';
import { ownedTip, placeTip } from './ownedTip';

const WORLD = { w: 480, h: 640 };

describe('ownedTip', () => {
  it('describes a perk at its current level and previews the next one', () => {
    const tip = ownedTip({ perks: { heavyCaliber: 2 }, items: {} }, { kind: 'perk', id: 'heavyCaliber' });
    expect(tip.badge).toBe('Lv 2 / 3');
    expect(tip.desc).toBe(describePerk(PERKS.heavyCaliber, 2));
    expect(tip.next).toBe(`เลเวลถัดไป: ${describePerk(PERKS.heavyCaliber, 3)}`);
  });

  it('has no next-level line once the perk is maxed', () => {
    const tip = ownedTip({ perks: { prismLance: 3 }, items: {} }, { kind: 'perk', id: 'prismLance' });
    expect(tip.badge).toBe('Lv 3 / 3 · MAX');
    expect(tip.next).toBeUndefined();
  });

  it('shows how many of an item are held and which key uses it', () => {
    const tip = ownedTip({ perks: {}, items: { nitro: 2 } }, { kind: 'item', id: 'nitro' });
    expect(tip.badge).toBe('ถืออยู่ 2/3');
    expect(tip.sub).toContain(`ปุ่ม ${ITEMS.nitro.key}`);
    expect(tip.desc).toBe(ITEMS.nitro.desc);
  });
});

describe('placeTip', () => {
  it('sits above the anchor, centered on it', () => {
    expect(placeTip({ x: 200, y: 560, w: 80, h: 16 }, 120, 60, WORLD)).toEqual({ x: 180, y: 494, w: 120, h: 60, below: false });
  });

  it('slides sideways to stay inside the world', () => {
    expect(placeTip({ x: 10, y: 560, w: 40, h: 16 }, 260, 60, WORLD).x).toBe(4);
    expect(placeTip({ x: 450, y: 560, w: 20, h: 16 }, 260, 60, WORLD).x).toBe(480 - 4 - 260);
  });

  it('flips below the anchor when there is no room above', () => {
    expect(placeTip({ x: 200, y: 20, w: 80, h: 16 }, 120, 60, WORLD)).toMatchObject({ y: 42, below: true });
  });
});
