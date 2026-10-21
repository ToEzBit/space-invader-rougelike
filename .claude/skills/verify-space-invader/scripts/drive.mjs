#!/usr/bin/env node
// Usage: drive.mjs <run-id> <journey...|all> [--headed]
// Drives the game in the system Google Chrome via Playwright and writes evidence to
// .verify/<run-id>/evidence/<journey>/ (numbered PNGs + log.json). Exit code 1 on any failed check.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId, ...rest] = process.argv.slice(2);
const headed = rest.includes('--headed');
const names = rest.filter((a) => !a.startsWith('--'));
if (!runId || names.length === 0) {
  console.error('usage: drive.mjs <run-id> <journey...|all> [--headed]');
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const URL = `http://127.0.0.1:${port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness(page, outDir) {
  const log = { steps: [], checks: [], consoleErrors: [] };
  let shotNo = 0;
  page.on('console', (m) => m.type() === 'error' && log.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => log.consoleErrors.push(`pageerror: ${e.message}`));

  const state = () => page.evaluate(() => window.__game?.state() ?? null);
  const game = (fn, ...args) => page.evaluate(([fn, args]) => window.__game[fn](...args), [fn, args]);
  const core = (expr) => page.evaluate(async (expr) => {
    const run = await import('/src/core/run.ts');
    const perks = await import('/src/core/perks.ts');
    return new Function('run', 'perks', `return (${expr})`)(run, perks);
  }, expr);

  async function waitFor(label, pred, timeoutMs = 6000) {
    const end = Date.now() + timeoutMs;
    let s;
    while (Date.now() < end) {
      s = await state();
      if (s && pred(s)) return s;
      await sleep(80);
    }
    throw new Error(`timed out waiting for ${label}; last state ${JSON.stringify(s)}`);
  }

  function check(label, ok, detail = {}) {
    log.checks.push({ label, ok: Boolean(ok), ...detail });
    if (!ok) throw new Error(`check failed: ${label} ${JSON.stringify(detail)}`);
  }

  async function step(action, fn) {
    const before = await state();
    await fn();
    const after = await state();
    log.steps.push({ action, before: summarize(before), after: summarize(after) });
    return after;
  }

  async function shot(name) {
    const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
    await page.screenshot({ path: join(outDir, file) });
    log.steps.push({ screenshot: file, state: summarize(await state()) });
  }

  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await sleep(ms);
    await page.keyboard.up(key);
  };

  // Debug start for preconditions only; the feature under test is then driven with real keys.
  async function startAt(stage, perks = {}, money = 0) {
    if (!(await state())) await openTitle();
    await game('start', stage, perks, money);
    return waitFor(`stage ${stage} fighting`, (s) => s.scenes.includes('Stage') && s.run?.stage === stage && s.life === 'fighting');
  }

  async function openTitle() {
    await page.goto(URL);
    return waitFor('Title scene', (s) => s.scenes.includes('Title'), 15000);
  }

  return { log, state, game, core, waitFor, check, step, shot, hold, startAt, openTitle, page };
}

function summarize(s) {
  if (!s) return null;
  const { run, ...restState } = s;
  return {
    ...restState,
    run: run && { stage: run.stage, money: run.money, hp: run.hp, phase: run.phase.kind, perks: run.perks, shop: run.phase.shop },
  };
}

const JOURNEYS = {
  async doctor(h) {
    const s = await h.openTitle();
    h.check('debug hook installed (dev build)', s !== null);
    h.check('Title scene active after boot', s.scenes.includes('Title'), { scenes: s.scenes });
    await h.shot('title');
  },

  async 'title-start'(h) {
    await h.openTitle();
    await h.shot('title');
    const s = await h.step('press Enter on title', () => h.page.keyboard.press('Enter'));
    const playing = await h.waitFor('stage 1 fighting', (x) => x.scenes.includes('Stage') && x.life === 'fighting');
    h.check('Enter starts a fresh run at stage 1', playing.run.stage === 1 && playing.run.phase.kind === 'playing' && playing.run.money === 0, summarize(playing).run);
    h.check('stage 1 formation is 3 rows x 8', playing.foes === 24, { foes: playing.foes });
    h.check('full HP', playing.run.hp === 3, { hp: playing.run.hp, afterEnter: s.scenes });
    await h.shot('stage1');
  },

  async combat(h) {
    await h.openTitle();
    await h.page.keyboard.press('Enter');
    const s0 = await h.waitFor('stage 1 fighting', (x) => x.life === 'fighting');
    const left = await h.step('hold ArrowLeft 500ms', () => h.hold('ArrowLeft', 500));
    h.check('ArrowLeft moves the ship left', left.player.x < s0.player.x, { from: s0.player.x, to: left.player.x });
    const right = await h.step('hold D 900ms', () => h.hold('d', 900));
    h.check('D moves the ship right', right.player.x > left.player.x, { from: left.player.x, to: right.player.x });
    await sleep(2500);
    await h.shot('firing');
    await sleep(1500);
    const fired = await h.state();
    h.check('the ship auto-fires and kills invaders with no key pressed', fired.foes < right.foes, { before: right.foes, after: fired.foes });
    h.check('kills drop coins', fired.coins > 0, { coins: fired.coins });
  },

  async shop(h) {
    await h.startAt(1, {}, 200);
    await h.game('kill');
    const s0 = await h.waitFor('Shop scene', (x) => x.scenes.includes('Shop'));
    await h.shot('shop');
    h.check('shop offers 3 cards', s0.cards.length === 3 && s0.cards.every(Boolean), { cards: s0.cards });

    const refreshCost = await h.core('run.refreshCost(' + JSON.stringify(s0.run) + ')');
    const s1 = await h.step('press R', () => h.page.keyboard.press('r'));
    h.check('R charges refreshCost once', s1.run.money === s0.run.money - refreshCost && s1.run.phase.shop.refreshes === 1, { before: s0.run.money, after: s1.run.money, refreshCost });
    h.check('R rerolls 3 offers', s1.cards.length === 3 && s1.cards.every(Boolean), { before: s0.cards, after: s1.cards });
    await h.shot('after-refresh');

    const id = s1.cards[0];
    const cost = await h.core(`run.offerCost(${JSON.stringify(s1.run)}, ${JSON.stringify(id)})`);
    const s2 = await h.step('press 1', () => h.page.keyboard.press('1'));
    h.check('1 buys card 1 at offerCost', s2.run.money === s1.run.money - cost && s2.run.perks[id] === 1, { id, cost, money: s2.run.money });
    h.check('bought card is sold out', s2.cards[0] === null, { cards: s2.cards });
    await sleep(700);
    await h.shot('after-buy');

    const s3 = await h.step('press 1 again', () => h.page.keyboard.press('1'));
    h.check('sold-out card does not charge again', s3.run.money === s2.run.money, { money: s3.run.money });

    await h.step('press Enter', () => h.page.keyboard.press('Enter'));
    const next = await h.waitFor('stage 2 fighting', (x) => x.scenes.includes('Stage') && x.run?.stage === 2);
    h.check('Enter continues to stage 2 keeping money and perks', next.run.money === s3.run.money && next.run.perks[id] === 1, summarize(next).run);
  },

  async 'perk-mechanics'(h) {
    await h.openTitle();
    await h.game('start', 1, { prismLance: 1 });
    const i0 = await h.waitFor('stage 1 intro', (x) => x.scenes.includes('Stage') && x.life === 'intro');
    const intro = [];
    let s = i0;
    while (s.life === 'intro') {
      intro.push({ foes: s.foes, laserFiring: s.laserFiring });
      await sleep(40);
      s = await h.state();
    }
    h.check('nothing fires during the intro banner', intro.length > 3 && intro.every((x) => !x.laserFiring && x.foes === i0.foes), { samples: intro.length, foes: i0.foes, fired: intro.filter((x) => x.laserFiring || x.foes !== i0.foes) });
    const l0 = await h.waitFor('stage 1 fighting', (x) => x.life === 'fighting');
    await h.waitFor('laser firing', (x) => x.laserFiring, 3000);
    // The beam is first drawn on the frame after the laser arms.
    await sleep(120);
    await h.game('pause');
    await h.shot('laser');
    await h.game('resume');
    await sleep(1500);
    const l1 = await h.state();
    h.check('laser stage kills invaders', l1.foes < l0.foes, { before: l0.foes, after: l1.foes });

    const locked = await h.startAt(1, {});
    await h.page.keyboard.press('Shift');
    await sleep(300);
    h.check('Shift does nothing without Afterburner Dash', !(await h.state()).dashing && locked.player.y === (await h.state()).player.y);

    const d0 = await h.startAt(3, { afterburnerDash: 1 });
    await h.page.keyboard.press('Shift');
    const mid = await h.waitFor('dashing', (x) => x.dashing, 1000);
    await h.game('pause');
    await h.shot('dash');
    await h.game('resume');
    h.check('dash launches the ship upward', mid.player.y < d0.player.y, { from: d0.player.y, mid: mid.player.y });
    const back = await h.waitFor('dash finished', (x) => !x.dashing, 4000);
    h.check('ship returns to its row after the dash', Math.abs(back.player.y - d0.player.y) < 1, { y: back.player.y });
    h.check('dash survived without HP loss', back.run.hp === d0.run.hp, { hp: back.run.hp });
  },

  async bosses(h) {
    const b0 = await h.startAt(5);
    h.check('stage 5 is Crimson Seraph at full HP', b0.boss?.name === 'Crimson Seraph' && b0.boss.hpRatio === 1 && b0.boss.phase === 0, { boss: b0.boss });
    await sleep(3000);
    const b1 = await h.state();
    h.check('player fire damages the boss', b1.boss.hpRatio < 1, { hpRatio: b1.boss.hpRatio });
    await h.game('bossHp', 0.45);
    await h.waitFor('Seraph phase 2', (x) => x.boss?.phase === 1, 10000);
    await sleep(1200);
    await h.shot('seraph-phase2');

    const e0 = await h.startAt(10);
    h.check('stage 10 is Void Empress', e0.boss?.name === 'Void Empress' && e0.boss.phase === 0, { boss: e0.boss });
    await h.game('bossHp', 0.3);
    await h.waitFor('Empress phase 3', (x) => x.boss?.phase === 2, 10000);
    await sleep(1500);
    await h.shot('empress-phase3');
  },

  async 'run-end'(h) {
    await h.startAt(10);
    await h.game('kill');
    const won = await h.waitFor('End scene', (x) => x.scenes.includes('End'), 8000);
    h.check('clearing stage 10 is victory', won.run.phase.kind === 'victory', { phase: won.run.phase.kind });
    await sleep(600);
    await h.shot('victory');
    await h.step('press Enter on End', () => h.page.keyboard.press('Enter'));
    await h.waitFor('back to Title', (x) => x.scenes.includes('Title'));

    const s0 = await h.startAt(1);
    for (let i = 0; i < s0.run.hp; i++) {
      await h.game('hurt');
      await sleep(150);
    }
    const lost = await h.waitFor('End scene after defeat', (x) => x.scenes.includes('End'), 8000);
    h.check('losing all HP is defeat', lost.run.phase.kind === 'defeat' && lost.run.hp === 0, summarize(lost).run);
    await sleep(600);
    await h.shot('defeat');
  },
};

const selected = names.includes('all') ? Object.keys(JOURNEYS).filter((n) => n !== 'doctor') : names;
const unknown = selected.filter((n) => !JOURNEYS[n]);
if (unknown.length) {
  console.error(`unknown journey(s): ${unknown.join(', ')}. Known: ${Object.keys(JOURNEYS).join(', ')}`);
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
let failed = 0;
for (const name of selected) {
  const outDir = join(ROOT, '.verify', runId, 'evidence', name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 600, height: 800 } });
  const page = await context.newPage();
  const h = harness(page, outDir);
  let error = null;
  try {
    await JOURNEYS[name](h);
    h.check('no console errors', h.log.consoleErrors.length === 0, { errors: h.log.consoleErrors });
  } catch (e) {
    error = e.message;
    await page.screenshot({ path: join(outDir, 'failure.png') }).catch(() => {});
  }
  writeFileSync(join(outDir, 'log.json'), JSON.stringify({ journey: name, url: URL, ok: !error, error, ...h.log }, null, 2));
  console.log(`${error ? 'FAIL' : 'PASS'} ${name}${error ? `: ${error}` : ''} -> ${outDir}`);
  if (error) failed++;
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
