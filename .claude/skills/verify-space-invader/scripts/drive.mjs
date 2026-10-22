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
    const items = await import('/src/core/items.ts');
    return new Function('run', 'perks', 'items', `return (${expr})`)(run, perks, items);
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
  async function startAt(stage, perks = {}, money = 0, items = {}) {
    if (!(await state())) await openTitle();
    await game('start', stage, perks, money, items);
    return waitFor(`stage ${stage} fighting`, (s) => s.scenes.includes('Stage') && s.run?.stage === stage && s.life === 'fighting');
  }

  async function openTitle() {
    await page.goto(URL);
    return waitFor('Title scene', (s) => s.scenes.includes('Title'), 15000);
  }

  // Holds whichever arrow key moves the ship under the boss; steer(null) releases it.
  let steering = null;
  async function steer(s) {
    const dx = s ? (s.boss?.x ?? s.player.x) - s.player.x : 0;
    const want = Math.abs(dx) < 10 ? null : dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (want === steering) return;
    if (steering) await page.keyboard.up(steering);
    if (want) await page.keyboard.down(want);
    steering = want;
  }

  // Keeps the ship under the boss until pred holds.
  async function track(pred, timeoutMs) {
    const end = Date.now() + timeoutMs;
    let s = await state();
    while (!pred(s) && Date.now() < end) {
      await steer(s);
      await sleep(30);
      s = await state();
    }
    await steer(null);
    if (!pred(s)) throw new Error(`timed out tracking the boss; last boss ${JSON.stringify(s.boss)}`);
    return s;
  }

  return { log, state, game, core, waitFor, check, step, shot, hold, startAt, openTitle, steer, track, page };
}

