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

  // `region` is in 480x640 world units and is mapped onto the scaled canvas.
  async function shot(name, region) {
    const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`;
    let clip;
    if (region) {
      const box = await page.locator('canvas').boundingBox();
      const k = box.width / 480;
      clip = { x: box.x + region.x * k, y: box.y + region.y * k, width: region.w * k, height: region.h * k };
    }
    await page.screenshot({ path: join(outDir, file), clip });
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
    const mid = await h.waitFor('dashing ship lifting off', (x) => x.dashing && x.player.y < d0.player.y, 1000);
    await h.game('pause');
    await h.shot('dash');
    await h.game('resume');
    h.check('dash launches the ship upward', mid.player.y < d0.player.y, { from: d0.player.y, mid: mid.player.y });
    const back = await h.waitFor('dash finished', (x) => !x.dashing, 4000);
    h.check('ship returns to its row after the dash', Math.abs(back.player.y - d0.player.y) < 1, { y: back.player.y });
    h.check('dash survived without HP loss', back.run.hp === d0.run.hp, { hp: back.run.hp });
  },

  async 'skill-hud'(h) {
    const TRAY = { x: 0, y: 570, w: 180, h: 70 };
    const slot = (s, id) => s.skills.find((k) => k.id === id);
    const pausedShots = async (name) => {
      await h.game('pause');
      await h.shot(name);
      await h.shot(`${name}-closeup`, TRAY);
      await h.game('resume');
    };

    const d0 = await h.startAt(3, { afterburnerDash: 1 });
    h.check('only the dash slot shows with Afterburner Dash', d0.skills.length === 1 && slot(d0, 'dash')?.kind === 'ready', { skills: d0.skills });
    const cooldownMs = await h.core('perks.deriveStats({ afterburnerDash: 1 }).dashCooldownMs');
    await h.step('press Shift', () => h.page.keyboard.press('Shift'));
    const c1 = await h.waitFor('dash cooling', (x) => slot(x, 'dash')?.kind === 'cooling', 1000);
    h.check('dash slot cools down with time left after Shift', slot(c1, 'dash').msLeft > 0 && slot(c1, 'dash').msLeft <= cooldownMs, { dash: slot(c1, 'dash'), cooldownMs });
    await sleep(500);
    const c2 = await h.state();
    h.check('dash countdown ticks down', slot(c2, 'dash').kind === 'cooling' && slot(c2, 'dash').msLeft < slot(c1, 'dash').msLeft, { first: slot(c1, 'dash'), second: slot(c2, 'dash') });
    await pausedShots('dash-cooling-early');
    const late = await h.waitFor('dash cooldown past half', (x) => slot(x, 'dash')?.kind === 'cooling' && slot(x, 'dash').msLeft < cooldownMs * 0.35, cooldownMs);
    await pausedShots('dash-cooling-late');
    const ready = await h.waitFor('dash ready again', (x) => slot(x, 'dash')?.kind === 'ready', slot(late, 'dash').msLeft + 1000);
    await h.game('pause');
    await h.shot('dash-ready-closeup', TRAY);
    await h.game('resume');
    h.check('dash slot returns to ready after the cooldown', slot(ready, 'dash').kind === 'ready', { skills: ready.skills });
    await h.step('press Shift, then hold ArrowLeft to the wall', async () => {
      await h.page.keyboard.press('Shift');
      await sleep(1300);
      await h.hold('ArrowLeft', 1500);
    });
    await pausedShots('ship-left-wall');

    await h.startAt(3, { afterburnerDash: 1, twinComet: 1 });
    await h.step('press Shift with two charges', () => h.page.keyboard.press('Shift'));
    await h.waitFor('first dash finished', (x) => !x.dashing, 4000);
    await sleep(1500);
    const spare = await h.state();
    h.check('a spare charge keeps the dash slot ready', slot(spare, 'dash').kind === 'ready', { skills: spare.skills });
    await pausedShots('dash-spare-charge');
    await h.step('press Shift on the last charge', () => h.page.keyboard.press('Shift'));
    const empty = await h.waitFor('dash cooling on the last charge', (x) => slot(x, 'dash')?.kind === 'cooling', 1000);
    h.check('spending the last charge starts the cooldown', slot(empty, 'dash').msLeft > 0, { dash: slot(empty, 'dash') });

    await h.startAt(3, { prismLance: 1, orbitalCannon: 1 });
    const seen = [];
    let shotActive = false;
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      const s = await h.state();
      const kind = slot(s, 'laser')?.kind;
      if (seen.at(-1)?.laser !== kind) seen.push({ laser: kind, orbital: slot(s, 'orbital')?.kind, ids: s.skills.map((k) => k.id) });
      if (kind === 'active' && !shotActive) {
        shotActive = true;
        await pausedShots('laser-active');
      }
      if (kind === 'cooling' && seen.some((x) => x.laser === 'active')) break;
      await sleep(60);
    }
    h.check('laser and orbital slots both show', seen.length > 0 && seen.every((x) => x.ids.includes('laser') && x.ids.includes('orbital') && !x.ids.includes('dash')), { seen });
    const activeAt = seen.findIndex((x) => x.laser === 'active');
    h.check('laser slot goes active then cooling', activeAt >= 0 && seen.slice(activeAt).some((x) => x.laser === 'cooling'), { seen });
    await sleep(600);
    await pausedShots('laser-orbital-cooling');

    const none = await h.startAt(1, {});
    h.check('no skill slots without skill perks', Array.isArray(none.skills) && none.skills.length === 0, { skills: none.skills });
    await h.shot('no-skills-closeup', TRAY);
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

  async viewport(h) {
    const outDir = join(ROOT, '.verify', runId, 'evidence', 'viewport');
    const measure = (page) =>
      page.evaluate(() => {
        const c = document.querySelector('#game canvas').getBoundingClientRect();
        const s = document.scrollingElement;
        return { box: { x: c.x, y: c.y, width: c.width, height: c.height }, scroll: { width: s.scrollWidth, height: s.scrollHeight }, dpr: devicePixelRatio, ...window.__game.state().view };
      });
    const fits = async (where, page) => {
      const vp = page.viewportSize();
      const m = await measure(page);
      h.check(`${where}: canvas box equals the viewport`, m.box.x === 0 && m.box.y === 0 && m.box.width === vp.width && m.box.height === vp.height, { box: m.box, vp });
      h.check(`${where}: no page scrollbars`, m.scroll.width <= vp.width && m.scroll.height <= vp.height, { scroll: m.scroll, vp });
      h.check(`${where}: backing store is viewport x devicePixelRatio`, m.canvas.width === Math.round(vp.width * m.dpr) && m.canvas.height === Math.round(vp.height * m.dpr), { canvas: m.canvas, dpr: m.dpr });
      const zoom = Math.min(m.canvas.width / 480, m.canvas.height / 640);
      const w = m.world;
      const near = (a, b) => Math.abs(a - b) < 0.5;
      h.check(
        `${where}: camera shows the whole 480x640 playfield, centered, filling one axis`,
        Math.abs(m.zoom - zoom) < 1e-6 && w.x <= 0.5 && w.y <= 0.5 && w.x + w.width >= 479.5 && w.y + w.height >= 639.5 && near(w.x + w.width / 2, 240) && near(w.y + w.height / 2, 320) && (near(w.width, 480) || near(w.height, 640)),
        { zoom: m.zoom, expected: zoom, world: w },
      );
    };

    for (const vp of [{ width: 1920, height: 1080 }, { width: 1366, height: 768, dpr: 2 }, { width: 800, height: 1280 }]) {
      const name = `${vp.width}x${vp.height}${vp.dpr ? `@${vp.dpr}x` : ''}`;
      const context = await h.page.context().browser().newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr ?? 1 });
      const v = harness(await context.newPage(), outDir);
      try {
        await v.openTitle();
        await sleep(300);
        await fits(`${name} title`, v.page);
        await v.shot(`${name}-title`);
        await v.step('press Enter on title', () => v.page.keyboard.press('Enter'));
        await v.waitFor('stage 1 fighting', (x) => x.scenes.includes('Stage') && x.life === 'fighting');
        await sleep(1500);
        await v.game('pause');
        await fits(`${name} stage 1`, v.page);
        await v.shot(`${name}-stage1`);
      } finally {
        h.log.steps.push(...v.log.steps);
        h.log.consoleErrors.push(...v.log.consoleErrors);
        await context.close();
      }
    }

    await h.page.setViewportSize({ width: 1280, height: 720 });
    await h.openTitle();
    await sleep(300);
    await fits('1280x720 title', h.page);
    await h.shot('live-1280x720-title');
    await h.step('resize window to 1600x900', () => h.page.setViewportSize({ width: 1600, height: 900 }));
    await h.waitFor('canvas re-fit to 1600x900', (x) => x.view.canvas.width === 1600 && x.view.canvas.height === 900);
    await sleep(300);
    await fits('live-resized 1600x900 title', h.page);
    await h.shot('live-1600x900-title');
    const fullscreenId = () => h.page.evaluate(() => document.fullscreenElement?.id ?? null);
    await h.page.keyboard.press('f');
    await h.page.waitForTimeout(400);
    h.check('F enters browser fullscreen on #game', (await fullscreenId()) === 'game', { fullscreenElement: await fullscreenId() });
    await h.page.keyboard.press('f');
    await h.page.waitForTimeout(400);
    h.check('F again leaves fullscreen', (await fullscreenId()) === null, { fullscreenElement: await fullscreenId() });
    await h.page.keyboard.press('Enter');
    await h.waitFor('stage 1 fighting', (x) => x.scenes.includes('Stage') && x.life === 'fighting');
    await sleep(1500);
    await fits('live-resized 1600x900 stage 1', h.page);
    await h.shot('live-1600x900-stage1');
  },
};

// Close-ups of small HUD art need the canvas's full backing resolution.
const CONTEXT = { 'skill-hud': { deviceScaleFactor: 2 } };

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
  const context = await browser.newContext({ viewport: { width: 600, height: 800 }, ...CONTEXT[name] });
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
