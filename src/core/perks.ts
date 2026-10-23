import { BASE_STATS, type ShipStats } from './stats';

export type Branch = 'rapid' | 'laser' | 'ram';
export type Tier = 1 | 2 | 3 | 4;

export const BRANCH_LABEL: Record<Branch, string> = {
  rapid: 'Bullet Storm · สายยิงรัว',
  laser: 'Prism Lance · สายเลเซอร์',
  ram: 'Comet Strike · สายพุ่งชน',
};

// Registry order: the shop, the docs and the hangar list branches in this order.
export const BRANCHES = Object.keys(BRANCH_LABEL) as Branch[];

export const TIER_BASE_COST: Record<Tier, number> = { 1: 20, 2: 35, 3: 55, 4: 80 };

export const OVERDRIVE_CALM_MS = 3000;

type PerkSpec = {
  branch: Branch;
  tier: Tier;
  name: string;
  // The unlock perk this one modifies. Checked against the registry when the module loads.
  requires?: string;
  // values[level - 1] is the effect magnitude at that level; its length is the max level.
  values: readonly number[];
  desc: (v: number) => string;
  apply: (s: ShipStats, v: number) => void;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} วิ`;

const PERK_SPECS = {
  // ---------- Bullet Storm ----------
  hairTrigger: {
    branch: 'rapid', tier: 1, name: 'Hair Trigger',
    values: [0.85, 0.72, 0.6],
    desc: (v) => `ยิงเร็วขึ้น ช่วงห่างกระสุนเหลือ ${pct(v)}`,
    apply: (s, v) => { s.fireIntervalMs *= v; },
  },
  heavyCaliber: {
    branch: 'rapid', tier: 1, name: 'Heavy Caliber',
    values: [1, 2, 3],
    desc: (v) => `ดาเมจกระสุน +${v}`,
    apply: (s, v) => { s.bulletDamage += v; },
  },
  railRounds: {
    branch: 'rapid', tier: 1, name: 'Rail Rounds',
    values: [0.25, 0.5, 0.75],
    desc: (v) => `ความเร็วกระสุน +${pct(v)}`,
    apply: (s, v) => { s.bulletSpeed *= 1 + v; },
  },
  twinCannons: {
    branch: 'rapid', tier: 2, name: 'Twin Cannons',
    values: [2, 3],
    desc: (v) => `ยิงกระสุนคู่ขนาน ${v} นัดต่อครั้ง`,
    apply: (s, v) => { s.parallelShots = v; },
  },
  spreadFan: {
    branch: 'rapid', tier: 2, name: 'Spread Fan',
    values: [1, 2, 3],
    desc: (v) => `ยิงกระสุนเฉียงเพิ่ม ${v} คู่ (แนวพัด)`,
    apply: (s, v) => { s.spreadPairs = v; },
  },
  piercingCore: {
    branch: 'rapid', tier: 2, name: 'Piercing Core',
    values: [1, 2, 3],
    desc: (v) => `กระสุนทะลุศัตรูได้ ${v} ตัว`,
    apply: (s, v) => { s.pierce = v; },
  },
  luckyStar: {
    branch: 'rapid', tier: 3, name: 'Lucky Star',
    values: [0.1, 0.2, 0.3],
    desc: (v) => `โอกาสคริติคอล ${pct(v)} (ดาเมจ x2.5)`,
    apply: (s, v) => { s.critChance = v; },
  },
  seekerMissiles: {
    branch: 'rapid', tier: 3, name: 'Seeker Missiles',
    values: [6, 5, 4],
    desc: (v) => `ทุก ${v} นัด ยิงมิสไซล์ติดตามเป้า (ดาเมจ ${missileDamage(v)})`,
    apply: (s, v) => { s.homingEveryShots = v; s.homingDamage = missileDamage(v); },
  },
  overdrive: {
    branch: 'rapid', tier: 3, name: 'Overdrive',
    values: [0.6, 0.45],
    desc: (v) => `ไม่โดนโจมตีต่อเนื่อง ${sec(OVERDRIVE_CALM_MS)} ยิงเร็วขึ้นอีก (ช่วงห่างเหลือ ${pct(v)})`,
    apply: (s, v) => { s.overdriveMultiplier = v; },
  },
  optionDrones: {
    branch: 'rapid', tier: 4, name: 'Option Drones',
    values: [1, 2],
    desc: (v) => `โดรนคู่หู ${v} ลำ ลอยข้างยานและยิงตามเรา`,
    apply: (s, v) => { s.drones = v; },
  },

  // ---------- Prism Lance ----------
  prismLance: {
    branch: 'laser', tier: 1, name: 'Prism Lance',
    values: [4000, 3400, 2800],
    desc: (v) => `ปลดล็อกเลเซอร์ ยิงลำแสงทะลุทั้งแนวอัตโนมัติ ทุก ${sec(v)}`,
    apply: (s, v) => { s.laserCooldownMs = v; s.laserDps = 14; },
  },
  focusLens: {
    branch: 'laser', tier: 1, name: 'Focus Lens', requires: 'prismLance',
    values: [0.4, 0.8, 1.2],
    desc: (v) => `ดาเมจเลเซอร์ +${pct(v)}`,
    apply: (s, v) => { s.laserDps *= 1 + v; },
  },
  wideAperture: {
    branch: 'laser', tier: 1, name: 'Wide Aperture', requires: 'prismLance',
    values: [6, 12, 18],
    desc: (v) => `ลำแสงกว้างขึ้น +${v}px`,
    apply: (s, v) => { s.laserWidth += v; },
  },
  capacitorBank: {
    branch: 'laser', tier: 2, name: 'Capacitor Bank', requires: 'prismLance',
    values: [0.85, 0.72, 0.6],
    desc: (v) => `คูลดาวน์เลเซอร์เหลือ ${pct(v)}`,
    apply: (s, v) => { s.laserCooldownMs *= v; },
  },
  longDischarge: {
    branch: 'laser', tier: 2, name: 'Long Discharge', requires: 'prismLance',
    values: [300, 600, 900],
    desc: (v) => `ลำแสงค้างนานขึ้น +${sec(v)}`,
    apply: (s, v) => { s.laserDurationMs += v; },
  },
  plasmaBurn: {
    branch: 'laser', tier: 2, name: 'Plasma Burn', requires: 'prismLance',
    values: [3, 5, 7],
    desc: (v) => `ศัตรูที่โดนแสงติดไฟ ${v} ดาเมจ/วิ นาน 2 วิ`,
    apply: (s, v) => { s.laserBurnDps = v; },
  },
  reflectorField: {
    branch: 'laser', tier: 3, name: 'Reflector Field', requires: 'prismLance',
    values: [0, 1],
    desc: (v) => (v === 0 ? 'ลำแสงลบกระสุนศัตรู' : 'ลำแสงลบกระสุนศัตรู และได้ 1 เหรียญต่อกระสุนที่ลบ'),
    apply: (s, v) => { s.laserErasesBullets = true; s.laserErasedBulletCoin = v; },
  },
  prismSplit: {
    branch: 'laser', tier: 3, name: 'Prism Split', requires: 'prismLance',
    values: [1, 2],
    desc: (v) => `แยกลำแสงเฉียงซ้าย-ขวาเพิ่ม ${v} คู่ (ดาเมจ 50%)`,
    apply: (s, v) => { s.laserSideBeams = v; },
  },
  chainCharge: {
    branch: 'laser', tier: 3, name: 'Chain Charge', requires: 'prismLance',
    values: [300, 500, 700],
    desc: (v) => `ฆ่าศัตรูด้วยเลเซอร์ ลดคูลดาวน์ ${sec(v)} ต่อตัว`,
    apply: (s, v) => { s.laserKillRefundMs = v; },
  },
  orbitalCannon: {
    branch: 'laser', tier: 4, name: 'Orbital Cannon', requires: 'prismLance',
    values: [10000, 7000],
    desc: (v) => `ทุก ${sec(v)} ยิงปืนใหญ่จากวงโคจรใส่แถวที่ศัตรูหนาแน่นที่สุด (ดาเมจ 40)`,
    apply: (s, v) => { s.orbitalCooldownMs = v; s.orbitalDamage = 40; },
  },

  // ---------- Comet Strike ----------
  afterburnerDash: {
    branch: 'ram', tier: 1, name: 'Afterburner Dash',
    values: [5000, 4500, 4000],
    desc: (v) => `ปลดล็อกพุ่งชน (Shift) ยานพุ่งขึ้นทะลุฝูงศัตรู อมตะระหว่างพุ่ง คูลดาวน์ ${sec(v)}`,
    apply: (s, v) => { s.dashCooldownMs = v; s.dashDamage = 6; },
  },
  reinforcedHull: {
    branch: 'ram', tier: 1, name: 'Reinforced Hull',
    values: [1, 2, 3],
    desc: (v) => `HP สูงสุด +${v} (HP ปัจจุบันเพิ่มตามด้วย)`,
    apply: (s, v) => { s.maxHp += v; },
  },
  spikedProw: {
    branch: 'ram', tier: 1, name: 'Spiked Prow', requires: 'afterburnerDash',
    values: [4, 8, 12],
    desc: (v) => `ดาเมจพุ่งชน +${v}`,
    apply: (s, v) => { s.dashDamage += v; },
  },
  thrusterTuning: {
    branch: 'ram', tier: 2, name: 'Thruster Tuning',
    values: [0.12, 0.24, 0.36],
    desc: (v) => `ความเร็วเคลื่อนที่ +${pct(v)} และความเร็วพุ่ง +${pct(v * 1.5)}`,
    apply: (s, v) => { s.moveSpeed *= 1 + v; s.dashSpeed *= 1 + v * 1.5; },
  },
  quickRecharge: {
    branch: 'ram', tier: 2, name: 'Quick Recharge', requires: 'afterburnerDash',
    values: [0.85, 0.72, 0.6],
    desc: (v) => `คูลดาวน์พุ่งชนเหลือ ${pct(v)}`,
    apply: (s, v) => { s.dashCooldownMs *= v; },
  },
  impactShockwave: {
    branch: 'ram', tier: 2, name: 'Impact Shockwave', requires: 'afterburnerDash',
    values: [32, 44, 56],
    desc: (v) => `ทุกครั้งที่ชนศัตรู เกิดระเบิดรัศมี ${v}px (ดาเมจ 50% ของแรงชน)`,
    apply: (s, v) => { s.dashShockRadius = v; },
  },
  kineticBarrier: {
    branch: 'ram', tier: 3, name: 'Kinetic Barrier', requires: 'afterburnerDash',
    values: [3000, 5000],
    desc: (v) => `หลังพุ่งชน ได้โล่กันโจมตี 1 ครั้ง นาน ${sec(v)}`,
    apply: (s, v) => { s.dashShieldMs = v; },
  },
  twinComet: {
    branch: 'ram', tier: 3, name: 'Twin Comet', requires: 'afterburnerDash',
    values: [1, 2],
    desc: (v) => `พุ่งชนสะสมได้เพิ่ม +${v} ครั้ง`,
    apply: (s, v) => { s.dashCharges += v; },
  },
  vampiricHull: {
    branch: 'ram', tier: 3, name: 'Vampiric Hull', requires: 'afterburnerDash',
    values: [8, 5],
    desc: (v) => `ฆ่าด้วยการพุ่งชนครบ ${v} ตัว ฟื้น 1 HP`,
    apply: (s, v) => { s.dashHealEveryKills = v; },
  },
  supernovaComet: {
    branch: 'ram', tier: 4, name: 'Supernova Comet', requires: 'afterburnerDash',
    values: [1.8, 2.6],
    desc: (v) => `ระหว่างพุ่ง ยานใหญ่ขึ้น x${v} และดาเมจชน x${(v * 0.8).toFixed(1)}`,
    apply: (s, v) => { s.dashSizeMultiplier = v; s.dashDamageMultiplier = v * 0.8; },
  },
} satisfies Record<string, PerkSpec>;

function missileDamage(everyShots: number): number {
  return { 6: 4, 5: 6, 4: 8 }[everyShots] ?? 4;
}

export type PerkId = keyof typeof PERK_SPECS;

export type PerkDef = Omit<PerkSpec, 'requires'> & { id: PerkId; requires?: PerkId; maxLevel: number };

export const PERK_IDS = Object.keys(PERK_SPECS) as PerkId[];

export const PERKS = {} as Record<PerkId, PerkDef>;
for (const id of PERK_IDS) {
  const spec: PerkSpec = PERK_SPECS[id];
  if (spec.requires && !(spec.requires in PERK_SPECS)) throw new Error(`${id} requires unknown perk ${spec.requires}`);
  PERKS[id] = { ...spec, id, requires: spec.requires as PerkId | undefined, maxLevel: spec.values.length };
}

export type OwnedPerks = Partial<Record<PerkId, number>>;

export function perkCost(perk: PerkDef, nextLevel: number): number {
  return TIER_BASE_COST[perk.tier] * nextLevel;
}

export function describePerk(perk: PerkDef, level: number): string {
  return perk.desc(perk.values[level - 1]!);
}

export function deriveStats(owned: OwnedPerks): ShipStats {
  const stats: ShipStats = { ...BASE_STATS };
  // Folding in registry order keeps unlocks (listed first per branch) ahead of their modifiers.
  for (const id of PERK_IDS) {
    const level = owned[id];
    if (level) PERKS[id].apply(stats, PERKS[id].values[level - 1]!);
  }
  return stats;
}
