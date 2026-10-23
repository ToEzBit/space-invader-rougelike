import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './stats';
import { ITEMS, ITEM_IDS, ITEM_STACK_MAX, itemForCode, withBuffs, type ItemId, type OwnedItems } from './items';
import { PERKS, PERK_IDS, deriveStats, describePerk, perkCost, type OwnedPerks, type PerkId } from './perks';
import { STAGES } from './stages';
import { buyOffer, carryTransAm, clearStage, heal, leaveShop, newRun, offerCost, openRun, refreshCost, refreshShop, rollOffers, takeHit, useItem, type Offer, type RunState } from './run';

function shopOf(run: RunState) {
  if (run.phase.kind !== 'shop') throw new Error(`expected shop, got ${run.phase.kind}`);
  return run.phase.shop;
}

function withOffers(run: RunState, offers: (Offer | null)[], money: number): RunState {
  return { ...run, money, phase: { kind: 'shop', shop: { offers, refreshes: 0 } } };
}

const perk = (id: PerkId): Offer => ({ kind: 'perk', id });
const item = (id: ItemId): Offer => ({ kind: 'item', id });

function roll(stage: number, seed: number, perks: OwnedPerks = {}, items: OwnedItems = {}) {
  return rollOffers({ perks, items, stage, rng: seed })[0];
}

const ALL_PERKS_MAXED: OwnedPerks = Object.fromEntries(PERK_IDS.map((id) => [id, PERKS[id].maxLevel]));
const ALL_ITEMS_FULL: OwnedItems = Object.fromEntries(ITEM_IDS.map((id) => [id, ITEM_STACK_MAX]));

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
      const offers = roll(1, seed);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o?.id)).size).toBe(3);
      for (const o of offers) {
        if (o?.kind !== 'perk') continue;
        expect(PERKS[o.id].tier).toBe(1);
        expect(PERKS[o.id].requires).toBeUndefined();
      }
    }
  });

  it('later shops can offer tier 4 perks, never maxed ones', () => {
    const owned = { prismLance: 3, afterburnerDash: 3, hairTrigger: 3 } as const;
    const seen = new Set<PerkId>();
    for (let seed = 1; seed < 300; seed++) roll(8, seed, owned).forEach((o) => o?.kind === 'perk' && seen.add(o.id));
    expect([...seen].some((id) => PERKS[id].tier === 4)).toBe(true);
    expect(seen.has('hairTrigger')).toBe(false);
  });

  it('mixes items into about one slot in five, from the first shop on', () => {
    for (const stage of [1, 5, 9]) {
      const slots = [0, 0, 0];
      const seeds = 4000;
      for (let seed = 1; seed <= seeds; seed++) roll(stage, seed * 7919).forEach((o, slot) => o?.kind === 'item' && slots[slot]!++);
      for (const count of slots) {
        expect(count / seeds).toBeGreaterThan(0.15);
        expect(count / seeds).toBeLessThan(0.25);
      }
    }
  });

  it('never offers an item held at the stack cap, nor the same item twice in one roll', () => {
    for (let seed = 1; seed < 2000; seed++) {
      const items = roll(3, seed, {}, { nitro: ITEM_STACK_MAX, repairKit: 2 }).flatMap((o) => (o?.kind === 'item' ? [o.id] : []));
      expect(items).not.toContain('nitro');
      expect(new Set(items).size).toBe(items.length);
    }
  });

  it('fills slots with items once every perk is maxed', () => {
    const offers = roll(9, 1, ALL_PERKS_MAXED);
    expect(offers.every((o) => o?.kind === 'item')).toBe(true);
  });

  it('leaves empty slots only when both pools run dry', () => {
    expect(roll(9, 1, ALL_PERKS_MAXED, ALL_ITEMS_FULL)).toEqual([null, null, null]);
  });
});

