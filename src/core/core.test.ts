import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './stats';
import { PERKS, PERK_IDS, deriveStats, describePerk, type PerkId } from './perks';
import { STAGES } from './stages';
import { buyOffer, clearStage, leaveShop, newRun, refreshCost, refreshShop, rollOffers, type RunState } from './run';

function shopOf(run: RunState) {
  if (run.phase.kind !== 'shop') throw new Error(`expected shop, got ${run.phase.kind}`);
  return run.phase.shop;
}

function withOffers(run: RunState, offers: (PerkId | null)[], money: number): RunState {
  return { ...run, money, phase: { kind: 'shop', shop: { offers, refreshes: 0 } } };
}

describe('perk registry', () => {
  it('has 30 perks, 10 per branch, each with levels and Thai descriptions', () => {
    expect(PERK_IDS).toHaveLength(30);
    for (const branch of ['rapid', 'laser', 'ram'] as const) {
      expect(PERK_IDS.filter((id) => PERKS[id].branch === branch)).toHaveLength(10);
    }
    for (const id of PERK_IDS) {
      const perk = PERKS[id];
      expect(perk.maxLevel).toBeGreaterThanOrEqual(2);
      for (let lv = 1; lv <= perk.maxLevel; lv++) expect(describePerk(perk, lv)).toMatch(/[฀-๿]/);
    }
  });
});

describe('deriveStats', () => {
  it('starts with laser and dash off', () => {
    const s = deriveStats({});
    expect(s).toEqual(BASE_STATS);
    expect(s.laserCooldownMs).toBe(0);
    expect(s.dashCooldownMs).toBe(0);
  });

  it('applies modifiers on top of the unlock regardless of purchase order', () => {
    const s = deriveStats({ capacitorBank: 1, prismLance: 1, focusLens: 2 });
    expect(s.laserCooldownMs).toBeCloseTo(4000 * 0.85);
    expect(s.laserDps).toBeCloseTo(14 * 1.8);
  });

  it('stronger levels are strictly stronger', () => {
    expect(deriveStats({ hairTrigger: 3 }).fireIntervalMs).toBeLessThan(deriveStats({ hairTrigger: 1 }).fireIntervalMs);
    expect(deriveStats({ afterburnerDash: 1, spikedProw: 3 }).dashDamage).toBe(6 + 12);
  });
});

describe('shop rolls', () => {
  it('after stage 1 offers only tier 1 perks with no locked prerequisites', () => {
    for (let seed = 1; seed < 200; seed++) {
      const [offers] = rollOffers({}, 1, seed);
      expect(offers).toHaveLength(3);
      expect(new Set(offers).size).toBe(3);
      for (const id of offers) {
        expect(PERKS[id!].tier).toBe(1);
        expect(PERKS[id!].requires).toBeUndefined();
      }
    }
  });

  it('later shops can offer tier 4 perks, never maxed ones', () => {
    const owned = { prismLance: 3, afterburnerDash: 3, hairTrigger: 3 } as const;
    const seen = new Set<PerkId>();
    for (let seed = 1; seed < 300; seed++) rollOffers(owned, 8, seed)[0].forEach((id) => id && seen.add(id));
    expect([...seen].some((id) => PERKS[id].tier === 4)).toBe(true);
    expect(seen.has('hairTrigger')).toBe(false);
  });

  it('leaves empty slots when the pool runs dry', () => {
    const allMaxed = Object.fromEntries(PERK_IDS.map((id) => [id, PERKS[id].maxLevel]));
    expect(rollOffers(allMaxed, 9, 1)[0]).toEqual([null, null, null]);
  });
});

describe('run loop', () => {
  it('pays stage reward plus kill coins and opens the shop', () => {
    const run = clearStage(newRun(42), 17);
    expect(run.money).toBe(STAGES[0]!.reward + 17);
    expect(shopOf(run).offers).toHaveLength(3);
  });

  it('refresh costs money, rises each time, and rerolls', () => {
    let run = { ...clearStage(newRun(42), 0), money: 100 };
    const first = refreshCost(run);
    const r1 = refreshShop(run);
    if (!r1.ok) throw new Error(r1.reason);
    run = r1.run;
    expect(run.money).toBe(100 - first);
    expect(refreshCost(run)).toBeGreaterThan(first);
    expect(refreshShop({ ...run, money: 0 })).toEqual({ ok: false, reason: 'notEnoughMoney' });
  });

  it('buying a perk again levels it up and sells out the slot', () => {
    let run = withOffers(clearStage(newRun(1), 0), ['heavyCaliber', 'reinforcedHull', null], 500);
    const bought = buyOffer(run, 0);
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.run.perks.heavyCaliber).toBe(1);
    expect(shopOf(bought.run).offers[0]).toBeNull();
    expect(buyOffer(bought.run, 0)).toEqual({ ok: false, reason: 'soldOut' });

    run = withOffers(bought.run, ['heavyCaliber'], bought.run.money);
    const again = buyOffer(run, 0);
    if (!again.ok) throw new Error(again.reason);
    expect(again.run.perks.heavyCaliber).toBe(2);
    expect(500 - bought.run.money).toBe(20);
    expect(run.money - again.run.money).toBe(40);
  });

  it('hull upgrades raise current HP with max HP', () => {
    const run = withOffers(clearStage(newRun(1), 0), ['reinforcedHull'], 500);
    const r = buyOffer(run, 0);
    if (!r.ok) throw new Error(r.reason);
    expect(r.run.hp).toBe(run.hp + 1);
  });

  it('reaches both bosses and ends in victory after stage 10', () => {
    let run = newRun(7);
    const kinds: string[] = [];
    while (run.phase.kind !== 'victory') {
      kinds.push(STAGES[run.stage - 1]!.kind);
      run = leaveShop(clearStage(run, 0));
    }
    expect(kinds).toHaveLength(10);
    expect(kinds[4]).toBe('boss');
    expect(kinds[9]).toBe('boss');
  });
});
