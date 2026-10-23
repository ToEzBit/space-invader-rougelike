import { ITEM_IDS, ITEM_OFFER_CHANCE, ITEM_STACK_MAX, ITEMS, type ItemEffect, type ItemId, type OwnedItems } from './items';
import { PERK_IDS, PERKS, deriveStats, perkCost, type OwnedPerks, type PerkId, type Tier } from './perks';
import { STAGE_COUNT, stageDef } from './stages';

export const OFFER_SLOTS = 3;

export type Offer = { kind: 'perk'; id: PerkId } | { kind: 'item'; id: ItemId };

export type ShopState = {
  // A bought slot becomes null so the shop shows it as sold out.
  offers: readonly (Offer | null)[];
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
  // Consumables carry across stages until used.
  items: OwnedItems;
  // The TRANS-AM gauge the next stage starts charging from.
  transAmGauge: number;
  rng: number;
  phase: RunPhase;
};

export type ShopResult = { ok: true; run: RunState } | { ok: false; reason: 'notEnoughMoney' | 'soldOut' | 'stackFull' | 'notInShop' };

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
  return { stage: 1, money: 0, hp: deriveStats(perks).maxHp, perks, items: {}, transAmGauge: 0, rng: seed >>> 0, phase: { kind: 'playing' } };
}

export function clearStage(run: RunState, coinsEarned: number): RunState {
  const money = run.money + coinsEarned + stageDef(run.stage).reward;
  if (run.stage >= STAGE_COUNT) return { ...run, money, phase: { kind: 'victory' } };
  const hp = Math.min(run.hp + 1, deriveStats(run.perks).maxHp);
  const [offers, rng] = rollOffers(run);
  return { ...run, money, hp, rng, phase: { kind: 'shop', shop: { offers, refreshes: 0 } } };
}

export function failRun(run: RunState): RunState {
  return { ...run, phase: { kind: 'defeat' } };
}

// HP lives on the run so damage carries across stages; reaching 0 is the defeat transition.
export function takeHit(run: RunState, amount: number): RunState {
  const hp = Math.max(0, run.hp - amount);
  return hp === 0 ? { ...run, hp, phase: { kind: 'defeat' } } : { ...run, hp };
}

export function heal(run: RunState, amount: number): RunState {
  return { ...run, hp: Math.min(run.hp + amount, deriveStats(run.perks).maxHp) };
}

export function carryTransAm(run: RunState, gauge: number): RunState {
  return run.transAmGauge === gauge ? run : { ...run, transAmGauge: gauge };
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
  const [offers, rng] = rollOffers(run);
  const shop = { offers, refreshes: run.phase.shop.refreshes + 1 };
  return { ok: true, run: { ...run, money: run.money - cost, rng, phase: { kind: 'shop', shop } } };
}

export const PRICE_RISE_PER_STAGE = 0.2;

export function priceScale(stageCleared: number): number {
  return 1 + PRICE_RISE_PER_STAGE * (Math.max(stageCleared, 1) - 1);
}

export function offerCost(run: RunState, offer: Offer): number {
  const base = offer.kind === 'perk' ? perkCost(PERKS[offer.id], (run.perks[offer.id] ?? 0) + 1) : ITEMS[offer.id].cost;
  return Math.max(5, Math.round((base * priceScale(run.stage)) / 5) * 5);
}

export function buyOffer(run: RunState, slot: number): ShopResult {
  if (run.phase.kind !== 'shop') return { ok: false, reason: 'notInShop' };
  const offer = run.phase.shop.offers[slot];
  if (!offer) return { ok: false, reason: 'soldOut' };
  if (offer.kind === 'item' && (run.items[offer.id] ?? 0) >= ITEM_STACK_MAX) return { ok: false, reason: 'stackFull' };
  const cost = offerCost(run, offer);
  if (run.money < cost) return { ok: false, reason: 'notEnoughMoney' };

  const offers = run.phase.shop.offers.map((o, i) => (i === slot ? null : o));
  return { ok: true, run: { ...grant(run, offer), money: run.money - cost, phase: { kind: 'shop', shop: { ...run.phase.shop, offers } } } };
}

function grant(run: RunState, offer: Offer): RunState {
  switch (offer.kind) {
    case 'perk': {
      const perks = { ...run.perks, [offer.id]: (run.perks[offer.id] ?? 0) + 1 };
      const maxHpGain = deriveStats(perks).maxHp - deriveStats(run.perks).maxHp;
      return { ...run, perks, hp: run.hp + maxHpGain };
    }
    case 'item':
      return { ...run, items: { ...run.items, [offer.id]: (run.items[offer.id] ?? 0) + 1 } };
  }
}

// Spends one held item. Refused (null) outside a stage, with none held, or a heal at full HP.
export function useItem(run: RunState, id: ItemId): { run: RunState; effect: ItemEffect } | null {
  const held = run.items[id] ?? 0;
  const { effect } = ITEMS[id];
  if (run.phase.kind !== 'playing' || held === 0) return null;
  if (effect.kind === 'heal' && run.hp >= deriveStats(run.perks).maxHp) return null;
  const spent = { ...run, items: { ...run.items, [id]: held - 1 } };
  return { run: effect.kind === 'heal' ? heal(spent, effect.hp) : spent, effect };
}

export function isEligible(perks: OwnedPerks, id: PerkId, stageCleared: number): boolean {
  const perk = PERKS[id];
  const level = perks[id] ?? 0;
  if (level >= perk.maxLevel) return false;
  if (perk.requires && !perks[perk.requires]) return false;
  return tierWeights(stageCleared)[perk.tier] > 0;
}

// Each slot is an item with ITEM_OFFER_CHANCE, otherwise a tier-weighted perk, drawn without
// replacement. A slot falls back to the other pool when its own is empty and stays null when both are.
export function rollOffers(run: Pick<RunState, 'perks' | 'items' | 'stage' | 'rng'>): [(Offer | null)[], number] {
  const weights = tierWeights(run.stage);
  const perkPool = PERK_IDS.filter((id) => isEligible(run.perks, id, run.stage));
  const itemPool = ITEM_IDS.filter((id) => (run.items[id] ?? 0) < ITEM_STACK_MAX);
  const drawPerk = (roll: number): Offer | null => {
    const total = perkPool.reduce((sum, id) => sum + weights[PERKS[id].tier], 0);
    if (total === 0) return null;
    let pick = roll * total;
    const index = perkPool.findIndex((id) => (pick -= weights[PERKS[id].tier]) < 0);
    return { kind: 'perk', id: perkPool.splice(index, 1)[0]! };
  };
  const drawItem = (roll: number): Offer | null =>
    itemPool.length ? { kind: 'item', id: itemPool.splice(Math.floor(roll * itemPool.length), 1)[0]! } : null;

  const offers: (Offer | null)[] = [];
  let state = run.rng;
  for (let slot = 0; slot < OFFER_SLOTS; slot++) {
    let kindRoll: number;
    let roll: number;
    [kindRoll, state] = nextRandom(state);
    [roll, state] = nextRandom(state);
    const [first, second] = kindRoll < ITEM_OFFER_CHANCE ? [drawItem, drawPerk] : [drawPerk, drawItem];
    offers.push(first(roll) ?? second(roll));
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
