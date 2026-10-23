import { describe, expect, it } from 'vitest';
import { buyOffer, clearStage, leaveShop, offerCost, openRun, type RunState } from './run';
import { ENEMIES, STAGES, type BossId } from './stages';

const SEEDS = 400;
// Kill coins modelled for each boss stage.
const BOSS_COINS: Record<BossId, number> = { crimsonSeraph: 14, voidEmpress: 99 };

function killCoins(stage: number): number {
  const def = STAGES[stage - 1]!;
  if (def.kind === 'boss') return BOSS_COINS[def.boss];
  return def.rows.reduce((sum, kind) => sum + ENEMIES[kind].coin * def.cols, 0);
}

function buyCheapestUntilBroke(run: RunState): RunState {
  for (;;) {
    if (run.phase.kind !== 'shop') return run;
    const shop = run.phase.shop;
    const slots = shop.offers
      .flatMap((offer, slot) => (offer ? [{ slot, cost: offerCost(run, offer) }] : []))
      .filter(({ cost }) => cost <= run.money)
      .sort((a, b) => a.cost - b.cost);
    const bought = slots.map(({ slot }) => buyOffer(run, slot)).find((r) => r.ok);
    if (!bought?.ok) return run;
    run = bought.run;
  }
}

// Per shop (index = stage cleared - 1): money held on entering it over the price of all three offers.
function shopCoverage(seed: number): number[] {
  const ratios: number[] = [];
  let run = leaveShop(buyCheapestUntilBroke(openRun(seed)));
  while (run.phase.kind === 'playing') {
    run = clearStage(run, killCoins(run.stage));
    if (run.phase.kind !== 'shop') break;
    const shopRun = run;
    const price = run.phase.shop.offers.reduce((sum, offer) => sum + (offer ? offerCost(shopRun, offer) : 0), 0);
    ratios.push(run.money / price);
    run = leaveShop(buyCheapestUntilBroke(run));
  }
  return ratios;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const runs = Array.from({ length: SEEDS }, (_, seed) => shopCoverage(seed + 1));
const medianAfterStage = (stage: number) => median(runs.map((r) => r[stage - 1]!));

describe('shop economy for a run that kills everything and buys the cheapest card it can afford, from the hangar on', () => {
  it('visits a shop after each of stages 1 to 9', () => {
    expect(runs.every((r) => r.length === 9)).toBe(true);
  });

  it.each([1, 2, 3, 4])('before the first boss, money entering the shop after stage %i covers at least 80% of its three cards, so early power barely changes', (stage) => {
    expect(medianAfterStage(stage)).toBeGreaterThanOrEqual(0.8);
  });

  it.each([5, 6, 7, 8, 9])('money entering the shop after stage %i covers 60% to 85% of its three cards, so a player must pick which to leave', (stage) => {
    const coverage = medianAfterStage(stage);
    expect(coverage).toBeGreaterThanOrEqual(0.6);
    expect(coverage).toBeLessThanOrEqual(0.85);
  });
});