describe('items', () => {
  it('bind Z X C V B in registry order, with 1 to 5 as a fallback, each with a Thai description', () => {
    expect(ITEM_IDS.map((id) => ITEMS[id].key)).toEqual(['Z', 'X', 'C', 'V', 'B']);
    ITEM_IDS.forEach((id, i) => {
      expect(itemForCode(`Key${ITEMS[id].key}`)).toBe(id);
      expect(itemForCode(`Digit${i + 1}`)).toBe(id);
      expect(ITEMS[id].desc).toMatch(/[฀-๿]/);
    });
  });

  it('match physical key codes only', () => {
    for (const code of ['z', 'Z', '1', 'Digit6', 'Numpad1', 'KeyA', 'ShiftLeft', 'Space']) expect(itemForCode(code)).toBeNull();
  });

  it('buff folds scale the stats they boost on top of perks', () => {
    const base = deriveStats({ heavyCaliber: 1 });
    const boosted = withBuffs(base, ['nitro', 'powerCell', 'overclock']);
    expect(boosted.moveSpeed).toBeCloseTo(base.moveSpeed * 1.5);
    expect(boosted.bulletDamage).toBeCloseTo(base.bulletDamage * 1.5);
    expect(boosted.fireIntervalMs).toBeCloseTo(base.fireIntervalMs * 0.6);
    expect(withBuffs(base, [])).toEqual(base);
  });

  it('buying an item adds one to the stack and sells out the slot', () => {
    const run = withOffers(clearStage(newRun(1), 0), [item('nitro'), perk('heavyCaliber'), null], 100);
    const bought = buyOffer(run, 0);
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.run.items.nitro).toBe(1);
    expect(bought.run.money).toBe(100 - ITEMS.nitro.cost);
    expect(offerCost(run, item('nitro'))).toBe(ITEMS.nitro.cost);
    expect(shopOf(bought.run).offers[0]).toBeNull();
    expect(buyOffer(bought.run, 0)).toEqual({ ok: false, reason: 'soldOut' });
  });

  it('refuses to buy past the stack cap', () => {
    const run = withOffers({ ...clearStage(newRun(1), 0), items: { nitro: ITEM_STACK_MAX } }, [item('nitro')], 100);
    expect(buyOffer(run, 0)).toEqual({ ok: false, reason: 'stackFull' });
  });

  it('using an item spends one and reports its effect', () => {
    const run = { ...newRun(1), items: { nitro: 2 } };
    const used = useItem(run, 'nitro');
    expect(used?.run.items.nitro).toBe(1);
    expect(used?.effect).toEqual(ITEMS.nitro.effect);
    expect(useItem(run, 'overclock')).toBeNull();
  });

  it('a repair kit heals 1 HP and is refused at full HP', () => {
    const full = { ...newRun(1), items: { repairKit: 1 } };
    expect(useItem(full, 'repairKit')).toBeNull();
    const hurt = takeHit(full, 1);
    const used = useItem(hurt, 'repairKit');
    expect(used?.run.hp).toBe(hurt.hp + 1);
    expect(used?.run.items.repairKit).toBe(0);
  });

  it('carry across stages and cannot be used in the shop', () => {
    const shop = clearStage({ ...newRun(1), items: { nitro: 1 } }, 0);
    expect(useItem(shop, 'nitro')).toBeNull();
    expect(leaveShop(shop).items.nitro).toBe(1);
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
    let run = withOffers(clearStage(newRun(1), 0), [perk('heavyCaliber'), perk('reinforcedHull'), null], 500);
    const bought = buyOffer(run, 0);
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.run.perks.heavyCaliber).toBe(1);
    expect(shopOf(bought.run).offers[0]).toBeNull();
    expect(buyOffer(bought.run, 0)).toEqual({ ok: false, reason: 'soldOut' });

    run = withOffers(bought.run, [perk('heavyCaliber')], bought.run.money);
    const again = buyOffer(run, 0);
    if (!again.ok) throw new Error(again.reason);
    expect(again.run.perks.heavyCaliber).toBe(2);
    expect(500 - bought.run.money).toBe(20);
    expect(run.money - again.run.money).toBe(40);
  });

  it('hull upgrades raise current HP with max HP', () => {
    const run = withOffers(clearStage(newRun(1), 0), [perk('reinforcedHull')], 500);
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

  it('hits lower HP and the last one ends the run', () => {
    const run = newRun(3);
    const hit = takeHit(run, 1);
    expect(hit.hp).toBe(run.hp - 1);
    expect(hit.phase.kind).toBe('playing');
    const dead = takeHit(hit, 99);
    expect(dead.hp).toBe(0);
    expect(dead.phase.kind).toBe('defeat');
  });

  it('heals up to max HP only', () => {
    const run = takeHit(newRun(3), 2);
    expect(heal(run, 1).hp).toBe(run.hp + 1);
    expect(heal(run, 99).hp).toBe(deriveStats(run.perks).maxHp);
  });
});

