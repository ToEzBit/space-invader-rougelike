#!/usr/bin/env node
// Usage: measure.mjs <run-id> <cell...|all> [--runs N] [--headed]
// Fights a boss with __game.god(true) and a ship that weaves left and right under it, one run at a time, and prints
// one JSON line per run plus a median/range summary per cell. Time-to-kill is game time (capped frame deltas while
// life is 'fighting'), so a slow frame rate cannot stretch it. Reads boss {x, maxHp}, clock and tally, plus boss.form
// where the build has it, to split hits per minute by form.
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
const names = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--runs');

// Budgets come from the stage table: entering stage 5 a run has earned at most 366 coins (every kill plus rewards),
// entering stage 10 at most 1252. Typical spends about half, strong nearly all, using only tiers the shop offers.
const CELLS = {
  's5-typical': { stage: 5, perks: { hairTrigger: 2, heavyCaliber: 1, twinCannons: 1, prismLance: 1, reinforcedHull: 1 } },
  's5-strong': { stage: 5, perks: { hairTrigger: 3, heavyCaliber: 2, twinCannons: 2, prismLance: 1, focusLens: 1 } },
  's10-typical': {
    stage: 10,
    perks: { hairTrigger: 3, heavyCaliber: 2, twinCannons: 2, spreadFan: 1, prismLance: 2, focusLens: 1, capacitorBank: 1, reinforcedHull: 2, luckyStar: 1, seekerMissiles: 1 },
  },
  's10-strong': {
    stage: 10,
    perks: { hairTrigger: 3, heavyCaliber: 3, twinCannons: 2, luckyStar: 2, seekerMissiles: 2, optionDrones: 1, overdrive: 1, prismLance: 3, focusLens: 2, reinforcedHull: 2 },
  },
};
// The ship turns back once it is this far past the boss on either side, or at a wall.
const WEAVE_PX = 110;
const WALLS = { left: 50, right: 430 };
const MAX_GAME_MS = 400_000;

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
  const wallStart = Date.now();
  let key = 'ArrowRight';
  await page.keyboard.down(key);
  let last = s;
  // The tally when the second form first shows, so each form's pressure can be read on its own.
  let split = null;
  while (s.life === 'fighting' && s.clock.fightMs < MAX_GAME_MS) {
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
  }
  await page.keyboard.up(key);
  const end = s.life === 'fighting' ? s : last;
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
    killed: s.life !== 'fighting',
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
}
if (errors.length) console.log(`PAGE ERRORS: ${errors.join(' | ')}`);
await browser.close();
