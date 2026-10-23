#!/usr/bin/env node
// Usage: measure.mjs <run-id> <cell...|all> [--runs N] [--trans-am [--hit-budget]] [--headed]
// Fights a boss with __game.god(true) and a ship that weaves left and right under it, one run at a time, and prints
// one JSON line per run plus a median/range summary per cell. Time-to-kill is game time (capped frame deltas while
// life is 'fighting'), so a slow frame rate cannot stretch it. Reads boss {x, maxHp}, clock and tally, plus boss.form
// where the build has it, to split hits per minute by form.
// --trans-am presses Space whenever the TRANS-AM gauge is full and the boss can be hurt, and reports uses, grazes per
// minute, where the gauge came from, and each use's boss damage against the same time at the fight's normal-fire rate. The weaving ship takes
// far more hits than one that lives through the fight, and each costs gauge, so --hit-budget refunds the gauge of
// every hit past maxHp - 1, the most a surviving ship can take.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const runs = Number(flag('--runs', 3));
const headed = rest.includes('--headed');
const useTransAm = rest.includes('--trans-am');
const hitBudget = rest.includes('--hit-budget');
const names = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--runs');

// Budgets come from the stage table plus the hangar's 20 opening coins: entering stage 5 a run holds at most 386
// coins (every kill plus rewards), entering stage 10 at most 1286. Loadouts are priced at the rising shop prices, the
// first level in the earliest shop that offers its tier and each later level one shop after the last: typical costs
// 170 of 386 and 465 of 1286, strong 305 and 805.
const CELLS = {
  's5-typical': { stage: 5, perks: { hairTrigger: 2, heavyCaliber: 1, twinCannons: 1, prismLance: 1, reinforcedHull: 1 } },
  's5-strong': { stage: 5, perks: { hairTrigger: 3, heavyCaliber: 2, twinCannons: 1, prismLance: 1, focusLens: 1 } },
  's10-typical': {
    stage: 10,
    perks: { hairTrigger: 3, heavyCaliber: 2, twinCannons: 1, spreadFan: 1, prismLance: 2, focusLens: 1, reinforcedHull: 2 },
  },
  's10-strong': {
    stage: 10,
    perks: { hairTrigger: 3, heavyCaliber: 2, twinCannons: 2, spreadFan: 1, prismLance: 2, focusLens: 1, capacitorBank: 1, reinforcedHull: 2, luckyStar: 1, seekerMissiles: 1 },
  },
};
// The ship turns back once it is this far past the boss on either side, or at a wall.
const WEAVE_PX = 110;
const WALLS = { left: 50, right: 430 };
const MAX_GAME_MS = 400_000;
// The TRANS-AM cut-in freezes the fight without ending it.
const FIGHTING = ['fighting', 'cutIn'];