describe('opening hangar', () => {
  it('opens a run in the shop before stage 1 with 20 coins and one tier 1 starter perk per branch, each costing 20', () => {
    for (const seed of [1, 2, 3, 99]) {
      const run = openRun(seed);
      expect(run.stage).toBe(0);
      expect(run.money).toBe(20);
      const offers = shopOf(run).offers;
      const perks = offers.map((o) => (o?.kind === 'perk' ? PERKS[o.id] : null));
      expect(perks.map((p) => p?.branch)).toEqual(['rapid', 'laser', 'ram']);
      for (const p of perks) {
        expect(p?.tier).toBe(1);
        expect(p?.requires).toBeUndefined();
      }
      expect(offers.map((o) => offerCost(run, o!))).toEqual([20, 20, 20]);
    }
  });

  it('varies the starter offers with the seed', () => {
    const sets = new Set(Array.from({ length: 300 }, (_, seed) => JSON.stringify(shopOf(openRun(seed + 1)).offers)));
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });

  it('refuses a refresh in the hangar', () => {
    const run = openRun(5);
    expect(refreshShop(run)).toEqual({ ok: false, reason: 'hangar' });
  });

  it('launches stage 1 with the perk bought there and no coins left', () => {
    const run = openRun(5);
    const offer = shopOf(run).offers[1]!;
    const bought = buyOffer(run, 1);
    if (!bought.ok) throw new Error(bought.reason);
    const launched = leaveShop(bought.run);
    expect(launched.stage).toBe(1);
    expect(launched.phase.kind).toBe('playing');
    expect(launched.money).toBe(0);
    expect(launched.perks).toEqual({ [offer.id]: 1 });
  });

  it('keeps the 20 coins for the first real shop when nothing is bought', () => {
    const launched = leaveShop(openRun(5));
    expect(launched).toMatchObject({ stage: 1, money: 20, phase: { kind: 'playing' }, perks: {} });
    expect(clearStage(launched, 17).money).toBe(20 + STAGES[0]!.reward + 17);
  });

  it('leaves newRun starting straight at stage 1', () => {
    expect(newRun(5)).toMatchObject({ stage: 1, money: 0, phase: { kind: 'playing' }, perks: {} });
  });
});

describe('shop prices', () => {
  const shopAfter = (stage: number, money = 0) => ({ ...clearStage({ ...newRun(1), stage }, 0), money });

  it('the shop after stage 1 charges base prices', () => {
    const run = shopAfter(1);
    for (const id of PERK_IDS) expect(offerCost(run, perk(id))).toBe(perkCost(PERKS[id], 1));
    for (const id of ITEM_IDS) expect(offerCost(run, item(id))).toBe(ITEMS[id].cost);
  });

  it('after stage 6 a level 1 tier 1 perk costs 40 and a 25-coin item costs 50', () => {
    const run = shopAfter(6);
    expect(PERKS.hairTrigger.tier).toBe(1);
    expect(offerCost(run, perk('hairTrigger'))).toBe(40);
    expect(ITEMS.repairKit.cost).toBe(25);
    expect(offerCost(run, item('repairKit'))).toBe(50);
  });

  it('every price at every stage and level is a multiple of 5', () => {
    for (let stage = 1; stage <= 9; stage++) {
      const prices = [
        ...ITEM_IDS.map((id) => offerCost(shopAfter(stage), item(id))),
        ...PERK_IDS.flatMap((id) => Array.from({ length: PERKS[id].maxLevel }, (_, lv) => offerCost({ ...shopAfter(stage), perks: { [id]: lv } }, perk(id)))),
      ];
      for (const price of prices) {
        expect(price % 5).toBe(0);
        expect(price).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('buying charges exactly the shown price', () => {
    const run = withOffers(shopAfter(6), [perk('hairTrigger'), item('nitro'), null], 200);
    const perkBought = buyOffer(run, 0);
    if (!perkBought.ok) throw new Error(perkBought.reason);
    expect(run.money - perkBought.run.money).toBe(40);
    const itemBought = buyOffer(perkBought.run, 1);
    if (!itemBought.ok) throw new Error(itemBought.reason);
    expect(perkBought.run.money - itemBought.run.money).toBe(offerCost(run, item('nitro')));
    expect(offerCost(run, item('nitro'))).toBeGreaterThan(ITEMS.nitro.cost);
  });

  it('refuses a buy the money covers at base price but not at the risen price', () => {
    const run = withOffers(shopAfter(6), [perk('hairTrigger')], 39);
    expect(buyOffer(run, 0)).toEqual({ ok: false, reason: 'notEnoughMoney' });
  });
});

describe('trans-am carry', () => {
  it('starts a run with an empty TRANS-AM gauge and carries it through the shop', () => {
    const run = newRun(5);
    expect(run.transAmGauge).toBe(0);
    const next = leaveShop(clearStage(carryTransAm(run, 37), 0));
    expect(next.phase.kind).toBe('playing');
    expect(next.stage).toBe(2);
    expect(next.transAmGauge).toBe(37);
  });
});
