import { PERK_IDS, PERKS, deriveStats, perkCost, type OwnedPerks, type PerkId, type Tier } from './perks';
import { STAGE_COUNT, stageDef } from './stages';

export const OFFER_SLOTS = 3;

export type ShopState = {
  // A bought slot becomes null so the shop shows it as sold out.
  offers: readonly (PerkId | null)[];
  refreshes: number;
};

export type RunPhase =
  | { kind: 'playing' }
  | { kind: 'shop'; shop: ShopState }
  | { kind: 'victory' }
  | { kind: 'defeat' };

export type RunState = {
  // The stage being played, or in the shop the stage just cleared.
  stage: number;
  money: number;
  hp: number;
  perks: OwnedPerks;
  rng: number;
  phase: RunPhase;
};

export type ShopResult = { ok: true; run: RunState } | { ok: false; reason: 'notEnoughMoney' | 'soldOut' | 'notInShop' };

// Tier weights for the shop opened after clearing a given stage. Higher stages favor stronger tiers.
const TIER_WEIGHTS_AFTER_STAGE: readonly Record<Tier, number>[] = [
  { 1: 1, 2: 0, 3: 0, 4: 0 },
  { 1: 3, 2: 2, 3: 0, 4: 0 },
  { 1: 3, 2: 2, 3: 0, 4: 0 },
  { 1: 2, 2: 3, 3: 0, 4: 0 },
  { 1: 1, 2: 2, 3: 3, 4: 0 },
  { 1: 1, 2: 2, 3: 3, 4: 0 },
  { 1: 1, 2: 1, 3: 2, 4: 3 },
  { 1: 1, 2: 1, 3: 2, 4: 3 },
  { 1: 1, 2: 1, 3: 2, 4: 4 },
];

export function tierWeights(stageCleared: number): Record<Tier, number> {
  return TIER_WEIGHTS_AFTER_STAGE[Math.min(stageCleared, TIER_WEIGHTS_AFTER_STAGE.length) - 1]!;
}

export function newRun(seed: number): RunState {
  const perks: OwnedPerks = {};
  return { stage: 1, money: 0, hp: deriveStats(perks).maxHp, perks, rng: seed >>> 0, phase: { kind: 'playing' } };
}

export function clearStage(run: RunState, coinsEarned: number): RunState {
  const money = run.money + coinsEarned + stageDef(run.stage).reward;
  if (run.stage >= STAGE_COUNT) return { ...run, money, phase: { kind: 'victory' } };
  const hp = Math.min(run.hp + 1, deriveStats(run.perks).maxHp);
  const [offers, rng] = rollOffers(run.perks, run.stage, run.rng);
  return { ...run, money, hp, rng, phase: { kind: 'shop', shop: { offers, refreshes: 0 } } };
}

export function failRun(run: RunState): RunState {
  return { ...run, phase: { kind: 'defeat' } };
}

export function leaveShop(run: RunState): RunState {
  if (run.phase.kind !== 'shop') return run;
  return { ...run, stage: run.stage + 1, phase: { kind: 'playing' } };
}

export function refreshCost(run: RunState): number {
  const refreshes = run.phase.kind === 'shop' ? run.phase.shop.refreshes : 0;
  return 5 + 2 * run.stage + 5 * refreshes;
}

export function refreshShop(run: RunState): ShopResult {
  if (run.phase.kind !== 'shop') return { ok: false, reason: 'notInShop' };
  const cost = refreshCost(run);
  if (run.money < cost) return { ok: false, reason: 'notEnoughMoney' };
  const [offers, rng] = rollOffers(run.perks, run.stage, run.rng);
  const shop = { offers, refreshes: run.phase.shop.refreshes + 1 };
  return { ok: true, run: { ...run, money: run.money - cost, rng, phase: { kind: 'shop', shop } } };
}

export function offerCost(run: RunState, id: PerkId): number {
  return perkCost(PERKS[id], (run.perks[id] ?? 0) + 1);
}

export function buyOffer(run: RunState, slot: number): ShopResult {
  if (run.phase.kind !== 'shop') return { ok: false, reason: 'notInShop' };
  const id = run.phase.shop.offers[slot];
  if (!id) return { ok: false, reason: 'soldOut' };
  const cost = offerCost(run, id);
  if (run.money < cost) return { ok: false, reason: 'notEnoughMoney' };

  const perks = { ...run.perks, [id]: (run.perks[id] ?? 0) + 1 };
  const maxHpGain = deriveStats(perks).maxHp - deriveStats(run.perks).maxHp;
  const offers = run.phase.shop.offers.map((o, i) => (i === slot ? null : o));
  return {
    ok: true,
    run: {
      ...run,
      money: run.money - cost,
      perks,
      hp: run.hp + maxHpGain,
      phase: { kind: 'shop', shop: { ...run.phase.shop, offers } },
    },
  };
}

export function isEligible(perks: OwnedPerks, id: PerkId, stageCleared: number): boolean {
  const perk = PERKS[id];
  const level = perks[id] ?? 0;
  if (level >= perk.maxLevel) return false;
  if (perk.requires && !perks[perk.requires]) return false;
  return tierWeights(stageCleared)[perk.tier] > 0;
}

// Weighted draw without replacement. Slots stay null when fewer than OFFER_SLOTS perks are eligible.
export function rollOffers(perks: OwnedPerks, stageCleared: number, rng: number): [(PerkId | null)[], number] {
  const weights = tierWeights(stageCleared);
  const pool = PERK_IDS.filter((id) => isEligible(perks, id, stageCleared));
  const offers: (PerkId | null)[] = [];
  let state = rng;
  for (let slot = 0; slot < OFFER_SLOTS; slot++) {
    const total = pool.reduce((sum, id) => sum + weights[PERKS[id].tier], 0);
    if (total === 0) {
      offers.push(null);
      continue;
    }
    let roll: number;
    [roll, state] = nextRandom(state);
    let pick = roll * total;
    const index = pool.findIndex((id) => (pick -= weights[PERKS[id].tier]) < 0);
    offers.push(pool.splice(index, 1)[0]!);
  }
  return [offers, state];
}

// mulberry32: returns a float in [0, 1) and the next state.
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