const selected = names.includes('all') ? Object.keys(CELLS) : names;
if (!runId || selected.length === 0 || selected.some((n) => !CELLS[n])) {
  console.error(`usage: measure.mjs <run-id> <cell...|all> [--runs N]. Cells: ${Object.keys(CELLS).join(', ')}`);
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const URL = `http://127.0.0.1:${port}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fight(page, cell) {
  const state = () => page.evaluate(() => window.__game.state());
  await page.goto(URL);
  while (!(await page.evaluate(() => window.__game?.state().scenes.includes('Title')))) await sleep(100);
  await page.evaluate(([stage, perks]) => window.__game.start(stage, perks), [cell.stage, cell.perks]);
  let s;
  do {
    await sleep(50);
    s = await state();
  } while (!(s.scenes.includes('Stage') && s.run?.stage === cell.stage && s.life === 'fighting'));
  await page.evaluate(() => window.__game.god(true));
  const ta = useTransAm && (await transAmTracker(page, cell));
  const wallStart = Date.now();
  let key = 'ArrowRight';
  await page.keyboard.down(key);
  let last = s;
  // The tally when the second form first shows, so each form's pressure can be read on its own.
  let split = null;
  while (FIGHTING.includes(s.life) && s.clock.fightMs < MAX_GAME_MS) {
    if (!split && s.boss?.form === 1) split = { ms: s.clock.fightMs, hits: s.tally.hits, contacts: s.tally.contacts };
    const x = s.player.x;
    const bx = s.boss?.x ?? 240;
    const turn = key === 'ArrowRight' ? x > Math.min(bx + WEAVE_PX, WALLS.right) : x < Math.max(bx - WEAVE_PX, WALLS.left);
    if (turn) {
      await page.keyboard.up(key);
      key = key === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.down(key);
    }
    await sleep(30);
    last = s;
    s = await state();
    if (ta) await ta.step(last, s);
  }
  await page.keyboard.up(key);
  const end = FIGHTING.includes(s.life) ? s : last;
  const { clock, tally } = end;
  const min = clock.fightMs / 60000;
  const shotDealt = (tally.dealt.bullet ?? 0) + (tally.dealt.missile ?? 0);
  const perMin = (n, ms) => +(n / (ms / 60000)).toFixed(1);
  const forms = split && {
    form1: { s: +(split.ms / 1000).toFixed(1), hitsPerMin: perMin(split.hits, split.ms), contactsPerMin: perMin(split.contacts, split.ms) },
    form2: {
      s: +((clock.fightMs - split.ms) / 1000).toFixed(1),
      hitsPerMin: perMin(tally.hits - split.hits, clock.fightMs - split.ms),
      contactsPerMin: perMin(tally.contacts - split.contacts, clock.fightMs - split.ms),
    },
  };
  return {
    killed: !FIGHTING.includes(s.life),
    ttkS: +(clock.fightMs / 1000).toFixed(1),
    wallS: +((Date.now() - wallStart) / 1000).toFixed(1),
    bossMaxHp: end.boss?.maxHp,
    hits: tally.hits,
    hitsPerMin: +(tally.hits / min).toFixed(1),
    contacts: tally.contacts,
    contactsPerMin: +(tally.contacts / min).toFixed(1),
    shotHitRatio: +(shotDealt / Math.max(1, tally.fired)).toFixed(3),
    dealt: Object.fromEntries(Object.entries(tally.dealt).map(([k, v]) => [k, Math.round(v)])),
    meanFrameMs: +(clock.fightMs / clock.frames).toFixed(2),
    cappedPct: +((100 * clock.capped) / clock.frames).toFixed(2),
    ...(forms && { forms }),
    ...(ta && { transAm: ta.report(end) }),
  };
}

// Each sample interval counts toward the phase it started in. Normal fire is charging time outside the boss's
// entrance and transformation, when it cannot be hurt. Shots take about a second to reach the boss, so a use also
// counts a tail of charging time after it, which still collects the depleted window's thinner fire.
const TAIL_MS = 1200;
const IMMUNE = ['entering', 'transforming'];

async function transAmTracker(page, cell) {
  const TA = await page.evaluate(() => import('/src/core/transAm.ts').then((m) => m.TRANS_AM));
  const maxHp = await page.evaluate((perks) => import('/src/core/perks.ts').then((m) => m.deriveStats(perks).maxHp), cell.perks);
  const budget = hitBudget ? maxHp - 1 : Infinity;
  let refunded = 0;
  const uses = [];
  const normal = { ms: 0, dealt: 0 };
  const income = { grazes: 0, kills: 0, bossDealt: 0, hits: 0 };
  const span = () => ({ ms: 0, dealt: 0, frames: 0, capped: 0, immuneMs: 0 });
  return {
    async step(a, b) {
      const ms = b.clock.fightMs - a.clock.fightMs;
      const dealt = b.tally.bossDealt - a.tally.bossDealt;
      const kind = a.transAm.kind;
      if (kind === 'charging') {
        income.grazes += b.tally.grazes - a.tally.grazes;
        income.kills += b.tally.kills - a.tally.kills;
        income.bossDealt += dealt;
        income.hits += b.tally.hits - a.tally.hits;
        const over = Math.min(b.tally.hits - a.tally.hits, b.tally.hits - budget);
        if (over > 0) {
          refunded += over;
          await page.evaluate((points) => {
            const t = window.__game.state().transAm;
            if (t.kind === 'charging') window.__game.transAmGauge(t.gauge + points);
          }, over * TA.hitLoss);
        }
        if (!IMMUNE.includes(a.boss?.stance)) {
          normal.ms += ms;
          normal.dealt += dealt;
        }
      }
      const use = uses.at(-1);
      const window = !use ? null : kind === 'charging' ? (use.done && use.tail.ms < TAIL_MS ? use.tail : null) : use[kind];
      if (window) {
        window.ms += ms;
        window.dealt += dealt;
        window.frames += b.clock.frames - a.clock.frames;
        window.capped += b.clock.capped - a.clock.capped;
        if (IMMUNE.includes(a.boss?.stance)) window.immuneMs += ms;
      }
      if (use && kind === 'depleted' && b.transAm.kind === 'charging') use.done = true;
      if (kind !== 'active' && b.transAm.kind === 'active') uses.push({ atS: +(b.clock.fightMs / 1000).toFixed(1), active: span(), depleted: span(), tail: span(), done: false });
      if (b.transAm.kind === 'charging' && b.transAm.gauge >= TA.gaugeMax && !IMMUNE.includes(b.boss?.stance)) await page.keyboard.press('Space');
    },
    report(end) {
      const maxHp = end.boss?.maxHp ?? 1;
      const pct = (x) => +((100 * x) / maxHp).toFixed(2);
      const rate = normal.dealt / Math.max(1, normal.ms);
      const fightDealt = end.tally.bossDealt;
      const perUse = uses.map((u) => {
        const windows = [u.active, u.depleted, u.tail];
        const dealt = windows.reduce((sum, w) => sum + w.dealt, 0);
        const net = dealt - rate * windows.reduce((sum, w) => sum + w.ms, 0);
        // The same, with the time the boss could not be hurt left out of the normal-fire comparison.
        const hurtableNet = dealt - rate * windows.reduce((sum, w) => sum + w.ms - w.immuneMs, 0);
        return {
          atS: u.atS,
          done: u.done && u.tail.ms >= TAIL_MS,
          activeHpPct: pct(u.active.dealt),
          normalHpPct: pct(rate * u.active.ms),
          depletedHpPct: pct(u.depleted.dealt + u.tail.dealt),
          depletedNormalHpPct: pct(rate * (u.depleted.ms + u.tail.ms)),
          activeImmuneS: +(u.active.immuneMs / 1000).toFixed(1),
          netPctOfFight: +((100 * net) / fightDealt).toFixed(2),
          hurtableNetPctOfFight: +((100 * hurtableNet) / fightDealt).toFixed(2),
          activeCappedPct: +((100 * u.active.capped) / Math.max(1, u.active.frames)).toFixed(2),
        };
      });
      const done = perUse.filter((u) => u.done);
      const minutes = end.clock.fightMs / 60000;
      return {
        uses: uses.length,
        grazes: end.tally.grazes,
        grazesPerMin: +(end.tally.grazes / minutes).toFixed(1),
        // Gauge points earned while charging, by source, before the cap and the floor clip them.
        income: {
          grazes: income.grazes * TA.gain.graze,
          kills: income.kills * TA.gain.kill,
          boss: +((TA.gain.bossHpPercent * 100 * income.bossDealt) / maxHp).toFixed(1),
          hits: -(income.hits - refunded) * TA.hitLoss,
        },
        ...(hitBudget && { hitBudget: budget, refundedHits: refunded }),
        normalHpPctPerS: pct(rate * 1000),
        fightHpPct: pct(fightDealt),
        netPctPerUse: done.length ? +(done.reduce((sum, u) => sum + u.netPctOfFight, 0) / done.length).toFixed(2) : null,
        hurtableNetPctPerUse: done.length ? +(done.reduce((sum, u) => sum + u.hurtableNetPctOfFight, 0) / done.length).toFixed(2) : null,
        perUse,
      };
    },
  };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
const context = await browser.newContext({ viewport: { width: 600, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
for (const name of selected) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    const r = await fight(page, CELLS[name]);
    results.push(r);
    console.log(JSON.stringify({ cell: name, run: i + 1, ...r }));
  }
  const pick = (k) => results.map((r) => r[k]);
  const span = (k) => `${median(pick(k))} [${Math.min(...pick(k))}-${Math.max(...pick(k))}]`;
  console.log(`SUMMARY ${name}: ttkS ${span('ttkS')} hitsPerMin ${span('hitsPerMin')} contactsPerMin ${span('contactsPerMin')} shotHitRatio ${span('shotHitRatio')} cappedPct ${span('cappedPct')}`);
  if (useTransAm) {
    const ta = (k) => results.map((r) => r.transAm[k]).filter((v) => v !== null);
    const taSpan = (k) => (ta(k).length ? `${median(ta(k))} [${Math.min(...ta(k))}-${Math.max(...ta(k))}]` : 'n/a');
    console.log(`SUMMARY ${name} trans-am: uses ${taSpan('uses')} grazesPerMin ${taSpan('grazesPerMin')} netPctPerUse ${taSpan('netPctPerUse')} hurtableNetPctPerUse ${taSpan('hurtableNetPctPerUse')}`);
  }
}
if (errors.length) console.log(`PAGE ERRORS: ${errors.join(' | ')}`);
await browser.close();
