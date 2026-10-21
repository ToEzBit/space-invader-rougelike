import type { ShipStats } from './stats';

export const ITEM_STACK_MAX = 3;
// Per shop slot; the rest of the time the slot draws a perk.
export const ITEM_OFFER_CHANCE = 0.2;

// Timed stat folds layered over deriveStats while a buff item is active.
export const BUFFS = {
  nitro: (s) => { s.moveSpeed *= 1.5; },
  powerCell: (s) => { s.bulletDamage *= 1.5; s.homingDamage *= 1.5; s.laserDps *= 1.5; },
  overclock: (s) => { s.fireIntervalMs *= 0.6; },
} satisfies Record<string, (s: ShipStats) => void>;

export type BuffId = keyof typeof BUFFS;

export type ItemEffect =
  | { kind: 'heal'; hp: number }
  | { kind: 'buff'; buff: BuffId; durationMs: number }
  | { kind: 'shield'; durationMs: number };

export type ItemKey = 1 | 2 | 3 | 4 | 5;

export type ItemDef = { name: string; desc: string; cost: number; key: ItemKey; effect: ItemEffect };

const ITEM_SPECS = {
  repairKit: { name: 'Repair Kit', desc: 'ซ่อมยาน ฟื้น 1 HP (ใช้ไม่ได้ตอน HP เต็ม)', cost: 25, key: 1, effect: { kind: 'heal', hp: 1 } },
  nitro: { name: 'Nitro', desc: 'เคลื่อนที่เร็วขึ้น x1.5 นาน 8 วิ', cost: 15, key: 2, effect: { kind: 'buff', buff: 'nitro', durationMs: 8000 } },
  powerCell: { name: 'Power Cell', desc: 'ดาเมจกระสุน มิสไซล์ และเลเซอร์ x1.5 นาน 8 วิ', cost: 20, key: 3, effect: { kind: 'buff', buff: 'powerCell', durationMs: 8000 } },
  overclock: { name: 'Overclock', desc: 'ยิงรัวขึ้น ช่วงห่างกระสุนเหลือ 60% นาน 8 วิ', cost: 20, key: 4, effect: { kind: 'buff', buff: 'overclock', durationMs: 8000 } },
  barrierCapsule: { name: 'Barrier Capsule', desc: 'โล่กันโจมตี 1 ครั้ง นาน 10 วิ', cost: 25, key: 5, effect: { kind: 'shield', durationMs: 10000 } },
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEM_SPECS;

export const ITEMS: Record<ItemId, ItemDef> = ITEM_SPECS;

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export type OwnedItems = Partial<Record<ItemId, number>>;

const ITEM_BY_KEY = new Map<string, ItemId>();
for (const id of ITEM_IDS) {
  const key = String(ITEMS[id].key);
  if (ITEM_BY_KEY.has(key)) throw new Error(`${id} and ${ITEM_BY_KEY.get(key)} share key ${key}`);
  ITEM_BY_KEY.set(key, id);
}

export function itemForKey(key: string): ItemId | null {
  return ITEM_BY_KEY.get(key) ?? null;
}

export function withBuffs(base: ShipStats, buffs: Iterable<BuffId>): ShipStats {
  const stats = { ...base };
  for (const buff of buffs) BUFFS[buff](stats);
  return stats;
}