function summarize(s) {
  if (!s) return null;
  const { run, ...restState } = s;
  return {
    ...restState,
    run: run && { stage: run.stage, money: run.money, hp: run.hp, phase: run.phase.kind, perks: run.perks, items: run.items, transAmGauge: run.transAmGauge, shop: run.phase.shop },
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

  async movement(h) {
    const shipBox = (s) => ({ x: s.player.x - 40, y: s.player.y - 40, w: 80, h: 90 });
    const s0 = await h.startAt(1);
    const { zone, playerY } = await h.page.evaluate(() => import('/src/game/layout.ts').then((m) => ({ zone: m.PLAYER_ZONE, playerY: m.PLAYER_Y })));
    h.check('the ship spawns on the bottom row', s0.player.y === playerY, { y: s0.player.y, playerY });

    const top = await h.step('hold ArrowUp 1200ms, then 300ms more', async () => {
      await h.page.keyboard.down('ArrowUp');
      await sleep(300);
      const mid = await h.state();
      h.check('ArrowUp moves the ship up', mid.player.y < s0.player.y && mid.player.y > zone.top, { from: s0.player.y, mid: mid.player.y });
      // Pausing the scene releases held keys, so this one shot is taken live.
      await h.shot('moving-up-closeup', shipBox(mid));
      await sleep(900);
      const reached = await h.state();
      await sleep(300);
      const held = await h.state();
      await h.page.keyboard.up('ArrowUp');
      h.check('the ship stops at the top of its zone', reached.player.y === zone.top && held.player.y === zone.top, { reached: reached.player.y, held: held.player.y, top: zone.top });
    });
    await h.game('pause');
    await h.shot('raised');
    await h.game('resume');
    h.check('moving up keeps x', top.player.x === s0.player.x, { x: [s0.player.x, top.player.x] });

    const down = await h.step('hold s 1200ms', () => h.hold('s', 1200));
    h.check('S brings the ship back down and it stops on the bottom row', down.player.y === playerY, { y: down.player.y, playerY });

    const d0 = await h.state();
    let ms = 0;
    const diag = await h.step('hold ArrowUp+ArrowRight 300ms', async () => {
      await h.page.keyboard.down('ArrowUp');
      await h.page.keyboard.down('ArrowRight');
      const t0 = performance.now();
      await sleep(300);
      await h.page.keyboard.up('ArrowUp');
      await h.page.keyboard.up('ArrowRight');
      ms = performance.now() - t0;
    });
    const dx = diag.player.x - d0.player.x;
    const dy = d0.player.y - diag.player.y;
    const ratio = Math.hypot(dx, dy) / ((d0.stats.moveSpeed * ms) / 1000);
    h.check('a diagonal moves both axes equally', dx > 20 && dy > 20 && Math.abs(dx - dy) < 8, { dx, dy });
    h.check('diagonal speed is moveSpeed, not moveSpeed x 1.41', ratio > 0.85 && ratio < 1.15, { distance: Math.hypot(dx, dy), ms, moveSpeed: d0.stats.moveSpeed, ratio });

    const a0 = await h.startAt(1, { afterburnerDash: 1 });
    const raised = await h.step('hold w to the zone top', () => h.hold('w', 1200));
    h.check('W moves the ship to the zone top', raised.player.y === zone.top && a0.player.y === playerY, { from: a0.player.y, to: raised.player.y });
    await h.page.keyboard.press('Shift');
    const mid = await h.waitFor('dash lifting off from the raised y', (x) => x.dashing && x.player.y < zone.top - 40, 1000);
    await h.game('pause');
    await h.shot('dash-from-raised');
    await h.game('resume');
    const back = await h.waitFor('dash finished', (x) => !x.dashing, 4000);
    // On the landing frame the exhaust is still drawn where the hull was a frame earlier.
    await sleep(100);
    await h.game('pause');
    await h.shot('dash-returned');
    await h.shot('dash-returned-closeup', shipBox(back));
    await h.game('resume');
    h.check('the dash returns to the raised y it launched from, not the bottom row', Math.abs(back.player.y - zone.top) < 1, { launchedAt: raised.player.y, mid: mid.player.y, landed: back.player.y, playerY });
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

    const offer = s1.cards[0];
    const owned = (s) => (offer.kind === 'perk' ? s.run.perks : s.run.items)[offer.id] ?? 0;
    const cost = await h.core(`run.offerCost(${JSON.stringify(s1.run)}, ${JSON.stringify(offer)})`);
    const s2 = await h.step('press 1', () => h.page.keyboard.press('1'));
    h.check('1 buys card 1 at offerCost', s2.run.money === s1.run.money - cost && owned(s2) === 1, { offer, cost, money: s2.run.money });
    h.check('bought card is sold out', s2.cards[0] === null, { cards: s2.cards });
    await sleep(700);
    await h.shot('after-buy');

    const s3 = await h.step('press 1 again', () => h.page.keyboard.press('1'));
    h.check('sold-out card does not charge again', s3.run.money === s2.run.money, { money: s3.run.money });

    await h.step('press Enter', () => h.page.keyboard.press('Enter'));
    const next = await h.waitFor('stage 2 fighting', (x) => x.scenes.includes('Stage') && x.run?.stage === 2);
    h.check('Enter continues to stage 2 keeping money and what was bought', next.run.money === s3.run.money && owned(next) === 1, summarize(next).run);
  },

  async 'shop-tooltip'(h) {
    const perks = { heavyCaliber: 2, prismLance: 3, afterburnerDash: 1 };
    const items = { nitro: 2 };
    await h.startAt(1, perks, 0, items);
    await h.game('kill');
    const s0 = await h.waitFor('Shop scene with owned chips', (x) => x.scenes.includes('Shop') && x.chips?.length > 0);
    const ids = s0.chips.map((c) => c.id);
    h.check('the owned panel has one chip per owned perk and held item', ids.length === 4 && [...Object.keys(perks), ...Object.keys(items)].every((id) => ids.includes(id)), { chips: s0.chips });
    h.check('no tooltip before hovering', !s0.tooltip.visible, { tooltip: s0.tooltip });

    const toPage = async (wx, wy) => {
      const box = await h.page.locator('canvas').boundingBox();
      const { world } = (await h.state()).view;
      return { x: box.x + ((wx - world.x) * box.width) / world.width, y: box.y + ((wy - world.y) * box.height) / world.height };
    };
    const hover = async (chip) => {
      const p = await toPage(chip.x + chip.w / 2, chip.y + chip.h / 2);
      await h.step(`hover ${chip.kind} chip ${chip.id}`, () => h.page.mouse.move(p.x, p.y));
      return h.waitFor(`tooltip for ${chip.id}`, (x) => x.tooltip.visible && x.tooltip.id === chip.id);
    };
    const off = await toPage(240, 30);
    const leave = async () => {
      await h.step('move the pointer off the chips', () => h.page.mouse.move(off.x, off.y));
      const hidden = await h.waitFor('tooltip hidden', (x) => !x.tooltip.visible);
      await sleep(150);
      return hidden;
    };
    const around = (chip, t) => {
      const x = Math.max(0, Math.min(chip.x, t.x) - 8);
      const y = Math.max(0, t.y - 8);
      return { x, y, w: Math.min(480, Math.max(chip.x + chip.w, t.x + t.w) + 8) - x, h: Math.min(640, chip.y + chip.h + 8) - y };
    };
    const maxLevel = await h.core('Object.fromEntries(perks.PERK_IDS.map((id) => [id, perks.PERKS[id].maxLevel]))');

    for (const chip of s0.chips) {
      const { tooltip: t } = await hover(chip);
      const expectNext = chip.kind === 'perk' && perks[chip.id] < maxLevel[chip.id];
      h.check(`hovering ${chip.id} shows its ${chip.kind} tooltip`, t.kind === chip.kind && t.id === chip.id, { chip, tooltip: t });
      h.check(`${chip.id} tooltip ${expectNext ? 'previews' : 'has no'} next level`, t.hasNext === expectNext, { level: perks[chip.id], max: maxLevel[chip.id], hasNext: t.hasNext });
      h.check(`${chip.id} tooltip stays inside the 480x640 world, at most 260 wide`, t.x >= 0 && t.y >= 0 && t.x + t.w <= 480 && t.y + t.h <= 640 && t.w <= 260, { tooltip: t });
      h.check(`${chip.id} tooltip sits above its chip`, t.y + t.h <= chip.y && !t.below, { chip, tooltip: t });
      if (chip === s0.chips[0]) {
        h.check('the first chip needs the sideways clamp, and gets it', chip.x + chip.w / 2 - t.w / 2 < 0 && t.x >= 0, { chipCenter: chip.x + chip.w / 2, tooltip: t });
        await sleep(200);
        await h.shot('tooltip-in-shop');
        await h.shot(`tooltip-edge-${chip.id}`, around(chip, t));
      }
      if (chip.id === 'prismLance' || chip.kind === 'item') {
        await sleep(200);
        await h.shot(`tooltip-${chip.kind}-${chip.id}`, around(chip, t));
      }
      await leave();
    }

    const [a, b] = s0.chips;
    const before = await h.state();
    const first = await hover(a);
    h.check('hovering from nothing fades the tooltip in once', first.tooltip.fadeIns === before.tooltip.fadeIns + 1, { fadeIns: [before.tooltip.fadeIns, first.tooltip.fadeIns] });
    const pa = await toPage(a.x + a.w / 2, a.y + a.h / 2);
    const pb = await toPage(b.x + b.w / 2, b.y + b.h / 2);
    const samples = [];
    await h.step(`slide from ${a.id} to ${b.id}`, async () => {
      for (let i = 1; i <= 10; i++) {
        await h.page.mouse.move(pa.x + ((pb.x - pa.x) * i) / 10, pa.y);
        samples.push((await h.state()).tooltip);
      }
    });
    const slid = await h.waitFor(`tooltip for ${b.id}`, (x) => x.tooltip.id === b.id);
    h.check('sliding between adjacent chips never hides or re-fades the tooltip', samples.every((t) => t.visible) && slid.tooltip.fadeIns === first.tooltip.fadeIns, {
      samples: samples.map((t) => `${t.visible ? t.id : 'hidden'}`),
      fadeIns: [first.tooltip.fadeIns, slid.tooltip.fadeIns],
    });
    const gone = await leave();
    h.check('leaving the chips hides the tooltip', !gone.tooltip.visible, { tooltip: gone.tooltip });
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
    const perkSlots = (s) => s.skills.filter((k) => k.id !== 'transAm');
    const pausedShots = async (name) => {
      await h.game('pause');
      await h.shot(name);
      await h.shot(`${name}-closeup`, TRAY);
      await h.game('resume');
    };

    const d0 = await h.startAt(3, { afterburnerDash: 1 });
    h.check('only the dash slot shows beside TRANS-AM with Afterburner Dash', perkSlots(d0).length === 1 && slot(d0, 'dash')?.kind === 'ready' && d0.skills[0].id === 'transAm', { skills: d0.skills });
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
    h.check('only the TRANS-AM slot without skill perks', Array.isArray(none.skills) && none.skills.map((k) => k.id).join() === 'transAm', { skills: none.skills });
    await h.shot('no-skills-closeup', TRAY);
  },

  async items(h) {
    await h.startAt(1, {}, 2000);
    await h.game('kill');
    let s = await h.waitFor('Shop scene', (x) => x.scenes.includes('Shop'));
    const itemSlot = (x) => x.cards.findIndex((c) => c?.kind === 'item');
    let refreshes = 0;
    while (itemSlot(s) < 0 && refreshes < 40) {
      const cost = await h.core(`run.refreshCost(${JSON.stringify(s.run)})`);
      if (s.run.money - cost < 25) break;
      s = await h.step('press R looking for an item card', () => h.page.keyboard.press('r'));
      refreshes++;
    }
    const slot = itemSlot(s);
    h.check('an item card shows up in the shop offers', slot >= 0, { refreshes, cards: s.cards });
    await sleep(300);
    await h.shot('shop-item-card');
    const offer = s.cards[slot];
    const cost = await h.core(`run.offerCost(${JSON.stringify(s.run)}, ${JSON.stringify(offer)})`);
    const bought = await h.step(`press ${slot + 1} to buy ${offer.id}`, () => h.page.keyboard.press(String(slot + 1)));
    h.check('buying the item card adds one to the stack and charges its cost', (bought.run.items[offer.id] ?? 0) === (s.run.items[offer.id] ?? 0) + 1 && bought.run.money === s.run.money - cost, {
      offer,
      cost,
      before: s.run.items,
      after: bought.run.items,
      money: [s.run.money, bought.run.money],
    });
    h.check('the bought item card is sold out', bought.cards[slot] === null, { cards: bought.cards });
    await sleep(700);
    await h.shot('shop-item-bought');

    const TRAY = { x: 200, y: 566, w: 280, h: 74 };
    const pausedShots = async (name) => {
      await h.game('pause');
      await h.shot(name);
      await h.shot(`${name}-closeup`, TRAY);
      await h.game('resume');
    };
    const buff = (x, id) => x.buffs.find((b) => b.buff === id);
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    const perks = { reinforcedHull: 3 };
    const base = await h.core(`perks.deriveStats(${JSON.stringify(perks)})`);
    const f0 = await h.startAt(4, perks, 0, { repairKit: 2, nitro: 2, powerCell: 1, overclock: 1, barrierCapsule: 1 });
    h.check('stage starts at full HP with base stats', f0.run.hp === base.maxHp && f0.buffs.length === 0 && near(f0.stats.moveSpeed, base.moveSpeed), { hp: f0.run.hp, stats: f0.stats });

    const r1 = await h.step('press z at full HP', async () => {
      await h.page.keyboard.press('z');
      await sleep(60);
    });
    await pausedShots('repair-refused');
    h.check('repair kit is refused at full HP and not spent', r1.run.items.repairKit === 2 && r1.run.hp === base.maxHp, { items: r1.run.items, hp: r1.run.hp });
    await h.game('hurt');
    const hurt = await h.state();
    const r2 = await h.step('press z after a hit', async () => {
      await h.page.keyboard.press('z');
      await sleep(150);
    });
    h.check('repair kit heals 1 HP and is spent', r2.run.hp === hurt.run.hp + 1 && r2.run.items.repairKit === 1, { before: hurt.run.hp, after: r2.run.hp, items: r2.run.items });

    const x0 = (await h.state()).player.x;
    const plain = await h.step('hold ArrowLeft 400ms without Nitro', () => h.hold('ArrowLeft', 400));
    const plainDx = x0 - plain.player.x;
    await h.step('hold ArrowRight 400ms back to the middle', () => h.hold('ArrowRight', 400));
    const n1 = await h.step('press x', async () => {
      await h.page.keyboard.press('x');
      await sleep(150);
    });
    h.check('Nitro starts a buff and spends one', buff(n1, 'nitro')?.msLeft > 0 && n1.run.items.nitro === 1, { buffs: n1.buffs, items: n1.run.items });
    h.check('Nitro makes effective moveSpeed 1.5x', near(n1.stats.moveSpeed, base.moveSpeed * 1.5), { moveSpeed: n1.stats.moveSpeed, base: base.moveSpeed });
    const boosted = await h.step('hold ArrowLeft 400ms with Nitro', () => h.hold('ArrowLeft', 400));
    const boostedDx = n1.player.x - boosted.player.x;
    h.check('ArrowLeft for 400ms moves the ship farther with Nitro, away from the wall', boostedDx > plainDx * 1.3 && plain.player.x > 40 && boosted.player.x > 40, {
      plainDx,
      boostedDx,
      ratio: boostedDx / plainDx,
      ends: [plain.player.x, boosted.player.x],
    });

    const p1 = await h.step('press c then v', async () => {
      await h.page.keyboard.press('c');
      await h.page.keyboard.press('v');
      await sleep(150);
    });
    h.check('Power Cell and Overclock pressed back to back in one frame are both active alongside Nitro', p1.buffs.length === 3 && buff(p1, 'powerCell') && buff(p1, 'overclock'), { buffs: p1.buffs });
    h.check('effective bulletDamage is 1.5x and fireIntervalMs 0.6x', near(p1.stats.bulletDamage, base.bulletDamage * 1.5) && near(p1.stats.fireIntervalMs, base.fireIntervalMs * 0.6), { stats: p1.stats, base: { bulletDamage: base.bulletDamage, fireIntervalMs: base.fireIntervalMs } });
    await sleep(1500);
    await pausedShots('three-buffs');

    const before = buff(await h.state(), 'nitro').msLeft;
    const n2 = await h.step('press x again while Nitro runs', async () => {
      await h.page.keyboard.press('x');
      await sleep(100);
    });
    h.check('a second Nitro adds its time to the running buff', n2.buffs.filter((b) => b.buff === 'nitro').length === 1 && buff(n2, 'nitro').msLeft > before + 7000 && n2.run.items.nitro === 0, { before, after: buff(n2, 'nitro'), items: n2.run.items });
    h.check('stacking time does not stack the multiplier', near(n2.stats.moveSpeed, base.moveSpeed * 1.5), { moveSpeed: n2.stats.moveSpeed });
    await pausedShots('nitro-extended');

    const done = await h.waitFor('every buff to expire', (x) => x.buffs.length === 0 || x.life !== 'fighting', 20000);
    h.check('the stage is still being fought when the buffs run out', done.life === 'fighting', { life: done.life, hp: done.run.hp });
    h.check('stats return to base when the buffs expire', near(done.stats.moveSpeed, base.moveSpeed) && near(done.stats.bulletDamage, base.bulletDamage) && near(done.stats.fireIntervalMs, base.fireIntervalMs), { stats: done.stats });
    await pausedShots('buffs-expired');

    const s1 = await h.startAt(1, {}, 0, { barrierCapsule: 1 });
    const none = await h.step('press z holding no Repair Kit', async () => {
      await h.page.keyboard.press('z');
      await sleep(100);
    });
    h.check('an item never held is refused without changing the run', JSON.stringify(none.run.items) === JSON.stringify(s1.run.items) && none.run.hp === s1.run.hp, { items: none.run.items });
    await h.step('press b', () => h.page.keyboard.press('b'));
    const sh = await h.waitFor('shield up', (x) => x.shieldMs > 0, 1000);
    h.check('Barrier Capsule raises a 10s shield and is spent', sh.shieldMs > 9000 && sh.run.items.barrierCapsule === 0, { shieldMs: sh.shieldMs, items: sh.run.items });
    await h.game('pause');
    await h.shot('shield-up');
    await h.shot('shield-up-closeup', TRAY);
    const blocked = await h.step('hit() through the normal damage path while shielded', () => h.game('hit'));
    await h.game('resume');
    h.check('the shield blocks the hit and is consumed', blocked.run.hp === sh.run.hp && blocked.shieldMs === 0, { hp: [sh.run.hp, blocked.run.hp], shieldMs: blocked.shieldMs });
    await sleep(700);
    const landed = await h.step('hit() again once the block i-frames pass', () => h.game('hit'));
    h.check('without the shield the same hit costs 1 HP', landed.run.hp === sh.run.hp - 1, { hp: [sh.run.hp, landed.run.hp] });

    const k0 = await h.startAt(1, {}, 0, { nitro: 3, powerCell: 3, overclock: 3 });
    await h.page.evaluate(() => {
      window.__keysSeen = [];
      window.addEventListener('keydown', (e) => window.__keysSeen.push({ key: e.key, code: e.code, shift: e.shiftKey }));
    });
    const shifted = await h.step('hold Shift and press KeyX', async () => {
      await h.page.keyboard.down('Shift');
      await h.page.keyboard.press('KeyX');
      await h.page.keyboard.up('Shift');
      await sleep(150);
    });
    const seen = await h.page.evaluate(() => window.__keysSeen);
    h.check('Shift+X reports key "X" and uses Nitro exactly once', seen.some((e) => e.code === 'KeyX' && e.key === 'X' && e.shift) && shifted.run.items.nitro === k0.run.items.nitro - 1 && shifted.run.items.powerCell === k0.run.items.powerCell, { seen, before: k0.run.items, after: shifted.run.items });
    const digit = await h.step('press Digit3, the number-row fallback for Power Cell', async () => {
      await h.page.keyboard.press('Digit3');
      await sleep(150);
    });
    h.check('Digit3 uses Power Cell exactly once', digit.run.items.powerCell === shifted.run.items.powerCell - 1 && digit.run.items.nitro === shifted.run.items.nitro, { before: shifted.run.items, after: digit.run.items });
    const thai = await h.step('dispatch a Thai-layout keydown (key แ on code KeyC)', async () => {
      await h.page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'แ', code: 'KeyC' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'แ', code: 'KeyC' }));
      });
      await sleep(150);
    });
    h.check('a Thai-layout C key uses Power Cell exactly once', thai.run.items.powerCell === digit.run.items.powerCell - 1 && thai.run.items.nitro === digit.run.items.nitro, { before: digit.run.items, after: thai.run.items });
    const pair = await h.step('press c then v back to back', async () => {
      await h.page.keyboard.press('c');
      await h.page.keyboard.press('v');
      await sleep(150);
    });
    h.check('two items pressed in one frame are each used exactly once', pair.run.items.powerCell === thai.run.items.powerCell - 1 && pair.run.items.overclock === thai.run.items.overclock - 1, { before: thai.run.items, after: pair.run.items });
    await h.game('pause');
    await h.shot('fallback-keys-closeup', TRAY);
    await h.game('resume');
  },

  async 'trans-am'(h) {
    const TRAY = { x: 0, y: 570, w: 140, h: 70 };
    const slot = (s) => s.skills.find((k) => k.id === 'transAm');
    const close = (a, b) => Math.abs(a - b) < 1e-6;
    const shipBox = (s) => ({ x: s.player.x - 60, y: s.player.y - 70, w: 120, h: 110 });
    const pausedShots = async (name, s) => {
      await h.game('pause');
      await h.shot(name);
      await h.shot(`${name}-tray`, TRAY);
      if (s) await h.shot(`${name}-ship`, shipBox(s));
      await h.game('resume');
    };
    // State and bullets read in one task describe the same frame.
    const snap = () => h.page.evaluate(() => ({ s: window.__game.state(), shots: window.__game.shots() }));
    const nearShip = ({ s, shots }, r) => shots.filter((b) => Math.hypot(b.x - s.player.x, b.y - s.player.y) <= r).length;
    const s0 = await h.startAt(4);
    const TA = await h.page.evaluate(() => import('/src/core/transAm.ts').then((m) => m.TRANS_AM));
    const base = await h.core('perks.deriveStats({})');
    h.check('a fresh run starts the gauge charging near 0 with the SPACE slot charging', s0.transAm.kind === 'charging' && s0.transAm.gauge < 10 && slot(s0)?.kind === 'charging', { transAm: s0.transAm, slot: slot(s0) });
    const refused = await h.step('press Space with the gauge not full', async () => {
      await h.page.keyboard.press('Space');
      await sleep(60);
    });
    h.check('Space with a non-full gauge is refused', refused.transAm.kind === 'charging' && refused.transAm.gauge < TA.gaugeMax, { transAm: refused.transAm });
    await pausedShots('refused');

    const hit = await h.page.evaluate(() => {
      const g = window.__game;
      g.pause();
      g.transAmGauge(50);
      const pick = (s) => ({ gauge: s.transAm.gauge, hits: s.tally.hits, hp: s.run.hp });
      const before = pick(g.state());
      g.hit();
      const after = pick(g.state());
      g.hit();
      const again = pick(g.state());
      g.resume();
      return { before, after, again };
    });
    h.log.steps.push({ action: 'paused: set gauge 50, hit(), hit() again inside the i-frames', ...hit });
    h.check('a landed hit costs hitLoss gauge', hit.after.hits === hit.before.hits + 1 && hit.after.hp === hit.before.hp - 1 && hit.after.gauge === hit.before.gauge - TA.hitLoss, hit);
    h.check('a hit the i-frames absorb costs nothing', hit.again.hits === hit.after.hits && hit.again.gauge === hit.after.gauge, hit);

    await h.startAt(5);
    await h.game('god', true);
    await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000);
    await h.game('transAmGauge', 15);
    const samples = [];
    let key = 'ArrowRight';
    await h.page.keyboard.down(key);
    const end = Date.now() + 20000;
    while (Date.now() < end && (samples.length < 100 || samples.at(-1).grazes - samples[0].grazes < 4)) {
      const { s } = await snap();
      samples.push({ fightMs: s.clock.fightMs, gauge: s.transAm.gauge, grazes: s.tally.grazes, hits: s.tally.hits, kills: s.tally.kills, bossDealt: s.tally.bossDealt, maxHp: s.boss.maxHp });
      const turn = key === 'ArrowRight' ? s.player.x > Math.min(s.boss.x + 110, 430) : s.player.x < Math.max(s.boss.x - 110, 50);
      if (turn) {
        await h.page.keyboard.up(key);
        key = key === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
        await h.page.keyboard.down(key);
      }
      await sleep(30);
    }
    await h.page.keyboard.up(key);
    h.log.steps.push({ action: 'weave under the boss until 4 grazes, for up to 20s', samples });
    const first = samples[0];
    const last = samples.at(-1);
    // Each step: grazes, kills and boss damage add, a landed hit subtracts. Steps that touch the cap or 0 are clamped,
    // so they are skipped.
    const steps = samples.slice(1).map((b, i) => {
      const a = samples[i];
      const expect =
        (b.grazes - a.grazes) * TA.gain.graze +
        (b.kills - a.kills) * TA.gain.kill +
        ((b.bossDealt - a.bossDealt) * 100 * TA.gain.bossHpPercent) / b.maxHp -
        (b.hits - a.hits) * TA.hitLoss;
      return { a, b, expect, got: b.gauge - a.gauge, clamped: b.gauge <= 0 || b.gauge >= TA.gaugeMax || a.gauge <= 0 };
    });
    const unclamped = steps.filter((x) => !x.clamped);
    const mismatched = unclamped.filter((x) => Math.abs(x.got - x.expect) > 1e-6);
    const grazeSteps = unclamped.filter((x) => x.b.grazes > x.a.grazes);
    h.check('weaving under the boss grazes bullets', last.grazes - first.grazes >= 3, { grazes: [first.grazes, last.grazes] });
    h.check('the gauge moves by exactly grazes + kills + boss damage - hits on every unclamped step', mismatched.length === 0 && unclamped.length > 50, { unclamped: unclamped.length, mismatched: mismatched.slice(0, 5) });
    h.check('that sum holds on at least 3 steps where a graze landed', grazeSteps.length >= 3, {
      grazeSteps: grazeSteps.slice(0, 5).map((x) => ({ grazes: [x.a.grazes, x.b.grazes], gauge: [x.a.gauge, x.b.gauge], expect: x.expect })),
    });

    await h.startAt(4);
    await h.game('god', true);
    await h.game('transAmGauge', TA.gaugeMax);
    await sleep(400);
    await pausedShots('ready');
    const ready = await h.state();
    h.check('a full gauge shows the slot ready', slot(ready).kind === 'ready', { slot: slot(ready), transAm: ready.transAm });

    let pre;
    let preLater;
    for (const until = Date.now() + 15000; Date.now() < until; ) {
      pre = await snap();
      await sleep(250);
      preLater = await snap();
      if (nearShip(preLater, TA.clearRadiusPx) >= 2) break;
    }
    await h.game('transAmGauge', TA.gaugeMax);
    const nearBefore = nearShip(preLater, TA.clearRadiusPx);
    const activated = await h.step('press Space with a full gauge', async () => {
      await h.page.keyboard.press('Space');
      await sleep(30);
    });
    h.check('Space with a full gauge activates TRANS-AM', activated.transAm.kind === 'active' && activated.transAm.msLeft > TA.activeMs - 300, { transAm: activated.transAm });
    h.check('active stats: fire interval x0.5, move speed x1.25, pierce +1, same damage', close(activated.stats.fireIntervalMs, base.fireIntervalMs * TA.active.fireIntervalScale) && close(activated.stats.moveSpeed, base.moveSpeed * TA.active.moveSpeedScale) && activated.stats.pierce === base.pierce + TA.active.pierce && close(activated.stats.bulletDamage, base.bulletDamage), { stats: activated.stats, base: { fireIntervalMs: base.fireIntervalMs, moveSpeed: base.moveSpeed, pierce: base.pierce, bulletDamage: base.bulletDamage } });
    const activatedAt = activated.clock.fightMs;
    await h.waitFor('release over', (x) => x.transAm.kind === 'active' && x.transAm.msLeft < TA.activeMs - TA.releaseMs, 2000);
    const cleared = await snap();
    h.check('the release cleared the bullets near the ship', nearBefore >= 2 && nearShip(cleared, TA.clearRadiusPx - 20) === 0, { nearBefore, nearAfter: nearShip(cleared, TA.clearRadiusPx - 20), radius: TA.clearRadiusPx });

    // A bullet's speed is its travel over game time. The same bullets are timed before and during TRANS-AM when any
    // survive both windows; otherwise each is held to the shot speed of the stage's enemy that fires its kind.
    const speeds = (a, b) => a.shots.flatMap((s) => {
      const t = b.shots.find((x) => x.id === s.id);
      return t ? [{ id: s.id, kind: s.kind, v: Math.hypot(t.x - s.x, t.y - s.y) / (b.s.clock.fightMs - a.s.clock.fightMs) }] : [];
    });
    const before = speeds(pre, preLater);
    let during = [];
    for (let from = cleared; during.length === 0 && from.s.transAm.kind === 'active' && from.s.transAm.msLeft > 1500; ) {
      await sleep(300);
      const to = await snap();
      during = speeds(from, to);
      from = to;
    }
    const table = await h.page.evaluate(async () => {
      const [{ ENEMY_SHOT }, { stageDef }] = await Promise.all([import('/src/game/formation.ts'), import('/src/core/stages.ts')]);
      return Object.fromEntries(stageDef(4).rows.map((kind) => [ENEMY_SHOT[kind].bullet, ENEMY_SHOT[kind].speed / 1000]));
    });
    const pairs = during.map((d) => {
      const same = before.find((x) => x.id === d.id);
      const normal = same ? same.v : table[d.kind];
      return { id: d.id, kind: d.kind, matchedBy: same ? 'id' : 'table', before: normal, during: d.v, ratio: d.v / normal };
    });
    h.log.steps.push({ action: 'timed enemy bullets before and during TRANS-AM', before, during, pairs });
    h.check('enemy bullets fly at half speed during TRANS-AM', pairs.length > 0 && pairs.every((r) => Math.abs(r.ratio - TA.enemyTimeScale) < 0.08), { pairs: pairs.slice(0, 6) });

    await h.page.keyboard.down('ArrowLeft');
    await sleep(350);
    const moving = await h.state();
    await pausedShots('active', moving);
    await h.page.keyboard.up('ArrowLeft');

    const depleted = await h.waitFor('depleted', (x) => x.transAm.kind === 'depleted', TA.activeMs + 1500);
    h.check('TRANS-AM runs out after activeMs of game time', Math.abs(depleted.clock.fightMs - activatedAt - TA.activeMs) < 250, { activeForMs: depleted.clock.fightMs - activatedAt });
    h.check('depleted stats: fires at 60% rate and moves at x0.8, no pierce', close(depleted.stats.fireIntervalMs, base.fireIntervalMs / TA.depleted.fireRateScale) && close(depleted.stats.moveSpeed, base.moveSpeed * TA.depleted.moveSpeedScale) && depleted.stats.pierce === base.pierce, { stats: depleted.stats });
    h.check('the depleted slot counts down', slot(depleted).kind === 'cooling' && slot(depleted).msLeft > 0, { slot: slot(depleted) });
    await sleep(500);
    await pausedShots('depleted', await h.state());
    const charged = await h.waitFor('charging again', (x) => x.transAm.kind === 'charging', TA.depletedMs + 1500);
    h.check('the depleted time lasts depletedMs and charging restarts near 0', Math.abs(charged.clock.fightMs - depleted.clock.fightMs - TA.depletedMs) < 250 && charged.transAm.gauge < 10, { depletedForMs: charged.clock.fightMs - depleted.clock.fightMs, transAm: charged.transAm });
    h.check('stats return to base', close(charged.stats.fireIntervalMs, base.fireIntervalMs) && close(charged.stats.moveSpeed, base.moveSpeed), { stats: charged.stats });
    await sleep(800);
    await pausedShots('charging');

    const c0 = await h.startAt(1);
    await h.game('transAmGauge', 30);
    await h.game('kill');
    const shop = await h.waitFor('Shop scene', (x) => x.scenes.includes('Shop'));
    const carried = Math.min(TA.gaugeMax, 30 + c0.foes * TA.gain.kill);
    h.check('the gauge plus the kills reaches the shop', shop.run.transAmGauge === carried, { shopGauge: shop.run.transAmGauge, carried, foes: c0.foes });
    await h.step('press Enter in the shop', () => h.page.keyboard.press('Enter'));
    const next = await h.waitFor('stage 2 fighting', (x) => x.scenes.includes('Stage') && x.run.stage === 2 && x.life === 'fighting');
    h.check('the next stage starts charging from the carried gauge', next.transAm.kind === 'charging' && next.transAm.gauge >= carried && next.transAm.gauge <= carried + 2 * TA.gain.kill, { transAm: next.transAm, carried });

    await h.startAt(1);
    await h.game('transAmGauge', TA.gaugeMax);
    await h.step('press Space', () => h.page.keyboard.press('Space'));
    await h.waitFor('active', (x) => x.transAm.kind === 'active', 1000);
    await h.game('kill');
    const shop2 = await h.waitFor('Shop scene', (x) => x.scenes.includes('Shop'));
    h.check('a stage that ends while active carries 0, and its kills add nothing', shop2.run.transAmGauge === 0, { shopGauge: shop2.run.transAmGauge });
    await h.step('press Enter in the shop', () => h.page.keyboard.press('Enter'));
    const next2 = await h.waitFor('stage 2 fighting', (x) => x.scenes.includes('Stage') && x.run.stage === 2 && x.life === 'fighting');
    h.check('the next stage starts charging from 0', next2.transAm.kind === 'charging' && next2.transAm.gauge <= 2 * TA.gain.kill, { transAm: next2.transAm });

    await h.startAt(5);
    await h.game('god', true);
    await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000);
    await sleep(2500);
    await h.game('transAmGauge', TA.gaugeMax);
    await h.step('press Space in a boss fight', () => h.page.keyboard.press('Space'));
    await sleep(1200);
    const boss = await h.state();
    h.check('TRANS-AM activates in a boss fight', boss.transAm.kind === 'active', { transAm: boss.transAm });
    await h.game('pause');
    await h.shot('boss-active');
    await h.game('resume');

    const full = await h.startAt(6, { afterburnerDash: 1, prismLance: 1, orbitalCannon: 1 }, 0, { repairKit: 1, nitro: 1, powerCell: 1, overclock: 1, barrierCapsule: 1 });
    h.check('TRANS-AM leads the tray beside every other skill', full.skills.map((k) => k.id).join() === 'transAm,dash,laser,orbital', { skills: full.skills.map((k) => k.id) });
    await h.game('pause');
    await h.shot('full-tray', { x: 0, y: 566, w: 480, h: 74 });
    await h.game('resume');
  },

  async 'cut-in'(h) {
    const [TA, CUT] = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => {
        const [t, c] = await Promise.all([import('/src/core/transAm.ts'), import('/src/core/cutIn.ts')]);
        return [t.TRANS_AM, { ...c.CUT_IN, total: c.CUT_IN_MS }];
      });
    })();
    const bandAt = CUT.dimMs;
    const slashAt = CUT.dimMs + CUT.bandMs;
    // Polls every animation frame from inside the page, so a 100ms beat cannot slip between two reads. Armed before
    // the key press it waits for.
    const frameWhen = (pred, pause) =>
      h.page.evaluate(
        ([src, pause]) =>
          new Promise((resolve, reject) => {
            const test = new Function('s', `return (${src})`);
            const until = performance.now() + 5000;
            const tick = () => {
              const s = window.__game.state();
              if (test(s)) {
                const shots = window.__game.shots();
                if (pause) window.__game.pause();
                return resolve({ s, shots });
              }
              if (performance.now() > until) return reject(new Error(`timed out waiting for ${src}`));
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [pred, pause],
      );
    const shotAt = async (name, pred) => {
      const frame = await frameWhen(pred, true);
      await h.shot(name);
      h.log.steps.push({ action: `paused at ${pred}`, cutInMs: frame.s.cutInMs, life: frame.s.life, transAm: frame.s.transAm });
      await h.game('resume');
      return frame;
    };
    const nearShip = ({ s, shots }, r) => shots.filter((b) => Math.hypot(b.x - s.player.x, b.y - s.player.y) <= r);
    const frozenAcross = (a, b) => ({
      shots: JSON.stringify(a.shots) === JSON.stringify(b.shots),
      foes: JSON.stringify(a.s.foeSpots) === JSON.stringify(b.s.foeSpots),
      player: a.s.player.x === b.s.player.x && a.s.player.y === b.s.player.y,
      transAm: JSON.stringify(a.s.transAm) === JSON.stringify(b.s.transAm),
      fired: a.s.tally.fired === b.s.tally.fired,
      fightMs: a.s.clock.fightMs === b.s.clock.fightMs,
      buffs: JSON.stringify(a.s.buffs) === JSON.stringify(b.s.buffs),
      boss: JSON.stringify(a.s.boss) === JSON.stringify(b.s.boss),
    });

    await h.startAt(4, {}, 0, { nitro: 1 });
    await h.game('god', true);
    await h.game('transAmGauge', TA.gaugeMax);
    let pre;
    for (const until = Date.now() + 15000; Date.now() < until; await sleep(120)) {
      pre = await h.page.evaluate(() => ({ s: window.__game.state(), shots: window.__game.shots() }));
      if (nearShip(pre, TA.clearRadiusPx).length >= 2) break;
    }
    await h.game('transAmGauge', TA.gaugeMax);
    const dimFrame = frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${CUT.dimMs * 0.5}`, true);
    await h.page.keyboard.press('Space');
    const dim = await dimFrame;
    await h.shot('dim');
    await h.game('resume');
    h.log.steps.push({ action: 'press Space with a full gauge, paused mid dim', before: { transAm: pre.s.transAm, life: pre.s.life, fightMs: pre.s.clock.fightMs }, dim: { cutInMs: dim.s.cutInMs, transAm: dim.s.transAm } });
    h.check('Space on a full gauge starts the cut-in', dim.s.life === 'cutIn' && dim.s.cutInMs < bandAt, { life: dim.s.life, cutInMs: dim.s.cutInMs });
    h.check('the gauge is spent and the active time waits at its full length', dim.s.transAm.kind === 'active' && dim.s.transAm.msLeft === TA.activeMs, { transAm: dim.s.transAm });
    const pressedFightMs = dim.s.clock.fightMs;

    const band = await shotAt('band-crossfade', `s.cutInMs >= ${bandAt + CUT.bandMs * 0.55}`);
    await h.page.keyboard.press('x');
    await h.page.keyboard.press('Space');
    const pressed = await frameWhen('true', false);
    h.log.steps.push({ action: 'press x (Nitro) and Space during the cut-in', cutInMs: pressed.s.cutInMs, items: pressed.s.items, buffs: pressed.s.buffs });
    h.check('an item pressed during the cut-in waits', pressed.s.life === 'cutIn' && pressed.s.items.nitro === 1 && pressed.s.buffs.length === 0, { life: pressed.s.life, items: pressed.s.items, buffs: pressed.s.buffs });
    await shotAt('eyes-red', `s.cutInMs >= ${slashAt - 30}`);
    const slash = await shotAt('slash', `s.cutInMs >= ${slashAt + CUT.slashMs * 0.2}`);
    await shotAt('flash', `s.cutInMs >= ${slashAt + CUT.slashMs * 0.36}`);
    const held = frozenAcross(dim, slash);
    h.log.steps.push({ action: 'compared the dim frame with the slash frame', dimMs: dim.s.cutInMs, slashMs: slash.s.cutInMs, held, shots: dim.shots.length, foes: dim.s.foeSpots.length });
    h.check('nothing in the stage moved through the cut-in', Object.values(held).every(Boolean) && dim.shots.length > 0 && dim.s.foeSpots.length > 0, { held, shots: dim.shots.length, foes: dim.s.foeSpots.length });
    h.check('the active time did not drop during the cut-in', slash.s.transAm.kind === 'active' && slash.s.transAm.msLeft === TA.activeMs, { transAm: slash.s.transAm });
    h.check('the bullets near the ship are still there under the cut-in', nearShip(dim, TA.clearRadiusPx).length >= 1 && nearShip(slash, TA.clearRadiusPx).length === nearShip(dim, TA.clearRadiusPx).length, { atDim: nearShip(dim, TA.clearRadiusPx).length, atSlash: nearShip(slash, TA.clearRadiusPx).length });
    h.check('Space during the cut-in does not restart it', slash.s.cutInMs > band.s.cutInMs && slash.s.cutInMs < CUT.total, { band: band.s.cutInMs, slash: slash.s.cutInMs });

    const after = await frameWhen(`s.life === 'fighting'`, false);
    h.log.steps.push({ action: 'first frame after the cut-in', transAm: after.s.transAm, fightMs: after.s.clock.fightMs, items: after.s.items, buffs: after.s.buffs });
    h.check('the stage resumes with the full active time', after.s.transAm.kind === 'active' && after.s.transAm.msLeft > TA.activeMs - 60, { transAm: after.s.transAm });
    await shotAt('release', `s.transAm.kind === 'active' && s.transAm.msLeft <= ${TA.activeMs - 100}`);
    const resumed = await h.waitFor('the release under way', (x) => x.transAm.kind === 'active' && x.transAm.msLeft < TA.activeMs - 120, 1000);
    h.check('the Nitro pressed during the cut-in fires once after it', resumed.items.nitro === 0 && resumed.buffs.filter((b) => b.buff === 'nitro').length === 1, { items: resumed.items, buffs: resumed.buffs });
    await h.waitFor('release over', (x) => x.transAm.kind === 'active' && x.transAm.msLeft < TA.activeMs - TA.releaseMs, 2000);
    const cleared = await h.page.evaluate(() => ({ s: window.__game.state(), shots: window.__game.shots() }));
    h.check('the release after the cut-in cleared the bullets near the ship', nearShip(cleared, TA.clearRadiusPx - 20).length === 0, { near: nearShip(cleared, TA.clearRadiusPx - 20).length });
    await h.shot('after-release');
    const depleted = await h.waitFor('depleted', (x) => x.transAm.kind === 'depleted', TA.activeMs + 1500);
    h.check('the active time lasts the full activeMs of fighting time', Math.abs(depleted.clock.fightMs - pressedFightMs - TA.activeMs) < 250, { activeForMs: depleted.clock.fightMs - pressedFightMs });

    await h.startAt(5);
    await h.game('god', true);
    await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000);
    await sleep(2500);
    await h.game('transAmGauge', TA.gaugeMax);
    await h.page.keyboard.down('ArrowLeft');
    const early = frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${bandAt}`, false);
    await h.page.keyboard.press('Space');
    const a = await early;
    const b = await frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${slashAt + CUT.slashMs * 0.5}`, false);
    const bossHeld = frozenAcross(a, b);
    h.log.steps.push({ action: 'held ArrowLeft through a cut-in in the stage 5 boss fight', from: a.s.cutInMs, to: b.s.cutInMs, held: bossHeld, boss: a.s.boss, shots: a.shots.length });
    h.check('boss, bullets and ship hold still through the cut-in, with ArrowLeft held', Object.values(bossHeld).every(Boolean) && a.shots.length > 0, { held: bossHeld, shots: a.shots.length, boss: [a.s.boss, b.s.boss] });
    const moved = await h.waitFor('the ship moving left after the cut-in', (x) => x.life === 'fighting' && x.player.x < a.s.player.x - 20, 2000);
    await h.page.keyboard.up('ArrowLeft');
    h.check('the held key moves the ship once the stage resumes', moved.player.x < a.s.player.x, { from: a.s.player.x, to: moved.player.x });
  },

  async bosses(h) {
    const b0 = await h.startAt(5);
    h.check('stage 5 is Crimson Seraph at full HP in her first form', b0.boss?.name === 'Crimson Seraph' && b0.boss.hpRatio === 1 && b0.boss.form === 0 && b0.boss.phase === 0, { boss: b0.boss });
    await sleep(3000);
    const b1 = await h.state();
    h.check('player fire damages the boss', b1.boss.hpRatio < 1, { hpRatio: b1.boss.hpRatio });
    await h.game('bossHp', 0.45);
    const s2 = await h.waitFor('Seraph second form', (x) => x.boss?.form === 1 && x.boss.stance === 'fighting', 10000);
    h.check('the Seraph names her second form', s2.boss.name === 'Crimson Seraph · Ascended', { name: s2.boss.name });
    await sleep(1200);
    await h.shot('seraph-phase2');

    const e0 = await h.startAt(10);
    h.check('stage 10 is Void Empress in her first form', e0.boss?.name === 'Void Empress' && e0.boss.form === 0 && e0.boss.phase === 0, { boss: e0.boss });
    await h.game('bossHp', 0.3);
    const e2 = await h.waitFor('Empress second form', (x) => x.boss?.form === 1 && x.boss.stance === 'fighting', 10000);
    h.check('the Empress names her second form', e2.boss.name === 'Void Empress · Eclipse', { name: e2.boss.name });
    await sleep(1500);
    await h.shot('empress-phase3');
  },

  async 'boss-forms'(h) {
    // Strong enough that auto-fire crosses a 3% HP margin in a few seconds once the ship sits under the boss.
    const LOADOUT = { hairTrigger: 3, heavyCaliber: 3, twinCannons: 2 };
    await h.openTitle();
    for (const [stage, id] of [[5, 'crimsonSeraph'], [10, 'voidEmpress']]) {
      const { def, specials, cast, cap } = await h.page.evaluate(async (id) => {
        const stages = await import('/src/core/stages.ts');
        const patterns = await import('/src/game/patterns.ts');
        const boss = await import('/src/game/boss.ts');
        const def = stages.BOSSES[id];
        const used = [...new Set(def.forms[1].phases.flatMap((p) => p.patterns))];
        const specials = used.filter((p) => patterns.PATTERNS[p].cast);
        const cast = Object.fromEntries(specials.map((p) => [p, patterns.PATTERNS[p].cast.chargeMs]));
        const callouts = Object.fromEntries(specials.map((p) => [p, patterns.PATTERNS[p].cast.callout]));
        return { def: JSON.parse(JSON.stringify(def)), specials, cast: { ms: cast, callouts }, cap: boss.MAX_MINIONS };
      }, id);
      const [one, two] = def.forms;
      await h.startAt(stage, LOADOUT);
      await h.game('god', true);
      await h.waitFor(`${one.name} in place`, (x) => x.boss?.stance === 'fighting', 12000);
      await h.game('bossHp', def.transform.atHpRatio + 0.03);
      const armed = await h.state();
      h.check(`${one.name}: just above the threshold she is still her first form`, armed.boss.form === 0 && armed.boss.name === one.name, { boss: armed.boss });

      const startAt = await h.track((x) => x.boss.stance === 'transforming', 20000);
      h.check(`${one.name}: player fire across ${def.transform.atHpRatio} starts the transformation`, startAt.boss.stance === 'transforming', { boss: startAt.boss });
      const samples = [];
      let shockShot = false;
      let fadeShot = false;
      const t0 = Date.now();
      let x = startAt;
      while (x.boss.stance === 'transforming') {
        samples.push({ ms: Date.now() - t0, hpRatio: x.boss.hpRatio, deflected: x.boss.deflected, form: x.boss.form, name: x.boss.name });
        if (!shockShot) {
          shockShot = true;
          await h.shot(`${id}-transform-shockwave`);
        }
        if (!fadeShot && x.boss.form === 1) {
          fadeShot = true;
          await sleep(120);
          await h.shot(`${id}-transform-crossfade`);
        }
        await h.steer(x);
        await sleep(40);
        x = await h.state();
      }
      await h.steer(null);
      const first = samples[0];
      const climbs = samples.every((s, i) => i === 0 || s.hpRatio >= samples[i - 1].hpRatio - 1e-9);
      h.check(`${one.name}: no damage lands while she transforms (HP only climbs, hits are absorbed)`, climbs && samples.at(-1).deflected > first.deflected, { first, last: samples.at(-1), count: samples.length });
      h.check(`${one.name}: the HUD takes the second form's name mid-transformation`, samples.some((s) => s.name === two.name && s.form === 1), { names: [...new Set(samples.map((s) => s.name))] });
      h.check(`${one.name}: the transformation lasts about durationMs`, Math.abs(Date.now() - t0 - def.transform.durationMs) < 600, { ms: Date.now() - t0, durationMs: def.transform.durationMs });
      const after = x;
      h.check(`${two.name}: she fights on in her second form`, after.boss.stance === 'fighting' && after.boss.form === 1 && after.boss.name === two.name, { boss: after.boss });
      // One poll of player fire can land between fighting resuming and this read.
      h.check(
        `${two.name}: HP ends ${def.transform.healRatio} of full above where she started`,
        after.boss.hpRatio >= first.hpRatio + def.transform.healRatio - 0.03,
        { before: first.hpRatio, after: after.boss.hpRatio, healRatio: def.transform.healRatio },
      );
      h.check(`${two.name}: her minions arrive, never past the cap`, after.boss.minions > 0 && after.boss.minions <= cap, { minions: after.boss.minions, summon: def.transform.summon, cap });
      await sleep(400);
      await h.shot(`${id}-form2`);

      // A full cycle of the slowest phase, twice: each pattern's gap plus each special's charge plus a second for it.
      const cycleMs = two.phases[0].patterns.reduce((ms, p) => ms + two.phases[0].patternGapMs + (cast.ms[p] ?? 0) + 1000, 0);
      const bound = Date.now() + 2 * cycleMs;
      const seen = new Map();
      while (seen.size < specials.length && Date.now() < bound) {
        const c = await h.state();
        if (c.boss.hpRatio < two.phases.at(-1).hpRatio + 0.1) await h.game('bossHp', 0.7);
        const p = c.boss.pattern;
        if (c.boss.stance === 'casting' && !seen.has(p)) {
          h.check(`${two.name}: ${p} charges with its callout "${cast.callouts[p]}"`, c.boss.callout === cast.callouts[p] && c.boss.castMsLeft > 0, { boss: c.boss });
          seen.set(p, c.boss.castMsLeft);
          const shotAt = await h.waitFor(`${p} telegraph grown`, (y) => y.boss.stance !== 'casting' || y.boss.castMsLeft < cast.ms[p] * 0.4, 4000);
          if (shotAt.boss.stance === 'casting') {
            await h.game('pause');
            await h.shot(`${id}-casting-${p}`);
            await h.game('resume');
          }
          const done = await h.waitFor(`${p} released`, (y) => y.boss.stance !== 'casting', 4000);
          h.check(`${two.name}: ${p} releases and she fights on`, done.boss.stance === 'fighting', { boss: done.boss });
          await sleep(500);
          await h.shot(`${id}-release-${p}`);
        }
        await sleep(30);
      }
      h.check(`${two.name}: every special (${specials.join(', ')}) was cast within ${Math.round((2 * cycleMs) / 1000)}s`, specials.every((p) => seen.has(p)), { seen: [...seen.keys()], specials });
    }

    const big = await h.page.context().browser().newContext({ viewport: { width: 1920, height: 1080 } });
    const v = harness(await big.newPage(), join(ROOT, '.verify', runId, 'evidence', 'boss-forms'));
    try {
      await v.startAt(10, LOADOUT);
      await v.game('god', true);
      await v.waitFor('Empress in place', (x) => x.boss?.stance === 'fighting', 12000);
      await v.game('bossHp', 0.45);
      await v.waitFor('Eclipse casting', (x) => x.boss?.form === 1 && x.boss.stance === 'casting' && x.boss.castMsLeft < 600, 20000);
      await v.game('pause');
      await v.shot('1920x1080-eclipse-casting');
      await v.game('resume');
    } finally {
      h.log.steps.push(...v.log.steps);
      h.log.consoleErrors.push(...v.log.consoleErrors);
      await big.close();
    }
  },

  async 'enemy-hp'(h) {
    const around = (e) => ({ x: e.x - 50, y: e.y - 30, w: 100, h: 56 });
    const pausedShots = async (name, e) => {
      await h.game('pause');
      await h.shot(name);
      await h.shot(`${name}-closeup`, around(e));
      await h.game('resume');
    };
    await h.openTitle();
    await h.game('start', 3, {});
    const intro = await h.waitFor('stage 3 intro', (x) => x.scenes.includes('Stage') && x.run?.stage === 3 && x.life === 'intro');
    const f0 = await h.waitFor('stage 3 fighting', (x) => x.life === 'fighting');
    h.check('no foe has a bar before any hit', intro.hpBars.length === 0 && f0.hpBars.length === 0, { intro: intro.hpBars, fighting: f0.hpBars });
    const { tankHp, holdMs } = await h.page.evaluate(async () => {
      const stages = await import('/src/core/stages.ts');
      const bar = await import('/src/game/hpBar.ts');
      return { tankHp: Math.ceil(stages.ENEMIES.tank.hp * stages.stageDef(3).hpMultiplier), holdMs: bar.HP_BAR_MS };
    });

    let chip = null;
    let tank = null;
    let tankAfterMs = null;
    const fightAt = Date.now();
    const end = fightAt + 40000;
    while (Date.now() < end && !(chip && tank)) {
      const s = await h.state();
      if (s.life !== 'fighting') throw new Error(`stage stopped before a tank was hit: life ${s.life}, hp ${s.run.hp}`);
      const shown = s.hpBars.filter((e) => e.bar === 'shown');
      const chipping = shown.find((e) => e.chipRatio - e.hpRatio > 0.1);
      if (!chip && chipping) {
        await h.game('pause');
        const still = (await h.state()).hpBars.find((e) => e.id === chipping.id && e.chipRatio - e.hpRatio > 0.1);
        if (still) {
          chip = still;
          await h.shot('chip');
          await h.shot('chip-closeup', around(still));
        }
        await h.game('resume');
      }
      const hitTank = shown.find((e) => e.maxHp === tankHp && e.hpRatio < 1);
      if (!tank && hitTank) {
        tank = hitTank;
        tankAfterMs = Date.now() - fightAt;
        await pausedShots('tank-hit', hitTank);
      }
      await sleep(30);
    }
    h.check('a hit shows a white chip above the new HP', chip !== null, { chip });
    h.check('auto-fire damages a tank without killing it and its bar shows', tank !== null && tank.hpRatio < 1, { tank, tankHp, tankAfterMs });

    const away = tank.x < 240 ? 'ArrowRight' : 'ArrowLeft';
    await h.page.keyboard.down(away);
    const t0 = Date.now();
    let held = true;
    let lastHitAt = t0 - (holdMs - tank.msLeft);
    let hiddenAt = null;
    let last = tank;
    let killed = false;
    while (Date.now() - t0 < 8000) {
      const now = Date.now();
      if (held && now - t0 > 1300) {
        await h.page.keyboard.up(away);
        held = false;
      }
      const e = (await h.state()).hpBars.find((x) => x.id === tank.id);
      if (!e) {
        killed = true;
        break;
      }
      last = e;
      if (e.bar === 'shown') {
        lastHitAt = Math.max(lastHitAt, now - (holdMs - e.msLeft));
        hiddenAt = null;
      } else hiddenAt ??= now;
      if (!held && hiddenAt !== null && now - hiddenAt > 1000) break;
      await sleep(40);
    }
    if (held) await h.page.keyboard.up(away);
    const s1 = await h.state();
    const fadeMs = hiddenAt && hiddenAt - lastHitAt;
    h.check(`the ship flew to the wall far from the tank (${away})`, Math.abs(s1.player.x - last.x) > 150, { ship: s1.player.x, tank: last.x });
    h.check('the tank survives, still damaged', !killed && last.hpRatio < 1, { last, killed });
    h.check('its bar hides about HP_BAR_MS after the last hit, within 2s, and stays hidden', hiddenAt !== null && last.bar === 'hidden' && fadeMs > holdMs - 250 && fadeMs < 2000, { fadeMs, holdMs, last });
    await pausedShots('tank-bar-gone', last);

    await h.startAt(5);
    await sleep(3000);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      const s = await h.state();
      const entry = s.hpBars.find((e) => e.bar === 'hud');
      samples.push({ hpRatio: s.boss.hpRatio, bar: entry?.bar ?? null, entryRatio: entry?.hpRatio ?? null, x: entry?.x, y: entry?.y });
      await sleep(120);
    }
    const lastSample = samples.at(-1);
    h.check('the boss takes damage', lastSample.hpRatio < 1, { hpRatio: lastSample.hpRatio });
    h.check('the damaged boss never gets a bar over its sprite, only the HUD bar', samples.every((x) => x.hpRatio === 1 || (x.bar === 'hud' && x.entryRatio === x.hpRatio)), { samples });
    await h.game('pause');
    await h.shot('boss-no-bar');
    await h.shot('boss-no-bar-closeup', { x: lastSample.x - 90, y: 30, w: 180, h: lastSample.y + 70 - 30 });
    await h.game('resume');
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

  async music(h) {
    const VOLUME = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => (await import('/src/audio/music.ts')).MUSIC_VOLUME);
    })();
    const title = await h.state();
    h.check('Title asks for the normal track before any key, with no audio context yet', title.music.track === 'normal' && title.music.ctx === null && title.music.playing === null, { music: title.music });
    await h.step('press Shift on Title (a gesture that starts nothing)', () => h.page.keyboard.press('Shift'));
    const first = await h.waitFor('normal track playing', (x) => x.music.ctx === 'running' && x.music.playing === 'normal' && x.music.step > 8, 4000);
    h.check('the first gesture starts the normal track on a running context, unmuted', first.music.plays === 1 && !first.music.muted && Math.abs(first.music.busGain - VOLUME) < 1e-3, { music: first.music });
    await h.shot('title');
    await h.shot('title-music-hint', { x: 0, y: 0, w: 240, h: 40 });

    await h.step('press Enter on Title', () => h.page.keyboard.press('Enter'));
    const s1 = await h.waitFor('stage 1 fighting', (x) => x.scenes.includes('Stage') && x.life === 'fighting');
    h.check('a wave stage keeps the same normal track playing, not restarted', s1.music.track === 'normal' && s1.music.playing === 'normal' && s1.music.plays === 1 && s1.music.step > first.music.step, { title: first.music, stage: s1.music });

    await h.game('transAmGauge', 100);
    const stepSec = await h.page.evaluate(async () => {
      const { TRACKS } = await import('/src/audio/tracks.ts');
      return 60 / TRACKS.normal.bpm / TRACKS.normal.stepsPerBeat;
    });
    const watch = h.page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const seen = [];
          const until = performance.now() + 4000;
          const tick = () => {
            const s = window.__game.state();
            if (s.life === 'cutIn') seen.push({ cutInMs: s.cutInMs, step: s.music.step, playing: s.music.playing, foe: s.foeSpots[0] });
            else if (seen.length) return resolve([seen[0], seen[seen.length - 1]]);
            if (performance.now() > until) return reject(new Error('no cut-in'));
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    await h.page.keyboard.press('Space');
    const [cutFrom, cutTo] = await watch;
    h.log.steps.push({ action: 'press Space on a full gauge and watch the music through the cut-in', from: cutFrom, to: cutTo });
    const frozenSec = (cutTo.cutInMs - cutFrom.cutInMs) / 1000;
    h.check(
      'the music keeps stepping on the audio clock through the TRANS-AM cut-in while the stage is frozen',
      cutFrom.playing === 'normal' && frozenSec > 0.6 && cutTo.foe.x === cutFrom.foe.x && cutTo.foe.y === cutFrom.foe.y && cutTo.step - cutFrom.step >= Math.floor((frozenSec / stepSec) * 0.8),
      { from: cutFrom, to: cutTo, stepSec },
    );

    for (const [stage, name] of [[5, 'Crimson Seraph'], [10, 'Void Empress']]) {
      const atHpRatio = await h.page.evaluate(async (stage) => {
        const stages = await import('/src/core/stages.ts');
        return stages.BOSSES[stage === 5 ? 'crimsonSeraph' : 'voidEmpress'].transform.atHpRatio;
      }, stage);
      await h.startAt(stage);
      await h.game('god', true);
      const entering = await h.waitFor(`${name}: boss track`, (x) => x.music.playing === 'boss1', 3000);
      h.check(`${name}: the boss stage starts on the first boss track`, entering.music.track === 'boss1' && entering.boss.form === 0, { music: entering.music, boss: entering.boss });
      await h.waitFor(`${name} in place`, (x) => x.boss?.stance === 'fighting', 12000);
      await h.game('bossHp', atHpRatio - 0.05);
      const turning = await h.waitFor(`${name} transforming`, (x) => x.boss?.stance === 'transforming', 4000);
      h.check(`${name}: the transformation switches to the second boss track at once`, turning.music.track === 'boss2', { music: turning.music, boss: { form: turning.boss.form, stance: turning.boss.stance } });
      if (turning.boss.form === 0) h.log.steps.push({ action: `${name}: boss2 asked for while still in form 0`, music: turning.music });
      await sleep(1100);
      await h.game('pause');
      await h.shot(`${name.split(' ')[1].toLowerCase()}-transform`);
      await h.game('resume');
      const second = await h.waitFor(`${name} second form`, (x) => x.boss?.form === 1 && x.boss.stance === 'fighting' && x.music.playing === 'boss2', 10000);
      h.check(`${name}: the second form fights to the second boss track`, second.music.track === 'boss2' && second.music.playing === 'boss2', { music: second.music });
      if (stage === 5) {
        await h.game('kill');
        const quiet = await h.waitFor('Seraph dead, music fading out', (x) => x.boss?.stance === 'dead', 4000);
        h.check('a dead boss fades the music out for the clear', quiet.music.track === null, { music: quiet.music });
        const silent = await h.waitFor('music silent', (x) => x.music.playing === null, 2000);
        const shop = await h.waitFor('shop after the boss', (x) => x.scenes.includes('Shop'), 8000);
        h.check('the shop after the boss brings the normal track back', shop.music.track === 'normal', { silent: silent.music, shop: shop.music });
        const back = await h.waitFor('normal track playing in the shop', (x) => x.music.playing === 'normal', 2000);
        h.log.steps.push({ action: 'shop after the Seraph', music: back.music });
      }
    }

    await h.step('press M', () => h.page.keyboard.press('m'));
    const muted = await h.waitFor('music bus ramped to silence', (x) => x.music.busGain < 1e-4, 1000);
    h.check('M mutes the music: the bus ramps to 0 and the track keeps its place', muted.music.muted && muted.music.playing === 'boss2', { music: muted.music });
    await h.page.reload();
    const reloaded = await h.waitFor('Title after reload', (x) => x.scenes.includes('Title'), 15000);
    await h.page.keyboard.press('Shift');
    const stillMuted = await h.waitFor('context after reload', (x) => x.music.ctx === 'running' && x.music.playing === 'normal', 4000);
    h.check('mute survives a reload', reloaded.music.muted && stillMuted.music.muted && stillMuted.music.busGain < 1e-4, { reloaded: reloaded.music, after: stillMuted.music });
    await h.shot('title-music-muted', { x: 0, y: 0, w: 240, h: 40 });
    await h.step('press M again', () => h.page.keyboard.press('m'));
    const unmuted = await h.waitFor('music bus back up', (x) => Math.abs(x.music.busGain - VOLUME) < 1e-3, 1000);
    h.check('M again brings the music back', !unmuted.music.muted, { music: unmuted.music });
    await h.page.reload();
    const again = await h.waitFor('Title after second reload', (x) => x.scenes.includes('Title'), 15000);
    h.check('unmute survives a reload too', !again.music.muted, { music: again.music });
  },
};

// Close-ups of small HUD art need the canvas's full backing resolution.
const CONTEXT = { 'boss-forms': { deviceScaleFactor: 2 }, 'skill-hud': { deviceScaleFactor: 2 }, items: { deviceScaleFactor: 2 }, movement: { deviceScaleFactor: 2 }, 'enemy-hp': { deviceScaleFactor: 2 }, 'shop-tooltip': { deviceScaleFactor: 2 }, 'trans-am': { deviceScaleFactor: 2 }, 'cut-in': { deviceScaleFactor: 2 } };

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
