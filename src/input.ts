import { ITEM_IDS, ITEMS, type ItemDef } from './core/items';

export type InputMode = 'keys' | 'touch';

// Decided once at boot: a device whose main pointer is a finger gets touch wording and the thumb-sized tray.
// Unit tests run without a window and read the keyboard wording.
export const INPUT_MODE: InputMode = globalThis.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keys';

export type SkillId = 'transAm' | 'dash' | 'laser' | 'orbital';

type InputWording = {
  controls: readonly (readonly [string, string])[];
  start: string;
  restart: string;
  fullscreen: string;
  music: (muted: boolean) => string;
  refresh: (cost: number) => string;
  go: string;
  cardKey: (slot: number) => string;
  itemUse: (item: ItemDef) => string;
  skillHint: Record<SkillId, string>;
  itemHint: (item: ItemDef) => string;
};

const WORDING: Record<InputMode, InputWording> = {
  keys: {
    controls: [
      ['← → ↑ ↓ / W A S D', 'เคลื่อนที่'],
      ['AUTO', 'ยิงอัตโนมัติ · เลเซอร์ยิงเองเมื่อปลดล็อก'],
      ['SHIFT', 'พุ่งชนทะลุฝูงศัตรู (เมื่อปลดล็อก)'],
      [ITEM_IDS.map((id) => ITEMS[id].key).join(' '), 'ใช้ไอเทมที่ซื้อจากร้านค้า ระหว่างด่าน'],
      ['1 2 3 / R / ENTER', 'ซื้อ · รีเฟรช · ไปต่อ ในร้านค้า'],
      ['F', 'เต็มจอ / ออกจากเต็มจอ'],
    ],
    start: 'PRESS ENTER หรือคลิกเพื่อเริ่ม',
    restart: 'ENTER หรือคลิก · เล่นอีกครั้ง',
    fullscreen: 'F · เต็มจอ',
    music: (muted) => `M · เพลง ${muted ? 'ปิด' : 'เปิด'}`,
    refresh: (cost) => `R · รีเฟรช  ${cost}`,
    go: 'ENTER · ไปต่อ ▶',
    cardKey: (slot) => `[${slot + 1}]`,
    itemUse: (item) => `ไอเทมกดใช้ · ปุ่ม ${item.key} ระหว่างด่าน`,
    skillHint: { transAm: 'SPACE', dash: 'SHIFT', laser: 'AUTO', orbital: 'AUTO' },
    itemHint: (item) => item.key,
  },
  touch: {
    controls: [
      ['ลากนิ้ว', 'เคลื่อนที่ · ลากตรงไหนบนจอก็ได้'],
      ['AUTO', 'ยิงอัตโนมัติ · เลเซอร์ยิงเองเมื่อปลดล็อก'],
      ['แตะไอคอนยาน', 'TRANS-AM เมื่อเกจเต็ม'],
      ['แตะไอคอนพุ่ง', 'พุ่งชนทะลุฝูงศัตรู (เมื่อปลดล็อก)'],
      ['แตะไอคอนไอเทม', 'ใช้ไอเทมที่ซื้อจากร้านค้า ระหว่างด่าน'],
      ['แตะการ์ด / ปุ่ม', 'ซื้อ · รีเฟรช · ไปต่อ ในร้านค้า'],
    ],
    start: 'แตะเพื่อเริ่ม',
    restart: 'แตะ · เล่นอีกครั้ง',
    fullscreen: 'เต็มจอ',
    music: (muted) => `เพลง ${muted ? 'ปิด' : 'เปิด'}`,
    refresh: (cost) => `รีเฟรช  ${cost}`,
    go: 'ไปต่อ ▶',
    cardKey: () => '',
    itemUse: () => 'ไอเทมกดใช้ · แตะไอคอนระหว่างด่าน',
    // The tappable slots read as buttons by themselves; only the ones a tap does nothing for keep a word.
    skillHint: { transAm: '', dash: '', laser: 'AUTO', orbital: 'AUTO' },
    itemHint: () => '',
  },
};

export const WORDS = WORDING[INPUT_MODE];
