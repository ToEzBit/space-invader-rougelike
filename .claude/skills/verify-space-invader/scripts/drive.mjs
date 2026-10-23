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
const APP_URL = `http://127.0.0.1:${port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function harness(page, outDir) {
  const log = { steps: [], checks: [], consoleErrors: [] };
  let shotNo = 0;
  // Chrome logs its own console error for each 404, so a file a journey serves as missing on purpose is let off.
  const missing = new Set();
  page.on('console', (m) => m.type() === 'error' && !missing.has(m.location().url) && log.consoleErrors.push(m.text()));
  page.on('pageerror', (e) => log.consoleErrors.push(`pageerror: ${e.message}`));
  const serve404 = (glob) =>
    page.route(glob, (route) => {
      missing.add(route.request().url());
      return route.fulfill({ status: 404 });
    });

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

  // Title to stage 1 fighting through the hangar with real input. `title` and `go(hangar)` default to Enter;
  // `atHangar(hangar)` runs in the hangar before the launch.
  async function throughHangar({ title = () => page.keyboard.press('Enter'), go = () => page.keyboard.press('Enter'), atHangar } = {}) {
    await step('start a run from Title', title);
    const hangar = await waitFor('hangar before stage 1', (s) => s.scenes.includes('Shop') && s.run?.stage === 0, 8000);
    await atHangar?.(hangar);
    await step('launch from the hangar', () => go(hangar));
    return waitFor('stage 1 fighting', (s) => s.scenes.includes('Stage') && s.run?.stage === 1 && s.life === 'fighting', 8000);
  }

  async function openTitle() {
    await page.goto(APP_URL);
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

  const frameWhen = (pred, pause, timeoutMs = 5000) =>
    page.evaluate(
      ([src, pause, timeoutMs]) =>
        new Promise((resolve, reject) => {
          const test = new Function('s', `return (${src})`);
          const until = performance.now() + timeoutMs;
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
      [pred, pause, timeoutMs],
    );

  // Collects every frame's state()[system][list] rounds (sparks or wisps) until called with null, which returns them.
  const recordRounds = (system, list) =>
    page.evaluate(
      ([system, list]) => {
        if (!system) {
          window.__rounds.on = false;
          return window.__rounds.seen;
        }
        const rec = (window.__rounds = { on: true, seen: [] });
        const tick = () => {
          if (!rec.on) return;
          const s = window.__game.state();
          if (s?.[system]) rec.seen.push(...s[system][list]);
          requestAnimationFrame(tick);
        };
        tick();
      },
      [system, list],
    );

  return { log, state, game, core, waitFor, frameWhen, check, step, shot, hold, startAt, throughHangar, openTitle, steer, track, serve404, recordRounds, page };
}

const VOICE_FILES = '**/transam-*.mp3';
const TONE_RATE = 44100;
const TONE_LOOP_SEC = 4;
const TONE_HZ = 110;
const TONE_SWELL_HZ = 2;
if (!Number.isInteger(TONE_HZ * TONE_LOOP_SEC) || !Number.isInteger(TONE_SWELL_HZ * TONE_LOOP_SEC)) throw new Error('the test tone would click at its loop point');

function loopingTone() {
  return Float32Array.from({ length: TONE_RATE * TONE_LOOP_SEC }, (_, i) => {
    const t = i / TONE_RATE;
    const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * TONE_SWELL_HZ * t);
    return (0.9 * swell * Math.tanh(3 * Math.sin(2 * Math.PI * TONE_HZ * t))) / Math.tanh(3);
  });
}

function wavStereo16(data, rate) {
  const wav = Buffer.alloc(44 + data.length * 4);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data.length * 4, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data.length * 4, 40);
  data.forEach((v, i) => {
    const sample = Math.round(v * 0x7fff);
    wav.writeInt16LE(sample, 44 + i * 4);
    wav.writeInt16LE(sample, 46 + i * 4);
  });
  return wav;
}

function loud95(data, rate) {
  const win = Math.round(rate * 0.05);
  const windows = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let w = 0;
    for (let j = i; j < i + win; j++) w += data[j] * data[j];
    windows.push(Math.sqrt(w / win));
  }
  windows.sort((a, b) => a - b);
  return windows[Math.floor(0.95 * windows.length)];
}

// A 120 px square around a round in flight, kept inside the 480 x 800 world.
function roundCloseup(p) {
  return { x: Math.min(Math.max(0, p.x - 60), 360), y: Math.min(Math.max(0, p.y - 60), 680), w: 120, h: 120 };
}

function summarize(s) {
  if (!s) return null;
  const { run, ...restState } = s;
  return {
    ...restState,
    run: run && { stage: run.stage, money: run.money, hp: run.hp, phase: run.phase.kind, perks: run.perks, items: run.items, transAmGauge: run.transAmGauge, shop: run.phase.shop },
  };
}

function hangarButtons(s) {
  const target = (id) => s.targets.find((t) => t.id === id);
  const [go, card] = [target('go'), target('card0')];
  return !target('refresh') && go && card && go.x + go.w / 2 === card.x + card.w / 2;
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
    let bought;
    const playing = await h.throughHangar({
      title: () => h.page.keyboard.down('Enter'),
      atHangar: async (hangar) => {
        await h.step('keep Enter held into the hangar so it repeats', () => h.page.keyboard.down('Enter'));
        await sleep(300);
        const held = await h.state();
        await h.page.keyboard.up('Enter');
        h.check('a held Enter from Title repeats without leaving the hangar', held.scenes.includes('Shop') && held.run.stage === 0, { scenes: held.scenes, stage: held.run.stage });
        h.check('Enter on Title opens the hangar before stage 1 holding 20 coins', hangar.run.phase.kind === 'shop' && hangar.run.money === 20, summarize(hangar).run);
        const offers = await h.core(
          `${JSON.stringify(hangar.cards)}.map((o) => ({ ...o, branch: perks.PERKS[o.id]?.branch, order: perks.BRANCHES.indexOf(perks.PERKS[o.id]?.branch), tier: perks.PERKS[o.id]?.tier, requires: perks.PERKS[o.id]?.requires ?? null, cost: run.offerCost(${JSON.stringify(hangar.run)}, o) }))`,
        );
        h.check(
          'the hangar offers three tier 1 perks with no prerequisite from three distinct branches in branch order, each priced 20',
          offers.length === 3 &&
            offers.every((o) => o.kind === 'perk' && o.tier === 1 && o.requires === null && o.cost === 20) &&
            new Set(offers.map((o) => o.branch)).size === 3 &&
            offers.every((o, i) => i === 0 || o.order > offers[i - 1].order),
          { offers },
        );
        await sleep(400);
        await h.shot('hangar');
        h.check('the hangar draws no refresh button and centers the go button under the cards', hangarButtons(hangar), { targets: hangar.targets });

        const denies = hangar.sfx.played.deny ?? 0;
        await h.step('press R in the hangar', () => h.page.keyboard.press('r'));
        const refused = await h.waitFor('refresh denied', (x) => (x.sfx.played.deny ?? 0) === denies + 1, 2000);
        await sleep(300);
        const after = await h.state();
        h.check('R in the hangar is refused and leaves money and offers unchanged', after.run.money === 20 && JSON.stringify(after.cards) === JSON.stringify(hangar.cards), { denies: refused.sfx.played.deny, before: hangar.cards, after: after.cards, money: after.run.money });

        const second = hangar.cards[1].id;
        await h.step('press 2 to buy the second card', () => h.page.keyboard.press('2'));
        const paid = await h.waitFor('second card bought', (x) => x.run.perks[second] === 1, 2000);
        h.check('2 buys the second card for all 20 coins', paid.run.money === 0 && paid.cards[1] === null, summarize(paid).run);
        bought = { [second]: 1 };
        await sleep(1000);
        await h.shot('hangar-bought');
      },
    });
    h.check('Enter in the hangar launches stage 1 with the perk bought there', playing.run.stage === 1 && playing.run.phase.kind === 'playing' && playing.run.money === 0 && JSON.stringify(playing.run.perks) === JSON.stringify(bought), summarize(playing).run);
    h.check('stage 1 formation is 3 rows x 8', playing.foes === 24, { foes: playing.foes });
    h.check('full HP', playing.run.hp === 3, { hp: playing.run.hp });
    await h.shot('stage1');
  },

  async combat(h) {
    await h.openTitle();
    const s0 = await h.throughHangar();
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

  async 'gunner-fan'(h) {
    const SAMPLES = 6;
    // Every needle born until `minVolleys` frames have spawned one, with its first SAMPLES positions and the ship
    // and foes on the frame it appeared. Needles already in flight on the first frame are left out, since their first
    // position is not their muzzle. State and bullets are read in the same animation frame.
    const recordNeedles = (minVolleys, timeoutMs) =>
      h.page.evaluate(
        ([minVolleys, timeoutMs, SAMPLES]) =>
          new Promise((resolve) => {
            const g = window.__game;
            const needles = new Map();
            const volleys = new Set();
            const inFlight = new Set(g.shots().map((b) => b.id));
            const until = performance.now() + timeoutMs;
            let frame = 0;
            const tick = () => {
              const s = g.state();
              frame++;
              for (const b of g.shots()) {
                if (b.kind !== 'needle' || inFlight.has(b.id)) continue;
                const n = needles.get(b.id);
                if (!n) {
                  needles.set(b.id, { id: b.id, frame, lastFrame: frame, at: [{ x: b.x, y: b.y }], player: s.player, spots: s.foeSpots });
                  volleys.add(frame);
                } else if (n.at.length < SAMPLES) {
                  n.at.push({ x: b.x, y: b.y });
                  n.lastFrame = frame;
                } else n.lastFrame = frame;
              }
              const settled = [...needles.values()].every((n) => n.at.length >= SAMPLES || n.lastFrame < frame);
              if ((volleys.size >= minVolleys && settled) || performance.now() > until) return resolve({ frames: frame, needles: [...needles.values()] });
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [minVolleys, timeoutMs, SAMPLES],
      );
    // Needles born on the same frame within a few pixels of each other left one gunner together.
    const volleysOf = (needles) => {
      const groups = [];
      for (const n of needles) {
        const g = groups.find((v) => v.frame === n.frame && Math.hypot(v.needles[0].at[0].x - n.at[0].x, v.needles[0].at[0].y - n.at[0].y) < 12);
        if (g) g.needles.push(n);
        else groups.push({ frame: n.frame, needles: [n] });
      }
      return groups.map(({ frame, needles }) => {
        const origin = { x: needles.reduce((a, n) => a + n.at[0].x, 0) / needles.length, y: needles.reduce((a, n) => a + n.at[0].y, 0) / needles.length };
        const { player, spots } = needles[0];
        const aim = Math.atan2(player.y - origin.y, player.x - origin.x);
        const offsets = needles
          .filter((n) => n.at.length >= 4)
          .map((n) => {
            const [a, b] = [n.at[0], n.at.at(-1)];
            return Math.atan2(b.y - a.y, b.x - a.x) - aim;
          })
          .sort((a, b) => a - b);
        const shooterPx = Math.min(...spots.map((f) => Math.hypot(f.x - origin.x, f.y + 10 - origin.y)));
        return { frame, size: needles.length, origin, player, offsets: offsets.map((o) => +o.toFixed(4)), shooterPx: +shooterPx.toFixed(1) };
      });
    };
    const near = (a, b) => Math.abs(a - b) <= 0.03;
    // Stage 6 gunners sit behind two rows of drones. From a still ship only a few columns open and the fans can stop
    // within 20s, so the ship first sweeps the width to thin the drones, then holds still so every needle aims at one point.
    const six0 = await h.startAt(6, { heavyCaliber: 2 });
    await h.game('god', true);
    const swept = await h.step('sweep left, right and back to the middle twice', async () => {
      for (const key of ['a', 'd', 'd', 'a', 'a', 'd', 'd', 'a']) await h.hold(key, 700);
    });
    h.check('stage 6: the sweep killed foes with real fire', swept.foes < six0.foes, { before: six0.foes, after: swept.foes });
    const FAN_SPREAD = await h.page.evaluate(() => import('/src/game/formation.ts').then((m) => m.FAN_SPREAD));
    const fan = await h.page.evaluate(() => import('/src/core/stages.ts').then((m) => [m.stageDef(4).gunnerFan, m.stageDef(6).gunnerFan]));
    h.check('stage 4 gunners fire 1 needle and stage 6 gunners 3', fan[0] === 1 && fan[1] === 3, { stage4: fan[0], stage6: fan[1], FAN_SPREAD });

    const six = await recordNeedles(4, 45000);
    const fans = volleysOf(six.needles);
    h.log.steps.push({ action: 'stage 6: record needles live', frames: six.frames, needles: six.needles.length, volleys: fans });
    h.check('stage 6: gunners fired at least 4 volleys', fans.length >= 4, { volleys: fans.length, frames: six.frames });
    h.check('stage 6: every volley is 3 needles from one gunner on one frame', fans.every((v) => v.size === 3 && v.shooterPx <= 16), { volleys: fans.map(({ frame, size, shooterPx }) => ({ frame, size, shooterPx })) });
    h.check(
      'stage 6: the middle needle aims at the ship and the outer two fan out by FAN_SPREAD',
      fans.every((v) => v.offsets.length === 3 && near(v.offsets[0], -FAN_SPREAD) && near(v.offsets[1], 0) && near(v.offsets[2], FAN_SPREAD)),
      { FAN_SPREAD, offsets: fans.map((v) => v.offsets) },
    );

    // About 300 ms after a fan leaves, its outer needles are far enough apart to see as three.
    const inFlight = await h.page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const g = window.__game;
          const born = new Map();
          let frame = 0;
          const until = performance.now() + 20000;
          const tick = () => {
            frame++;
            const needles = g.shots().filter((b) => b.kind === 'needle');
            for (const b of needles) if (!born.has(b.id)) born.set(b.id, frame);
            const old = needles.filter((b) => frame - born.get(b.id) === 18);
            if (old.length === 3) {
              g.pause();
              return resolve(old);
            }
            if (performance.now() > until) return reject(new Error('no fan in flight within 20s'));
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
    h.log.steps.push({ action: 'stage 6: pause with a fan 18 frames out', needles: inFlight });
    await h.shot('stage6-fan');
    const xs = inFlight.map((b) => b.x);
    const ys = inFlight.map((b) => b.y);
    await h.shot('stage6-fan-closeup', { x: Math.max(0, Math.min(...xs) - 50), y: Math.max(0, Math.min(...ys) - 70), w: Math.max(...xs) - Math.min(...xs) + 100, h: Math.max(...ys) - Math.min(...ys) + 120 });
    await h.game('resume');

    await h.startAt(4, { heavyCaliber: 1 });
    await h.game('god', true);
    const four = await recordNeedles(5, 40000);
    const singles = volleysOf(four.needles);
    h.log.steps.push({ action: 'stage 4: record needles live', frames: four.frames, needles: four.needles.length, volleys: singles });
    h.check('stage 4: gunners fired at least 5 needles', four.needles.length >= 5, { needles: four.needles.length, frames: four.frames });
    h.check('stage 4: every needle leaves its gunner alone, aimed at the ship', singles.every((v) => v.size === 1 && v.shooterPx <= 16 && v.offsets.length === 1 && near(v.offsets[0], 0)), {
      volleys: singles.map(({ frame, size, shooterPx, offsets }) => ({ frame, size, shooterPx, offsets })),
    });
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

    await h.startAt(6, {}, 500);
    await h.game('kill');
    const late = await h.waitFor('Shop scene after stage 6', (x) => x.scenes.includes('Shop') && x.run.stage === 6);
    const prices = await h.core(`${JSON.stringify(late.cards)}.map((o) => ({
      offer: o,
      first: o.kind === 'perk' ? perks.perkCost(perks.PERKS[o.id], 1) : items.ITEMS[o.id].cost,
      now: run.offerCost(${JSON.stringify(late.run)}, o),
    }))`);
    h.check('every price after stage 6 is a multiple of 5 and above its first-shop price', prices.every((p) => p.now % 5 === 0 && p.now > p.first), { prices });
    await sleep(300);
    await h.shot('later-shop');
    const lateBuy = await h.step('press 1 in the later shop', () => h.page.keyboard.press('1'));
    h.check('1 in the later shop charges its risen price', lateBuy.run.money === late.run.money - prices[0].now, { before: late.run.money, after: lateBuy.run.money, price: prices[0].now });
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
    const dearestItem = await h.core(`Math.max(...items.ITEM_IDS.map((id) => run.offerCost(${JSON.stringify(s.run)}, { kind: 'item', id })))`);
    let refreshes = 0;
    while (itemSlot(s) < 0 && refreshes < 40) {
      const cost = await h.core(`run.refreshCost(${JSON.stringify(s.run)})`);
      if (s.run.money - cost < dearestItem) break;
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
    await h.waitFor('the cut-in over', (x) => x.life === 'fighting', 5000);
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
    await h.serve404(VOICE_FILES);
    const [TA, CUT] = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => {
        const [t, c] = await Promise.all([import('/src/core/transAm.ts'), import('/src/core/cutIn.ts')]);
        return [t.TRANS_AM, { ...c.CUT_IN, total: c.SILENT_CUT_IN_MS }];
      });
    })();
    const bandAt = CUT.dimMs;
    const slashAt = CUT.dimMs + CUT.bandMs;
    const shotAt = async (name, pred) => {
      const frame = await h.frameWhen(pred, true);
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
    const dimFrame = h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${CUT.dimMs * 0.5}`, true);
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
    const pressed = await h.frameWhen('true', false);
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

    const after = await h.frameWhen(`s.life === 'fighting'`, false);
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
    const early = h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${bandAt}`, false);
    await h.page.keyboard.press('Space');
    const a = await early;
    const b = await h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= ${slashAt + CUT.slashMs * 0.5}`, false);
    const bossHeld = frozenAcross(a, b);
    h.log.steps.push({ action: 'held ArrowLeft through a cut-in in the stage 5 boss fight', from: a.s.cutInMs, to: b.s.cutInMs, held: bossHeld, boss: a.s.boss, shots: a.shots.length });
    h.check('boss, bullets and ship hold still through the cut-in, with ArrowLeft held', Object.values(bossHeld).every(Boolean) && a.shots.length > 0, { held: bossHeld, shots: a.shots.length, boss: [a.s.boss, b.s.boss] });
    const moved = await h.waitFor('the ship moving left after the cut-in', (x) => x.life === 'fighting' && x.player.x < a.s.player.x - 20, 2000);
    await h.page.keyboard.up('ArrowLeft');
    h.check('the held key moves the ship once the stage resumes', moved.player.x < a.s.player.x, { from: a.s.player.x, to: moved.player.x });
  },

  async voice(h) {
    const warnings = [];
    h.page.on('console', (m) => m.type() === 'warning' && m.text().startsWith('voice:') && warnings.push(m.text()));
    await h.page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      const taps = new Map();
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && dest.context instanceof AudioContext) {
          if (!taps.has(dest.context)) taps.set(dest.context, Object.assign(dest.context.createAnalyser(), { fftSize: 512 }));
          connect.call(this, taps.get(dest.context));
        }
        return connect.call(this, dest, ...rest);
      };
      const frame = new Float32Array(512);
      // Phaser opens an AudioContext of its own at boot, so the journey names the game's.
      window.__tap = () => {
        const ctx = window.__gameAudio;
        const tap = taps.get(ctx);
        if (!tap) return { audioMs: null, rms: 0 };
        tap.getFloatTimeDomainData(frame);
        return { audioMs: ctx.currentTime * 1000, rms: Math.sqrt(frame.reduce((sum, v) => sum + v * v, 0) / frame.length) };
      };
    });
    const [TA, CUT] = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => {
        const [t, c] = await Promise.all([import('/src/core/transAm.ts'), import('/src/core/cutIn.ts')]);
        return [t.TRANS_AM, { ...c.CUT_IN, total: c.SILENT_CUT_IN_MS }];
      });
    })();
    const frozenAcross = (a, b) => ({
      shots: JSON.stringify(a.shots) === JSON.stringify(b.shots),
      foes: JSON.stringify(a.foeSpots) === JSON.stringify(b.foeSpots),
      player: JSON.stringify(a.player) === JSON.stringify(b.player),
      fired: a.fired === b.fired,
      fightMs: a.fightMs === b.fightMs,
    });
    const FRAMES_AFTER_RELEASE = 40;
    const recordActivationFrames = async () => {
      await h.game('transAmGauge', TA.gaugeMax);
      const frames = h.page.evaluate(
        ([activeMs, framesAfterRelease]) =>
          new Promise((resolve, reject) => {
            const frames = [];
            const until = performance.now() + 8000;
            const tick = () => {
              const s = window.__game.state();
              const t = s.transAm;
              const released = frames.findIndex((f) => f.released);
              frames.push({
                ...window.__tap(),
                life: s.life,
                cutInMs: s.cutInMs,
                cutInTotalMs: s.cutInTotalMs,
                released: t.kind === 'active' && t.msLeft < activeMs,
                flashing: s.flashing,
                shots: JSON.stringify(window.__game.shots()),
                foeSpots: s.foeSpots,
                player: s.player,
                fired: s.tally.fired,
                fightMs: s.clock.fightMs,
                last: s.voice.last,
                spoken: s.voice.spoken,
              });
              if (released >= 0 && frames.length - released > framesAfterRelease) return resolve(frames.slice(frames.findIndex((f) => f.life === 'cutIn')));
              if (performance.now() > until) return reject(new Error('no release after Space'));
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [TA.activeMs, FRAMES_AFTER_RELEASE],
      );
      await h.page.keyboard.press('Space');
      return frames;
    };
    const ONSET = { quietRms: 0.002, loudRms: 0.008, quietBeforeReleaseMs: 100, loudForMs: 400 };
    const shoutOnset = (frames, releaseAt) => {
      const quiet = frames.filter((f) => f.rms < ONSET.quietRms && f.audioMs < releaseAt + ONSET.quietBeforeReleaseMs).at(-1);
      const onset = quiet && frames.find((f) => f.audioMs > quiet.audioMs && f.rms >= ONSET.loudRms);
      const after = onset ? Math.max(...frames.filter((f) => f.audioMs >= onset.audioMs && f.audioMs < onset.audioMs + ONSET.loudForMs).map((f) => f.rms)) : 0;
      return { quietAt: quiet?.audioMs, onsetAt: onset?.audioMs, loudest: after };
    };

    await h.page.keyboard.press('Shift');
    const ready = await h.waitFor('both voice lines decoded', (x) => x.voice.lines.every((l) => l.status === 'ready'), 8000);
    const lines = ready.voice.lines;
    await h.page.evaluate(async () => (window.__gameAudio = (await import('/src/audio/context.ts')).audioContext()));
    h.log.steps.push({ action: 'decoded the voice lines', lines: lines.map(({ url, segments, slices, shoutAtMs, gain }) => ({ url, segments, slices, shoutAtMs, gain })) });
    h.check('each line ends on a shout after its lead-in', lines.every((l) => l.segments.length >= 2 && l.shoutAtMs > 0), { lines: lines.map((l) => ({ segments: l.segments.length, shoutAtMs: l.shoutAtMs })) });
    if (!ready.music.muted) await h.page.keyboard.press('m');
    await h.waitFor('music muted', (x) => x.music.muted && (x.music.busGain ?? 0) < 1e-4, 2000);
    await h.startAt(4);
    await h.game('god', true);
    await sleep(500);

    const said = [];
    for (let use = 0; use < 4; use++) {
      const frames = await recordActivationFrames();
      const cut = frames.filter((f) => f.life === 'cutIn');
      const [first, lastCut] = [cut[0], cut.at(-1)];
      const release = frames.find((f) => f.released);
      const line = release.last;
      said.push(line);
      const totalMs = first.cutInTotalMs;
      const expected = Math.max(CUT.total, CUT.dimMs + lines[line].shoutAtMs);
      const pressAt = first.audioMs - first.cutInMs;
      const releaseAt = release.audioMs;
      const onset = shoutOnset(frames, releaseAt);
      const lastFrameMs = lastCut.cutInMs - cut.at(-2).cutInMs;
      h.log.steps.push({
        action: `activation ${use + 1}: Space with a full gauge`,
        line,
        url: lines[line].url,
        totalMs,
        expected,
        lastCutInMs: lastCut.cutInMs,
        releaseAfterPressMs: releaseAt - pressAt,
        onset: { ...onset, fromReleaseMs: onset.onsetAt - releaseAt },
        held: frozenAcross(first, lastCut),
        frames: frames.map(({ shots, foeSpots, ...f }) => f),
      });
      h.check(`activation ${use + 1}: the cut-in lasts its line's lead plus shoutAtMs`, Math.abs(totalMs - expected) < 1e-6 && totalMs > CUT.total, { totalMs, expected, line });
      h.check(`activation ${use + 1}: the stage stays frozen to the end of the cut-in`, Object.values(frozenAcross(first, lastCut)).every(Boolean) && lastCut.cutInMs < totalMs && totalMs - lastCut.cutInMs <= lastFrameMs + 1, { held: frozenAcross(first, lastCut), lastCutInMs: lastCut.cutInMs, lastFrameMs, totalMs });
      const releaseIndex = frames.indexOf(release);
      const endIndex = frames.findIndex((f, i) => i > frames.indexOf(lastCut) && f.life === 'fighting');
      h.check(`activation ${use + 1}: the release fires on the frame after the cut-in ends`, releaseIndex === endIndex + 1 && release.flashing, { releaseIndex, endIndex, flashing: release.flashing });
      h.check(`activation ${use + 1}: the shout starts within 50 ms of the release, heard on the output`, onset.onsetAt !== undefined && Math.abs(onset.onsetAt - releaseAt) <= 50 && releaseAt - onset.quietAt < 400 && onset.loudest > 0.02, { ...onset, releaseAt, fromReleaseMs: onset.onsetAt - releaseAt });
      await sleep(400);
    }
    h.check('the lines alternate and both play', said.every((l, i) => i === 0 || l !== said[i - 1]) && new Set(said).size === 2, { said });

    await h.game('transAmGauge', TA.gaugeMax);
    const midBand = h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= s.cutInTotalMs / 2`, true);
    await h.page.keyboard.press('Space');
    const mid = await midBand;
    await h.shot('stretched-band');
    h.log.steps.push({ action: 'paused mid band', cutInMs: mid.s.cutInMs, cutInTotalMs: mid.s.cutInTotalMs, line: mid.s.voice.last });
    await h.game('resume');
    const rel = await h.frameWhen(`s.transAm.kind === 'active' && s.transAm.msLeft < ${TA.activeMs}`, true);
    await h.shot('release');
    h.log.steps.push({ action: 'paused on the release frame', transAm: rel.s.transAm, flashing: rel.s.flashing });
    await h.game('resume');
    const ring = await h.frameWhen(`s.transAm.kind === 'active' && s.transAm.msLeft <= ${TA.activeMs - 100}`, true);
    await h.shot('release-ring');
    h.log.steps.push({ action: 'paused 100 ms into the release', transAm: ring.s.transAm });
    await h.game('resume');

    await h.serve404(VOICE_FILES);
    await h.page.reload();
    await h.waitFor('Title with the voice files missing', (x) => x.scenes.includes('Title'), 15000);
    await h.page.keyboard.press('Shift');
    const failed = await h.waitFor('both voice lines failed', (x) => x.voice.lines.every((l) => l.status === 'failed'), 8000);
    await h.page.evaluate(async () => (window.__gameAudio = (await import('/src/audio/context.ts')).audioContext()));
    await sleep(300);
    h.check('missing voice files warn once, naming both', warnings.length === 1 && lines.every((l) => warnings[0].includes(l.url)), { warnings: [...warnings], lines: failed.voice.lines });
    await h.startAt(4);
    await h.game('god', true);
    await sleep(500);
    const frames = await recordActivationFrames();
    const cut = frames.filter((f) => f.life === 'cutIn');
    const tail = cut.filter((f) => f.cutInMs >= 600).map((f) => f.rms);
    const release = frames.find((f) => f.released);
    h.log.steps.push({ action: 'Space with the voice files missing', totalMs: cut[0].cutInTotalMs, tailRms: tail, spoken: release.spoken, frames: frames.map(({ shots, foeSpots, ...f }) => f) });
    h.check('without a voice line the cut-in is the silent 1000 ms', cut[0].cutInTotalMs === CUT.total && release.spoken === 0 && release.last === null, { totalMs: cut[0].cutInTotalMs, spoken: release.spoken });
    h.check('and nothing but the fading sweep is heard under it', tail.length > 0 && Math.max(...tail) < 0.001, { loudest: Math.max(...tail) });
  },

  async 'trans-am-sound'(h) {
    await h.page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      const outs = new Map();
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && dest.context instanceof AudioContext) {
          if (!outs.has(dest.context)) outs.set(dest.context, Object.assign(dest.context.createAnalyser(), { fftSize: 512 }));
          connect.call(this, outs.get(dest.context));
        }
        return connect.call(this, dest, ...rest);
      };
      const frame = new Float32Array(512);
      const rms = (analyser) => {
        analyser.getFloatTimeDomainData(frame);
        return Math.sqrt(frame.reduce((sum, v) => sum + v * v, 0) / frame.length);
      };
      // Phaser boots its own AudioContext too, so outs taps both outputs and audioContext() picks the game's, with its layer buses.
      window.__tapTransAm = async () => {
        const ctx = (await import('/src/audio/context.ts')).audioContext();
        const buses = Object.entries((await import('/src/audio/transAmSound.ts')).gameBuses());
        const taps = buses.map(([layer, bus]) => {
          const tap = Object.assign(ctx.createAnalyser(), { fftSize: 512 });
          connect.call(bus, tap);
          return [layer, tap];
        });
        window.__taps = () => ({ audioMs: ctx.currentTime * 1000, out: rms(outs.get(ctx)), ...Object.fromEntries(taps.map(([layer, tap]) => [layer, rms(tap)])) });
      };
    });
    await h.openTitle();
    const [TA, SOUND, fireMs] = await h.page.evaluate(async () => {
      const { TRANS_AM, withTransAm } = await import('/src/core/transAm.ts');
      const { deriveStats } = await import('/src/core/perks.ts');
      return [TRANS_AM, (await import('/src/audio/transAmLayers.ts')).TRANS_AM_SOUND, withTransAm(deriveStats({}), { kind: 'active', msLeft: 1 }).fireIntervalMs];
    });
    await h.page.keyboard.press('Shift');
    await h.waitFor('both voice lines decoded', (x) => x.voice.lines.every((l) => l.status === 'ready'), 8000);
    await h.page.evaluate(() => window.__tapTransAm());
    if (!(await h.state()).music.muted) await h.page.keyboard.press('m');
    const open = (await h.waitFor('music muted', (x) => x.music.muted && x.music.busGain < 1e-4, 2000)).music.cutoffHz;
    h.check('the music lowpass sits fully open before any TRANS-AM', open >= 20000, { cutoffHz: open });

    const record = (stop, msAfterStop, timeoutMs = 15000) =>
      h.page.evaluate(
        ([stop, msAfterStop, timeoutMs]) =>
          new Promise((resolve, reject) => {
            const done = new Function('s', `return (${stop})`);
            const frames = [];
            const until = performance.now() + timeoutMs;
            let stoppedAt = null;
            const tick = () => {
              const s = window.__game.state();
              const { live, releases, ticksAtMsLeft, shots } = s.transAmSound;
              frames.push({ ...window.__taps(), scenes: s.scenes, life: s.life ?? null, transAm: s.transAm ?? null, cutoffHz: s.music.cutoffHz, live, releases, shots, ticks: ticksAtMsLeft.length });
              if (stoppedAt === null && done(s)) stoppedAt = performance.now();
              if (stoppedAt !== null && performance.now() - stoppedAt >= msAfterStop) return resolve({ frames, sound: window.__game.state().transAmSound });
              if (performance.now() > until) return reject(new Error(`timed out recording until ${stop}`));
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [stop, msAfterStop, timeoutMs],
      );
    const LAYERS = ['release', 'hum', 'shot', 'tick'];
    const silent = (f) => LAYERS.every((l) => f[l] === 0);
    const liveNodes = (f) => Object.values(f.live).reduce((a, b) => a + b, 0);
    const active = (f) => f.transAm?.kind === 'active';
    const loudest = (frames, layer) => Math.max(0, ...frames.map((f) => f[layer]));
    const slim = (frames) => frames.map(({ scenes, ...f }) => f);

    await h.startAt(4);
    await h.game('god', true);
    await sleep(500);
    await h.game('transAmGauge', TA.gaugeMax);
    const recorded = record(`s.transAm.kind === 'depleted'`, 900);
    await h.page.keyboard.press('Space');
    const { frames, sound } = await recorded;
    h.log.steps.push({ action: 'Space with a full gauge in stage 4, recorded to 900 ms after depleted', sound, frames: slim(frames) });
    const cut = frames.filter((f) => f.life === 'cutIn');
    const release = frames.find((f) => active(f) && f.transAm.msLeft < TA.activeMs);
    const at = (f) => frames.indexOf(f);
    const ran = frames.filter((f) => active(f) && at(f) >= at(release));
    const depleted = frames.find((f) => f.transAm?.kind === 'depleted');
    const sinceRelease = (f) => f.audioMs - release.audioMs;
    const firstHum = frames.find((f) => f.hum > 0);
    const held = ran.filter((f) => sinceRelease(f) > SOUND.hum.fadeInMs && f.audioMs < depleted.audioMs - 50);
    const muffled = ran.filter((f) => sinceRelease(f) > SOUND.muffle.downSec * 1000 + 50);
    const ticking = frames.filter((f) => f.tick > 0);
    const zipping = frames.filter((f) => f.shot > 0);
    const after = frames.at(-1);
    h.check('nothing TRANS-AM plays through the cut-in: every layer bus is silent, no node is live and the music stays open', cut.length > 10 && cut.every((f) => silent(f) && liveNodes(f) === 0 && f.cutoffHz >= open * 0.99), { cutFrames: cut.length, loudest: Math.max(...LAYERS.map((l) => loudest(cut, l))), live: cut.map(liveNodes).filter(Boolean) });
    h.check('the hum starts on the release frame and is heard on its bus within 50 ms of it', firstHum && at(firstHum) >= at(release) && sinceRelease(firstHum) <= 50 && Math.abs(sound.humFromMs - release.audioMs) <= 50, { releaseAudioMs: release.audioMs, humFromMs: sound.humFromMs, firstHeardMs: firstHum?.audioMs, releaseFrame: at(release), firstHumFrame: at(firstHum) });
    const hits = frames.filter((f) => f.release > 0);
    h.check('the release hit plays once, heard from within 50 ms of the release frame until it decays', hits.length > 0 && at(hits[0]) >= at(release) && sinceRelease(hits[0]) <= 50 && sinceRelease(hits.at(-1)) < SOUND.release.thump.sec * 1000 + 50 && sound.releases === cut[0].releases + 1, { releases: sound.releases, before: cut[0].releases, firstHeardMs: hits[0] && sinceRelease(hits[0]), lastHeardMs: hits.at(-1) && sinceRelease(hits.at(-1)), loudest: loudest(frames, 'release') });
    h.check('the hum holds through the active time after its fade-in and reaches the output with the music muted', held.length > 200 && held.every((f) => f.hum > 0.001 && f.out > 0.001), { frames: held.length, quietest: Math.min(...held.map((f) => f.hum)), loudest: loudest(held, 'hum'), quietestOut: Math.min(...held.map((f) => f.out)) });
    h.check('the music lowpass drops to the muffle cutoff while active', muffled.length > 200 && muffled.every((f) => f.cutoffHz <= SOUND.muffle.cutoffHz * 1.05), { highest: Math.max(...muffled.map((f) => f.cutoffHz)), cutoffHz: SOUND.muffle.cutoffHz });
    h.check('ticks sound only in the last 1.5 s of the active time, one per tick time', ticking.length > 0 && ticking.every((f) => active(f) && f.transAm.msLeft <= 1500) && sound.ticksAtMsLeft.length === SOUND.tick.atMsLeft.length && sound.ticksAtMsLeft.every((ms, i) => ms <= SOUND.tick.atMsLeft[i] && ms > SOUND.tick.atMsLeft[i] - 60), { ticksAtMsLeft: sound.ticksAtMsLeft, earliestHeardMsLeft: Math.max(...ticking.map((f) => f.transAm?.msLeft ?? -1)) });
    h.check('shots zip only while active, one per volley', zipping.every((f) => active(f) || f.audioMs - depleted.audioMs < SOUND.shot.sec * 1000 + 20) && Math.abs(sound.shots - TA.activeMs / fireMs) <= 3, { shots: sound.shots, expected: TA.activeMs / fireMs });
    h.check('900 ms after depleted every TRANS-AM node is gone, every bus silent and the music open again', liveNodes(after) === 0 && silent(after) && after.cutoffHz >= open * 0.99, { live: after.live, hum: after.hum, cutoffHz: after.cutoffHz });

    const outroCrossesTicksMsLeft = SOUND.tick.atMsLeft[0] + 200;
    const ENDINGS = [
      { name: 'stage clear', stage: 1, end: () => h.game('kill'), next: 'Shop' },
      { name: 'ship down', stage: 4, end: () => h.page.evaluate(() => { window.__game.god(false); while (window.__game.state().run.phase.kind !== 'defeat') window.__game.hurt(); }), next: 'End' },
      { name: 'restart', stage: 4, end: () => h.game('start', 4), next: 'Stage' },
    ];
    for (const ending of ENDINGS) {
      await h.startAt(ending.stage);
      await h.game('god', true);
      await sleep(300);
      await h.game('transAmGauge', TA.gaugeMax);
      const late = h.frameWhen(`s.transAm.kind === 'active' && s.transAm.msLeft <= ${outroCrossesTicksMsLeft}`, false, 15000);
      await h.page.keyboard.press('Space');
      await late;
      const tail = record('true', 2400);
      await ending.end();
      const { frames: ended, sound: endSound } = await tail;
      const cutAt = ended.findIndex((f) => f.life !== 'fighting');
      const settled = ended.filter((f) => f.audioMs - ended[cutAt].audioMs > (SOUND.muffle.upSec + 0.2) * 1000);
      h.log.steps.push({ action: `${ending.name} with TRANS-AM active at msLeft <= ${outroCrossesTicksMsLeft}`, sound: endSound, frames: slim(ended) });
      const over = ended.slice(cutAt);
      const rung = over.filter((f) => f.audioMs - ended[cutAt].audioMs > SOUND.tick.sec * 1000 + 30);
      h.check(`${ending.name}: no tick, zip or release starts once the stage is over, and the last zip dies away`, over.every((f) => f.ticks === over[0].ticks && f.shots === over[0].shots && f.releases === over[0].releases) && rung.every((f) => f.tick === 0 && f.shot === 0 && f.release === 0), { ticks: endSound.ticksAtMsLeft, shots: [over[0].shots, over.at(-1).shots], cutAt, life: ended[cutAt].life, loudAfter: Math.max(...rung.map((f) => Math.max(f.tick, f.shot, f.release))) });
      h.check(`${ending.name}: the hum and every other node stop, the buses fall silent and the music opens again`, settled.length > 10 && settled.every((f) => liveNodes(f) === 0 && silent(f) && f.cutoffHz >= open * 0.99), { settled: settled.length, live: settled.at(0)?.live, loudestHum: loudest(settled, 'hum'), lowestCutoff: Math.min(...settled.map((f) => f.cutoffHz)) });
      const landed = await h.waitFor(`${ending.next} after ${ending.name}`, (x) => x.scenes.includes(ending.next) && (ending.next !== 'Stage' || x.life === 'fighting'), 8000);
      // A fresh stage pops its own sfx, so it is paused while the output is read.
      if (ending.next === 'Stage') await h.game('pause');
      await sleep(700);
      const out = await h.page.evaluate(() => window.__taps());
      if (ending.next === 'Stage') await h.game('resume');
      h.check(`${ending.name}: in ${ending.next} nothing TRANS-AM is live and the muted game is silent`, liveNodes(landed.transAmSound) === 0 && silent(out) && out.out < 1e-4 && landed.music.cutoffHz >= open * 0.99, { live: landed.transAmSound.live, out, cutoffHz: landed.music.cutoffHz });
    }
  },

  async graze(h) {
    const SPARK_SPLIT = 3;
    const PHASE_EVERY = 8;
    const PULSE_EVERY = 4;
    const loadout = { closeCall: 3, wideHalo: 3, adrenaline: 3, sparkSplit: SPARK_SPLIT, staticSkin: 3, phaseSkin: 2, bulletTime: 2 };
    const pausedShot = async (name, region) => {
      await h.game('pause');
      await h.shot(name);
      if (region) await h.shot(`${name}-closeup`, region);
      await h.game('resume');
    };
    const around = (p) => ({ x: Math.max(0, p.x - 120), y: p.y - 200, w: 240, h: 250 });

    await h.startAt(4, { closeCall: 1 }, 2000);
    await h.game('kill');
    let shop = await h.waitFor('the shop after stage 4', (x) => x.scenes.includes('Shop') && x.run.stage === 4);
    const grazeCards = (s) => h.core(`${JSON.stringify(s.cards)}.filter((o) => o?.kind === 'perk' && perks.PERKS[o.id].branch === 'graze').map((o) => o.id)`);
    for (let i = 0; i < 15 && (await grazeCards(shop)).length === 0; i++) shop = await h.step('press R for a graze card', () => h.page.keyboard.press('r'));
    const offered = await grazeCards(shop);
    h.check('with Close Call owned, the shop offers the graze branch', offered.length > 0, { cards: shop.cards });
    await sleep(800);
    await h.shot('shop-graze-card');

    const base = await h.core(`perks.deriveStats(${JSON.stringify(loadout)})`);
    const GRAZE = await h.core('perks.GRAZE');
    const core = await h.page.evaluate(() => import('/src/game/hitbox.ts').then((m) => m.PLAYER_RADIUS.core));
    const TA = await h.page.evaluate(() => import('/src/core/transAm.ts').then((m) => m.TRANS_AM));
    await h.startAt(5, loadout);
    await h.game('god', true);
    await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000);

    // Every frame's graze state and live enemy bullets, read in one animation frame.
    await h.page.evaluate(() => {
      const g = window.__game;
      const rec = (window.__grazeRec = { on: true, frames: [] });
      const tick = () => {
        if (!rec.on) return;
        const s = g.state();
        if (s?.graze && s.life === 'fighting')
          rec.frames.push({
            ms: s.clock.fightMs,
            grazes: s.tally.grazes,
            hits: s.tally.hits,
            spark: s.tally.dealt.spark ?? 0,
            streak: s.graze.streak,
            slowMs: s.graze.slowMs,
            rushMs: s.graze.rushMs,
            counted: s.graze.grazes,
            grazedId: s.graze.lastGrazedId,
            pulses: s.graze.pulses,
            pulse: s.graze.lastPulse,
            sparks: s.graze.sparks.length,
            shieldMs: s.shieldMs,
            fireMs: s.stats.fireIntervalMs,
            transAm: s.transAm.kind,
            player: s.player,
            shots: g.shots().map((b) => [b.id, b.x, b.y]),
          });
        requestAnimationFrame(tick);
      };
      tick();
    });

    // Real arrow keys weave left and right under the boss, first sidestepping any bullet on course for the core, so
    // grazes run up a streak, then without the sidestep until a bullet lands. Her HP is held above her transformation
    // so she keeps firing her first form's patterns.
    const snap = () => h.page.evaluate(() => ({ s: window.__game.state(), shots: window.__game.shots() }));
    let held = null;
    const hold = async (k) => {
      if (k === held) return;
      if (held) await h.page.keyboard.up(held);
      if (k) await h.page.keyboard.down(k);
      held = k;
    };
    const threat = (s, shots, prev) => {
      const dt = s.clock.fightMs - prev.ms;
      let near = null;
      for (const b of dt > 0 ? shots : []) {
        const p = prev.at.get(b.id);
        if (!p) continue;
        const [vx, vy, rx, ry] = [(b.x - p.x) / dt, (b.y - p.y) / dt, b.x - s.player.x, b.y - s.player.y];
        const t = Math.min(Math.max(-(rx * vx + ry * vy) / (vx * vx + vy * vy || 1), 0), 400);
        if (Math.hypot(rx + vx * t, ry + vy * t) < core + 10 && (!near || t < near.t)) near = { t, side: Math.sign(rx + vx * t) };
      }
      return near;
    };
    let weave = 'ArrowRight';
    const seen = { sparkShot: false, shieldShot: false, streakHit: false, pulseShot: false };
    let { s, shots } = await snap();
    const first = s;
    let prev = { ms: s.clock.fightMs, at: new Map() };
    const end = Date.now() + 60000;
    while (Date.now() < end && !(seen.sparkShot && seen.shieldShot && seen.streakHit && seen.pulseShot && s.tally.grazes - first.tally.grazes >= 15)) {
      if (s.boss.hpRatio < 0.7) await h.game('bossHp', 1);
      if (!seen.pulseShot && s.graze.pulses >= 1) {
        const pulsed = await h.frameWhen(`s.graze.pulses > ${s.graze.pulses} && !s.flashing`, true, 3000).catch(() => null);
        if (pulsed) {
          seen.pulseShot = true;
          h.log.steps.push({ action: 'paused on a Static Skin pulse', pulse: pulsed.s.graze.lastPulse, player: pulsed.s.player });
          await h.shot('static-pulse');
          await h.shot('static-pulse-closeup', around(pulsed.s.player));
          await h.game('resume');
        }
      }
      if (!seen.sparkShot && s.graze.sparks.length >= SPARK_SPLIT + 1) {
        // Sparks launch under the ship, so the shot waits until a whole fan has flown clear of it.
        const clear = `s.graze.sparks.length >= ${SPARK_SPLIT + 1} && s.graze.sparks.every((p) => Math.hypot(p.x - s.player.x, p.y - s.player.y) > 60)`;
        const flying = await h.frameWhen(clear, true, 1500).catch(() => null);
        if (flying) {
          seen.sparkShot = true;
          h.log.steps.push({ action: 'paused with a fan of sparks clear of the ship', sparks: flying.s.graze.sparks, player: flying.s.player });
          await h.shot('sparks-in-flight');
          await h.shot('sparks-in-flight-closeup', around(flying.s.player));
          await h.game('resume');
        }
      }
      if (!seen.shieldShot && s.shieldMs > GRAZE.phaseShieldMs - 300 && s.graze.streak > 0 && s.graze.streak % PHASE_EVERY === 0) {
        seen.shieldShot = true;
        await pausedShot('phase-shield', around(s.player));
      }
      if (weave === 'ArrowRight' ? s.player.x > Math.min(s.boss.x + 110, 430) : s.player.x < Math.max(s.boss.x - 110, 50)) weave = weave === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
      const danger = !seen.shieldShot && threat(s, shots, prev);
      const away = danger && (danger.side > 0 ? 'ArrowLeft' : 'ArrowRight');
      await hold(away && (away === 'ArrowLeft' ? s.player.x > 40 : s.player.x < 440) ? away : weave);
      prev = { ms: s.clock.fightMs, at: new Map(shots.map((b) => [b.id, b])) };
      await sleep(15);
      const next = await snap();
      if (next.s.tally.hits > s.tally.hits && s.graze.streak > 0) seen.streakHit = true;
      ({ s, shots } = next);
    }
    await hold(null);
    const frames = await h.page.evaluate(() => {
      window.__grazeRec.on = false;
      return window.__grazeRec.frames;
    });
    const pairs = frames.slice(1).map((b, i) => ({ a: frames[i], b })).filter(({ a, b }) => b.ms > a.ms);
    const grazed = pairs.filter(({ a, b }) => b.grazes > a.grazes);
    h.log.steps.push({ action: 'weave under the boss with real arrow keys', from: summarize(first), to: summarize(s), frames: frames.length, grazes: s.tally.grazes - first.tally.grazes, hits: s.tally.hits - first.tally.hits });
    h.check('weaving under the boss grazes bullets', grazed.length >= 10, { grazeFrames: grazed.length });
    h.check('TRANS-AM stays charging, so every slow and fire rate change below is the graze branch', frames.every((f) => f.transAm === 'charging'), { kinds: [...new Set(frames.map((f) => f.transAm))] });

    const launches = grazed.filter(({ a, b }) => b.sparks >= a.sparks + SPARK_SPLIT + 1);
    const landed = pairs.filter(({ a, b }) => b.spark > a.spark);
    h.check(`a counted graze launches ${SPARK_SPLIT + 1} sparks (Close Call plus Spark Split ${SPARK_SPLIT})`, launches.length >= grazed.length * 0.8, { grazeFrames: grazed.length, launches: launches.length });
    h.check('sparks damage the boss: tally.dealt.spark rises after the first graze', landed.length > 0 && landed[0].b.ms > grazed[0].a.ms && frames[0].spark === 0, {
      firstGrazeMs: grazed[0].b.ms,
      firstSparkHitMs: landed[0]?.b.ms,
      dealt: frames.at(-1).spark,
    });

    const ring = core + TA.grazePadPx + base.grazeHaloPx;
    const pulsePairs = pairs.filter(({ a, b }) => b.pulses > a.pulses);
    const pulsesDue = (a, b) => Math.floor(b.counted / PULSE_EVERY) - Math.floor(a.counted / PULSE_EVERY);
    h.check(`Static Skin 3 pulses on every ${PULSE_EVERY}th counted graze and never otherwise`, pulsePairs.length >= 2 && pairs.every(({ a, b }) => b.pulses - a.pulses === pulsesDue(a, b)), {
      pulses: frames.at(-1).pulses,
      counted: frames.at(-1).counted,
      off: pairs.filter(({ a, b }) => b.pulses - a.pulses !== pulsesDue(a, b)).slice(0, 3).map(({ a, b }) => ({ counted: [a.counted, b.counted], pulses: [a.pulses, b.pulses] })),
    });
    // A bullet and the ship each move a few px in a frame, so the frame before is judged with this much slack.
    const SLACK = 12;
    const pulses = pulsePairs.filter(({ a, b }) => b.pulses === a.pulses + 1).map(({ a, b }) => {
      const erased = new Set(b.pulse.erased.map((e) => e.id));
      const later = frames.filter((f) => f.ms >= b.ms);
      const near = a.shots.filter(([, x, y]) => Math.hypot(x - a.player.x, y - a.player.y) <= GRAZE.staticPulsePx - SLACK);
      const far = a.shots.filter(([, x, y]) => Math.hypot(x - a.player.x, y - a.player.y) > GRAZE.staticPulsePx + SLACK && y > 0 && y < 640);
      return {
        ms: b.ms,
        erased: erased.size,
        withinRadius: b.pulse.erased.every((e) => Math.hypot(e.x - b.pulse.x, e.y - b.pulse.y) <= GRAZE.staticPulsePx + 1e-6),
        erasedGone: [...erased].every((id) => a.shots.some(([sid]) => sid === id) && later.every((f) => !f.shots.some(([sid]) => sid === id))),
        nearMissed: near.filter(([id]) => !erased.has(id) && b.shots.some(([sid]) => sid === id)).length,
        far: far.length,
        farKept: far.filter(([id]) => !erased.has(id) && b.shots.some(([sid]) => sid === id)).length,
      };
    });
    h.check(`each pulse erases every enemy bullet within ${GRAZE.staticPulsePx} px of the ship (their ids leave shots() for good) and leaves the bullets beyond it`, pulses.length >= 2 && pulses.every((p) => p.erased >= 1 && p.withinRadius && p.erasedGone && p.nearMissed === 0 && p.farKept === p.far) && pulses.some((p) => p.far > 0), { pulses });

    // A counted bullet sat inside the ring a frame before, so past the base ring plus a bullet radius and a frame of
    // travel only the wider ring could have counted it.
    const grazedAt = grazed.flatMap(({ a, b }) => {
      const before = a.shots.find(([id]) => id === b.grazedId);
      return before ? [Math.round(Math.hypot(before[1] - a.player.x, before[2] - a.player.y))] : [];
    });
    const outside = grazedAt.filter((d) => d > core + TA.grazePadPx + SLACK);
    h.check('Wide Halo 3 counts grazes outside the base ring', grazedAt.length >= grazed.length * 0.8 && grazedAt.every((d) => d <= ring + 2 * SLACK) && outside.length >= grazedAt.length / 2, { baseRing: core + TA.grazePadPx, ring, distances: grazedAt });

    const shields = pairs.filter(({ a, b }) => b.streak > a.streak && b.streak % PHASE_EVERY === 0 && b.shieldMs > a.shieldMs && b.shieldMs >= GRAZE.phaseShieldMs - 50);
    const unshielded = pairs.filter(({ a, b }) => b.shieldMs > a.shieldMs && !(b.streak > a.streak && b.streak % PHASE_EVERY === 0));
    h.check(`Phase Skin 2 raises the shield on the ${PHASE_EVERY}th graze in a row without a hit`, shields.length >= 1, { at: shields.map(({ a, b }) => ({ streak: [a.streak, b.streak], shieldMs: [a.shieldMs, b.shieldMs] })), maxStreak: Math.max(...frames.map((f) => f.streak)) });
    h.check('the shield never rises any other way', unshielded.length === 0, { unshielded: unshielded.slice(0, 3).map(({ a, b }) => ({ streak: [a.streak, b.streak], shieldMs: [a.shieldMs, b.shieldMs] })) });
    const broken = pairs.filter(({ a, b }) => b.hits > a.hits && a.streak > 0);
    h.check('a landed hit breaks the streak back to the grazes after it in that frame', broken.length > 0 && broken.every(({ a, b }) => b.streak <= b.grazes - a.grazes), {
      broken: broken.map(({ a, b }) => ({ streak: [a.streak, b.streak], hits: [a.hits, b.hits], grazes: [a.grazes, b.grazes] })),
    });

    const rushed = frames.filter((f) => f.rushMs > 0);
    const calm = frames.filter((f) => f.rushMs === 0);
    const close = (x, y) => Math.abs(x - y) < 1e-9;
    h.check('Adrenaline 3 fires at 65% of the interval while it runs after a graze, and at the base interval otherwise', rushed.length > 0 && rushed.every((f) => close(f.fireMs, base.fireIntervalMs * base.adrenalineIntervalScale)) && calm.every((f) => close(f.fireMs, base.fireIntervalMs)), {
      base: base.fireIntervalMs,
      rushedFireMs: [...new Set(rushed.map((f) => f.fireMs))],
      calmFireMs: [...new Set(calm.map((f) => f.fireMs))],
    });

    // A frame moved slowed when the slow outlasted the whole step, and at full speed when no slow ran at either end.
    const speeds = new Map();
    for (const { a, b } of pairs) {
      const dt = b.ms - a.ms;
      const kind = a.slowMs > dt + 1 ? 'slow' : a.slowMs === 0 && b.slowMs === 0 ? 'full' : null;
      if (!kind) continue;
      for (const [id, x, y] of b.shots) {
        const prev = a.shots.find(([pid]) => pid === id);
        if (!prev) continue;
        const v = Math.hypot(x - prev[1], y - prev[2]) / dt;
        const entry = speeds.get(id) ?? { slow: [], full: [] };
        entry[kind].push(v);
        speeds.set(id, entry);
      }
    }
    const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
    const ratios = [...speeds.entries()].filter(([, e]) => e.slow.length >= 3 && e.full.length >= 3).map(([id, e]) => ({ id, ratio: median(e.slow) / median(e.full), full: median(e.full) * 1000 }));
    const mid = ratios.length && median(ratios.map((r) => r.ratio));
    h.check(`Bullet Time 2 slows a bullet in flight to ${GRAZE.bulletTimeScale * 100}% of its speed after a graze`, ratios.length >= 5 && Math.abs(mid - GRAZE.bulletTimeScale) < 0.03, { bullets: ratios.length, medianRatio: mid, sample: ratios.slice(0, 6) });

    // Crowd: in a wave a spark goes on from its first foe through more of the formation, and one that kills a foe
    // leaps on from it as a fresh spark that only small foes can take.
    const crowd = await h.core('perks.deriveStats({ closeCall: 1 })');
    await h.startAt(6, { closeCall: 1 });
    await h.game('god', true);
    await h.waitFor('stage 6 fighting', (x) => x.life === 'fighting', 8000);
    await h.recordRounds('graze', 'sparks');
    const pierced = await h.frameWhen('s.graze.sparks.some((p) => p.hits >= 2)', true, 30000);
    h.log.steps.push({ action: 'paused with a spark that has gone through two foes', sparks: pierced.s.graze.sparks });
    await h.shot('spark-through-formation');
    await h.shot('spark-through-formation-closeup', roundCloseup(pierced.s.graze.sparks.find((p) => p.hits >= 2)));
    await h.game('resume');
    await h.frameWhen('s.graze.sparks.some((p) => p.crowdOnly && p.hits === 0)', false, 30000);
    const sparks = await h.recordRounds(null);
    h.check(`in a wave a spark goes on through up to ${crowd.grazeSparkPierce} more foes after its first`, sparks.some((p) => p.hits >= 2) && sparks.every((p) => p.hits <= 1 + crowd.grazeSparkPierce), {
      most: Math.max(...sparks.map((p) => p.hits)),
      samples: sparks.length,
    });
    h.check('a spark that kills a foe leaps on from it as a fresh spark for small foes only', sparks.some((p) => p.crowdOnly && p.hits === 0), { leaps: sparks.filter((p) => p.crowdOnly && p.hits === 0).length });
  },

  async summon(h) {
    const FAMILIAR = { w: 12, h: 15, radius: 7 };
    const SHIP = { w: 42, h: 35 };
    const DRONE = { w: 11, h: 12, dx: 36, dy: 8 };
    const none = await h.startAt(2);
    const SUMMON = await h.core('perks.SUMMON');
    const bulletRadius = await h.page.evaluate(() => import('/src/game/bullets.ts').then((m) => Math.max(...Object.values(m.BULLETS).map((b) => b.radius))));
    const stats = (perks) => h.core(`perks.deriveStats(${JSON.stringify(perks)})`);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const overlaps = (a, aw, ah, b, bw, bh) => Math.abs(a.x - b.x) < (aw + bw) / 2 && Math.abs(a.y - b.y) < (ah + bh) / 2;
    const around = (p, w = 200, hgt = 220) => ({ x: Math.min(Math.max(0, p.x - w / 2), 480 - w), y: Math.max(0, p.y - hgt + 60), w, h: hgt });
    const pausedShot = async (name, region) => {
      await h.game('pause');
      await h.shot(name);
      if (region) await h.shot(`${name}-closeup`, region);
      await h.game('resume');
    };

    // Every frame's summon state, read in one animation frame; `shots` adds the live enemy bullets.
    const record = (shots = false) =>
      h.page.evaluate((shots) => {
        const g = window.__game;
        const rec = (window.__summonRec = { on: true, frames: [] });
        const tick = () => {
          if (!rec.on) return;
          const s = g.state();
          if (s?.summons && s.life === 'fighting')
            rec.frames.push({
              ms: s.clock.fightMs,
              familiars: s.summons.familiars,
              wisps: s.summons.wisps.length,
              blockedId: s.summons.lastBlockedId,
              haunted: s.summons.haunted,
              spiritMs: s.summons.spiritMs,
              dealt: { ...s.tally.dealt },
              hits: s.tally.hits,
              contacts: s.tally.contacts,
              hp: s.run.hp,
              gauge: s.run.transAmGauge,
              streak: s.graze.streak,
              invulnMs: s.invulnMs,
              player: s.player,
              boss: s.boss && { x: s.boss.x, y: s.boss.y, hpRatio: s.boss.hpRatio, stance: s.boss.stance },
              ...(shots && { shots: g.shots().map((b) => [b.id, b.x, b.y]) }),
            });
          requestAnimationFrame(tick);
        };
        tick();
      }, shots);
    const stopRecord = async () => {
      const frames = await h.page.evaluate(() => {
        window.__summonRec.on = false;
        return window.__summonRec.frames;
      });
      return { frames, pairs: frames.slice(1).map((b, i) => ({ a: frames[i], b })).filter(({ a, b }) => b.ms > a.ms) };
    };
    // Keeps the ship under the boss, and her HP above her transformation, until pred holds.
    const underBoss = async (label, pred, timeoutMs) => {
      const end = Date.now() + timeoutMs;
      let s = await h.state();
      while (!pred(s) && Date.now() < end) {
        if (s.boss?.hpRatio < 0.7) await h.game('bossHp', 1);
        await h.steer(s);
        await sleep(30);
        s = await h.state();
      }
      await h.steer(null);
      if (!pred(s)) throw new Error(`timed out waiting for ${label}; last summons ${JSON.stringify(s.summons)}`);
      return s;
    };
    const bossFight = async (perks, god = true) => {
      await h.startAt(5, perks);
      if (god) await h.game('god', true);
      return h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000);
    };

    // Shop: Pack Call bought with real keys raises the next stage's familiars from one to two.
    h.check('a ship without summon perks has no familiars', none.summons.familiars.length === 0 && none.summons.wisps.length === 0, { summons: none.summons });
    const one = await h.startAt(4, { familiar: 1 }, 99999);
    h.check('Spirit Familiar brings one familiar', one.summons.familiars.length === 1, { familiars: one.summons.familiars });
    await h.game('kill');
    let shop = await h.waitFor('the shop after stage 4', (x) => x.scenes.includes('Shop') && x.run.stage === 4);
    const packSlot = (x) => x.cards.findIndex((o) => o?.kind === 'perk' && o.id === 'packCall');
    for (let i = 0; i < 80 && packSlot(shop) < 0; i++) shop = await h.step('press R for a Pack Call card', () => h.page.keyboard.press('r'));
    const slot = packSlot(shop);
    h.check('with Spirit Familiar owned, the shop offers Pack Call', slot >= 0, { cards: shop.cards, refreshes: shop.run.phase.shop.refreshes });
    await sleep(800);
    await h.shot('shop-pack-call-card');
    const bought = await h.step(`press ${slot + 1} to buy Pack Call`, () => h.page.keyboard.press(String(slot + 1)));
    h.check('Pack Call is bought', bought.run.perks.packCall === 1, { perks: bought.run.perks });
    await h.step('press Enter to fly stage 5', () => h.page.keyboard.press('Enter'));
    const two = await h.waitFor('stage 5 fighting', (x) => x.scenes.includes('Stage') && x.run.stage === 5 && x.life === 'fighting', 8000);
    h.check('after buying Pack Call 1 the next stage flies two familiars', two.summons.familiars.length === 2, { familiars: two.summons.familiars });

    // Pack of three beside Option Drones: the ship holds still while the familiars shoot.
    const pack = { familiar: 1, packCall: 2, optionDrones: 2 };
    const packStats = await stats(pack);
    const three = await bossFight(pack);
    h.check('Pack Call 2 brings three familiars', three.summons.familiars.length === 3 && packStats.familiars === SUMMON.maxFamiliars, { familiars: three.summons.familiars });
    await record();
    await sleep(500);
    const flying = await h.frameWhen('!s.flashing && !s.boss?.hitFlash && s.summons.wisps.length >= 2 && s.summons.wisps.every((w) => Math.hypot(w.x - s.player.x, w.y - s.player.y) > 90)', true, 6000);
    h.log.steps.push({ action: 'paused with wisps in flight', summons: flying.s.summons, player: flying.s.player });
    await h.shot('familiars-and-wisps');
    await h.shot('familiars-closeup', { x: flying.s.player.x - 70, y: flying.s.player.y - 100, w: 140, h: 130 });
    await h.game('resume');
    await sleep(3000);
    const packRun = await stopRecord();
    const settled = packRun.frames.filter((f) => f.ms - packRun.frames[0].ms > 300);
    const clashes = settled.flatMap((f) =>
      f.familiars.flatMap((m) => {
        const drones = [-1, 1].map((side) => ({ x: f.player.x + side * DRONE.dx, y: f.player.y + DRONE.dy }));
        const hits = [overlaps(m, FAMILIAR.w, FAMILIAR.h, f.player, SHIP.w, SHIP.h) && 'ship', ...drones.map((d, i) => overlaps(m, FAMILIAR.w, FAMILIAR.h, d, DRONE.w, DRONE.h) && `drone${i}`)].filter(Boolean);
        return hits.length ? [{ ms: f.ms, familiar: m, player: f.player, hits }] : [];
      }),
    );
    h.check('the familiars float clear of the ship and both Option Drone slots', settled.length > 30 && clashes.length === 0, { frames: settled.length, clashes: clashes.slice(0, 5) });
    const spawned = packRun.pairs.filter(({ a, b }) => b.wisps > a.wisps).length;
    const wispDealt = (packRun.frames.at(-1).dealt.wisp ?? 0) - (packRun.frames[0].dealt.wisp ?? 0);
    h.check('the familiars fire wisps and the wisps damage the boss (tally.dealt.wisp rises)', spawned >= 3 && wispDealt >= packStats.wispDamage * 2, { spawned, wispDealt, wispDamage: packStats.wispDamage });

    // Guardian: a ready familiar stands between the still ship and the boss, destroys an enemy bullet that touches it,
    // then rests dimmed and keeps shooting.
    const GUARD_WINDOW_MS = 30000;
    const guard = { familiar: 1, guardian: 1 };
    const guardStats = await stats(guard);
    await h.startAt(5, guard);
    await h.game('god', true);
    await record(true);
    const fightFrom = (await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000)).clock.fightMs;
    const standing = await h.frameWhen(`!s.flashing && s.clock.fightMs > ${fightFrom + 1000} && s.summons.familiars[0].state === 'ready'`, true, 8000);
    h.log.steps.push({ action: 'paused with the ready familiar on guard', familiars: standing.s.summons.familiars, player: standing.s.player, boss: standing.s.boss && { x: standing.s.boss.x, y: standing.s.boss.y } });
    await h.shot('guardian-on-guard');
    await h.shot('guardian-on-guard-closeup', around(standing.s.player, 140, 150));
    await h.game('resume');
    let restingShot = false;
    for (let s = await h.state(); s.clock.fightMs < fightFrom + GUARD_WINDOW_MS; s = await h.state()) {
      if (s.boss?.hpRatio < 0.7) await h.game('bossHp', 1);
      if (!restingShot && s.summons.lastBlockedId !== null) {
        const resting = await h.frameWhen("!s.flashing && s.summons.familiars[0].state === 'resting'", true, guardStats.guardianRestMs);
        h.log.steps.push({ action: 'paused while the familiar rests', familiars: resting.s.summons.familiars, blockedId: resting.s.summons.lastBlockedId });
        await h.shot('guardian-resting');
        await h.shot('guardian-resting-closeup', around(resting.s.player, 140, 150));
        await h.game('resume');
        restingShot = true;
      }
      await sleep(50);
    }
    const guardRun = await stopRecord();
    const stillAt = guardRun.frames[0].player;
    h.check('the ship holds still under the boss for the whole Guardian window', guardRun.frames.every((f) => f.player.x === stillAt.x && f.player.y === stillAt.y), { player: stillAt });
    // A familiar whose rest runs out inside a frame step is ready, and can block, before that step ends.
    const readyDuring = (a, b) => a.familiars[0].state === 'ready' || (a.familiars[0].state === 'resting' && a.familiars[0].msLeft <= b.ms - a.ms);
    const blocks = guardRun.pairs
      .filter(({ a, b }) => b.blockedId !== null && b.blockedId !== a.blockedId)
      .map(({ a, b }) => {
        const before = a.shots.find(([id]) => id === b.blockedId);
        const reach = before && Math.min(...a.familiars.map((m) => Math.hypot(before[1] - m.x, before[2] - m.y)));
        const gone = guardRun.frames.filter((f) => f.ms >= b.ms).every((f) => !f.shots.some(([id]) => id === b.blockedId));
        return { ms: b.ms, id: b.blockedId, reach: reach && Math.round(reach), gone, wasReady: readyDuring(a, b), now: b.familiars[0] };
      });
    const proved = blocks.filter((x) => x.gone && x.wasReady && x.reach !== undefined && x.reach <= FAMILIAR.radius + bulletRadius + 12 && x.now.state === 'resting' && x.now.msLeft > guardStats.guardianRestMs - 60);
    h.check('Guardian: a ready familiar touched by an enemy bullet erases it (its id leaves shots()) and starts resting', proved.length >= 1 && proved.length === blocks.length, { blocks });
    const fought = guardRun.frames.find((f) => f.boss?.stance === 'fighting').ms;
    const inWindow = blocks.filter((x) => x.ms <= fought + GUARD_WINDOW_MS);
    h.check(`with the ship still, the first block lands within 8 s of the boss starting to fight, and at least 3 land in ${GUARD_WINDOW_MS / 1000} s`, inWindow.length >= 3 && inWindow[0].ms - fought <= 8000, {
      fought,
      blocksAtS: inWindow.map((x) => +((x.ms - fought) / 1000).toFixed(2)),
    });
    const clashesIn = (frames) => frames.filter((f) => f.ms - frames[0].ms > 300).flatMap((f) =>
      f.familiars.flatMap((m) => {
        const drones = [-1, 1].map((side) => ({ x: f.player.x + side * DRONE.dx, y: f.player.y + DRONE.dy }));
        const hits = [overlaps(m, FAMILIAR.w, FAMILIAR.h, f.player, SHIP.w, SHIP.h) && 'ship', ...drones.map((d, i) => overlaps(m, FAMILIAR.w, FAMILIAR.h, d, DRONE.w, DRONE.h) && `drone${i}`)].filter(Boolean);
        return hits.length ? [{ ms: f.ms, familiar: m, player: f.player, hits }] : [];
      }),
    );
    const guardClashes = clashesIn(guardRun.frames);
    h.check('on guard and back, the familiar stays clear of the ship and both Option Drone slots', guardClashes.length === 0, { clashes: guardClashes.slice(0, 5) });

    // Off to her side the boss's aimed needles come in at a slant, past where the familiar hovers without Guardian.
    const PARK_X = 60;
    await h.startAt(5, guard);
    await h.game('god', true);
    await record(true);
    await h.page.keyboard.down('ArrowLeft');
    await h.waitFor(`the ship at x ${PARK_X}`, (x) => x.player.x <= PARK_X, 5000);
    await h.page.keyboard.up('ArrowLeft');
    const parkedFrom = (await h.waitFor('the boss fighting', (x) => x.boss?.stance === 'fighting', 10000)).clock.fightMs;
    for (let s = await h.state(); s.clock.fightMs < parkedFrom + GUARD_WINDOW_MS + 500; s = await h.state()) {
      if (s.boss?.hpRatio < 0.7) await h.game('bossHp', 1);
      await sleep(50);
    }
    const parkRun = await stopRecord();
    const parkFought = parkRun.frames.find((f) => f.boss?.stance === 'fighting').ms;
    const parked = parkRun.frames.filter((f) => f.ms >= parkFought);
    const parkBlocks = parkRun.pairs.filter(({ a, b }) => b.blockedId !== null && b.blockedId !== a.blockedId && b.ms >= parkFought && b.ms <= parkFought + GUARD_WINDOW_MS).map(({ b }) => +((b.ms - parkFought) / 1000).toFixed(2));
    const parkClashes = clashesIn(parkRun.frames);
    h.check(`parked still at x ${PARK_X}, off to the boss's side, the first block also lands within 8 s and at least 3 land in ${GUARD_WINDOW_MS / 1000} s, clear of the ship`, parked.every((f) => f.player.x === parked[0].player.x) && parked[0].player.x <= PARK_X + 6 && parkBlocks.length >= 3 && parkBlocks[0] <= 8 && parkClashes.length === 0, {
      player: parked[0].player,
      blocksAtS: parkBlocks,
      clashes: parkClashes.slice(0, 3),
    });
    // A rest starts when the familiar turns resting or its rest jumps back up: it came ready and blocked within one step.
    const rests = [];
    for (const [i, f] of guardRun.frames.entries()) {
      const prev = guardRun.frames[i - 1];
      const [was, now] = [prev?.familiars[0], f.familiars[0]];
      if (prev && now.state === 'resting' && (was.state !== 'resting' || now.msLeft > was.msLeft)) rests.push({ from: f.ms });
      if (prev && was.state === 'resting' && now.state === 'ready' && rests.at(-1)) rests.at(-1).to = f.ms;
    }
    const whole = rests.filter((r) => r.to);
    const rest = guardStats.guardianRestMs;
    h.check(`the familiar rests ${rest} ms, then is ready to block again`, whole.length >= 1 && whole.every((r) => Math.abs(r.to - r.from - rest) < 60) && rests.every((r, i) => i === 0 || r.from - rests[i - 1].from > rest - 60), { rests });
    const restingShots = guardRun.pairs.filter(({ a, b }) => a.familiars[0].state === 'resting' && b.familiars[0].state === 'resting' && b.wisps > a.wisps).length;
    h.check('a resting familiar keeps firing wisps', restingShots >= 1, { restingShots });
    h.check('a resting familiar does not block', guardRun.pairs.every(({ a, b }) => readyDuring(a, b) || b.blockedId === a.blockedId), {});

    // Sacrifice, with god mode off: a real boss bullet that reaches the ship takes the familiar instead.
    const sac = { familiar: 1, sacrifice: 2 };
    const sacStats = await stats(sac);
    const sacStart = await bossFight(sac, false);
    await record();
    const gone = h.frameWhen("s.summons.familiars[0].state === 'gone'", true, 40000);
    let caught = null;
    gone.then((x) => (caught = x)).catch(() => {});
    const giveUp = Date.now() + 40000;
    while (!caught && Date.now() < giveUp) {
      const s = await h.state();
      if (s.boss?.hpRatio < 0.7) await h.game('bossHp', 1);
      if (!caught) await h.steer(s);
      await sleep(30);
    }
    await h.steer(null);
    await gone;
    await h.game('god', true);
    h.log.steps.push({ action: 'paused on the frame the familiar took the hit', hp: caught.s.run.hp, tally: caught.s.tally, summons: caught.s.summons, invulnMs: caught.s.invulnMs });
    await h.shot('sacrifice');
    await h.shot('sacrifice-closeup', around(caught.s.player, 160, 160));
    await h.game('resume');
    await h.waitFor('the familiar back', (x) => x.summons.familiars[0]?.state === 'ready', sacStats.sacrificeMs + 3000);
    await sleep(300);
    const back = await h.waitFor('no camera flash', (x) => !x.flashing);
    await pausedShot('sacrifice-returned', around(back.player, 160, 160));
    const sacRun = await stopRecord();
    const took = sacRun.pairs.find(({ a, b }) => a.familiars[0].state === 'ready' && b.familiars[0].state === 'gone');
    h.check('the ship flew at full HP with no landed hit until the familiar took one', took && sacRun.frames.filter((f) => f.ms <= took.a.ms).every((f) => f.hp === sacStart.run.hp && f.hits === sacStart.tally.hits), { maxHp: sacStart.run.hp });
    h.check('Sacrifice: on that frame a bullet touched the ship (contacts rise) but run.hp and tally.hits hold', took && took.b.contacts > took.a.contacts && took.b.hp === took.a.hp && took.b.hits === took.a.hits, { a: took && { hp: took.a.hp, hits: took.a.hits, contacts: took.a.contacts }, b: took && { hp: took.b.hp, hits: took.b.hits, contacts: took.b.contacts } });
    h.check('the ship still gets its full hit i-frames, and keeps its TRANS-AM gauge and graze streak', took && took.b.invulnMs >= 1300 - 1 && took.b.gauge >= took.a.gauge && took.b.streak >= took.a.streak, { invulnMs: took?.b.invulnMs, gauge: took && [took.a.gauge, took.b.gauge], streak: took && [took.a.streak, took.b.streak] });
    const returned = sacRun.pairs.find(({ a, b }) => took && b.ms > took.b.ms && a.familiars[0].state === 'gone' && b.familiars[0].state === 'ready');
    h.check(`the familiar returns ${sacStats.sacrificeMs} ms later`, returned && Math.abs(returned.b.ms - took.b.ms - sacStats.sacrificeMs) < 60, { goneMs: returned && returned.b.ms - took.b.ms });
    const goneFrames = sacRun.pairs.filter(({ a, b }) => a.familiars[0].state === 'gone' && b.familiars[0].state === 'gone');
    h.check('a gone familiar fires no wisps', goneFrames.length > 100 && goneFrames.every(({ a, b }) => b.wisps <= a.wisps), { frames: goneFrames.length });

    // Haunt: per-frame gun damage on the boss, without Haunt and then with Haunt 3, from the same plain gun.
    const gunDeltas = async (perks) => {
      await bossFight(perks);
      await record();
      await underBoss('6 s under the boss', () => false, 6000).catch(() => {});
      const run = await stopRecord();
      return run.pairs.map(({ a, b }) => ({ d: (b.dealt.bullet ?? 0) - (a.dealt.bullet ?? 0), wisp: (b.dealt.wisp ?? 0) - (a.dealt.wisp ?? 0), a, b })).filter((x) => x.d > 0 || x.wisp > 0);
    };
    const plain = await stats({ familiar: 1 });
    const hauntStats = await stats({ familiar: 1, haunt: 3 });
    const control = (await gunDeltas({ familiar: 1 })).filter((x) => x.d > 0);
    h.check(`without Haunt every gun hit on the boss deals ${plain.bulletDamage}`, control.length >= 5 && control.every((x) => x.d % plain.bulletDamage === 0) && control.some((x) => x.d === plain.bulletDamage), { deltas: control.map((x) => x.d) });
    const treated = await gunDeltas({ familiar: 1, haunt: 3 });
    const isHaunted = (f, dt) => f.haunted.some((x) => x.msLeft > dt);
    const raised = plain.bulletDamage * (1 + hauntStats.hauntBonus);
    const hauntedHits = treated.filter((x) => x.d > 0 && isHaunted(x.a, x.b.ms - x.a.ms) && x.b.haunted.length > 0);
    const freshHits = treated.filter((x) => x.d > 0 && x.a.haunted.length === 0 && x.b.haunted.length === 0);
    h.check(`Haunt 3: while the boss is haunted every gun hit deals ${raised}, and ${plain.bulletDamage} before the first wisp lands`, hauntedHits.length >= 5 && hauntedHits.every((x) => x.d % raised === 0) && hauntedHits.some((x) => x.d === raised) && freshHits.every((x) => x.d % plain.bulletDamage === 0), {
      haunted: hauntedHits.map((x) => x.d),
      fresh: freshHits.map((x) => x.d),
    });
    const marks = treated.filter((x) => x.wisp > 0);
    h.check(`each wisp hit (re)starts the ${SUMMON.hauntMs} ms haunt on the boss`, marks.length >= 3 && marks.every((x) => x.b.haunted.some((m) => m.msLeft > SUMMON.hauntMs - 40)), { marks: marks.map((x) => x.b.haunted) });
    const tinted = await h.frameWhen('!s.flashing && s.summons.haunted.length > 0 && !s.boss.hitFlash', true, 3000);
    h.log.steps.push({ action: 'paused on the haunted boss', haunted: tinted.s.summons.haunted });
    await h.shot('haunted-boss');
    await h.shot('haunted-boss-closeup', { x: Math.max(0, tinted.s.boss.x - 90), y: Math.max(0, tinted.s.boss.y - 90), w: 180, h: 180 });
    await h.game('resume');

    // Great Spirit: every familiar dives at the boss, strikes and flies back.
    const great = { familiar: 1, packCall: 2, greatSpirit: 2 };
    const greatStats = await stats(great);
    const greatStart = await bossFight(great);
    await record();
    const diving = await h.frameWhen(
      "!s.flashing && s.summons.familiars.length === 3 && s.summons.familiars.every((f) => f.state === 'diving' && Math.hypot(f.x - s.player.x, f.y - s.player.y) > 140)",
      true,
      greatStats.greatSpiritEveryMs + 4000,
    );
    h.log.steps.push({ action: 'paused mid-dive', familiars: diving.s.summons.familiars, boss: diving.s.boss });
    await h.shot('great-spirit-dive');
    await h.game('resume');
    await h.waitFor('every familiar back', (x) => x.summons.familiars.every((f) => f.state === 'ready'), 4000);
    await sleep(500);
    const greatRun = await stopRecord();
    const launch = greatRun.pairs.find(({ a, b }) => a.familiars.every((f) => f.state === 'ready') && b.familiars.every((f) => f.state === 'diving'));
    h.check(`Great Spirit 2 sends all three familiars diving together ${greatStats.greatSpiritEveryMs} ms into the fight`, launch && launch.b.ms <= greatStats.greatSpiritEveryMs + 200 && launch.b.spiritMs > greatStats.greatSpiritEveryMs - 60, { at: launch?.b.ms, spiritMs: launch?.b.spiritMs, fightStart: greatStart.clock.fightMs });
    const reach = [0, 1, 2].map((i) => {
      const dive = greatRun.frames.filter((f) => launch && f.ms >= launch.b.ms && f.familiars[i].state === 'diving');
      return { nearestToBoss: Math.round(Math.min(...dive.map((f) => dist(f.familiars[i], f.boss)))), farthestFromShip: Math.round(Math.max(...dive.map((f) => dist(f.familiars[i], f.player)))) };
    });
    h.check('each familiar reaches the boss, far from the ship', reach.every((r) => r.nearestToBoss <= 12 && r.farthestFromShip >= 200), { reach });
    const spirit = (greatRun.frames.at(-1).dealt.spirit ?? 0) - (greatRun.frames[0].dealt.spirit ?? 0);
    h.check(`each arrival deals ${SUMMON.greatSpiritDamage} (tally.dealt.spirit)`, spirit === SUMMON.greatSpiritDamage * 3, { spirit });
    const end = greatRun.frames.at(-1);
    h.check('every familiar flies back to its place above the ship', end.familiars.every((f) => f.state === 'ready' && dist(f, { x: end.player.x, y: end.player.y - 50 }) < 20), { familiars: end.familiars, player: end.player });

    // Crowd: in a wave a wisp goes on from its first foe through more of the formation.
    const crowd = await stats({ familiar: 1 });
    await h.startAt(6, { familiar: 1 });
    await h.game('god', true);
    await h.waitFor('stage 6 fighting', (x) => x.life === 'fighting', 8000);
    await h.recordRounds('summons', 'wisps');
    const through = await h.frameWhen('s.summons.wisps.some((w) => w.hits >= 2)', true, 30000);
    h.log.steps.push({ action: 'paused with a wisp that has gone through two foes', wisps: through.s.summons.wisps });
    await h.shot('wisp-through-formation');
    await h.shot('wisp-through-formation-closeup', roundCloseup(through.s.summons.wisps.find((w) => w.hits >= 2)));
    await h.game('resume');
    const wisps = await h.recordRounds(null);
    h.check(`Spirit Familiar's wisps go on through up to ${crowd.wispPierce} more foes after their first`, wisps.some((w) => w.hits >= 2) && wisps.every((w) => w.hits <= 1 + crowd.wispPierce), {
      most: Math.max(...wisps.map((w) => w.hits)),
      samples: wisps.length,
    });
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

  async 'boss-moves'(h) {
    await h.openTitle();
    const { motions, bosses, gaugeMax, rest, art } = await h.page.evaluate(async () => {
      const [stages, motion, transAm, characters] = await Promise.all([
        import('/src/core/stages.ts'),
        import('/src/game/bossMotion.ts'),
        import('/src/core/transAm.ts'),
        import('/src/art/characters.ts'),
      ]);
      const motions = Object.fromEntries(Object.entries(motion.MOTIONS).map(([p, m]) => [p, { tier: m.tier, lead: motion.leadMs(p), tail: motion.tailMs(p) }]));
      return { motions, bosses: JSON.parse(JSON.stringify(stages.BOSSES)), gaugeMax: transAm.TRANS_AM.gaugeMax, rest: motion.REST, art: Object.keys(characters.CHARACTER_ART) };
    });
    const isRest = (pose) => JSON.stringify(pose) === JSON.stringify(rest);
    const beats = ({ tier, lead, tail }) =>
      tier === 'ultimate'
        ? [['charge', -Math.round(lead * 0.2)], ['release', 230], ['follow', Math.round(tail * 0.55)]]
        : [['windup', -40], ['peak', 55], ['release', tier === 'light' ? 170 : Math.round(tail * 0.45)]];
    const movesOf = (p) => `s.boss.motion.moves.find((m) => m.pattern === '${p}')`;
    const seen = new Set();
    for (const [stage, id] of [[5, 'crimsonSeraph'], [10, 'voidEmpress']]) {
      const def = bosses[id];
      await h.startAt(stage);
      await h.game('god', true);
      await h.waitFor(`${id} in place`, (s) => s.boss?.stance === 'fighting', 12000);
      await h.game('bossPattern', null);
      for (const form of [0, 1]) {
        if (form === 1) {
          await h.game('bossHp', def.transform.atHpRatio - 0.02);
          await h.waitFor(`${id} second form`, (s) => s.boss.form === 1 && s.boss.stance === 'fighting', 10000);
        }
        const castArt = `${def.forms[form].texture}Cast`;
        const wantArt = art.includes(castArt) ? castArt : null;
        for (const p of [...new Set(def.forms[form].phases.flatMap((ph) => ph.patterns))]) {
          const m = motions[p];
          await h.game('bossHp', form === 0 ? 0.9 : 0.6);
          await h.waitFor(`${id} holds still before ${p}`, (s) => s.boss.stance === 'fighting' && s.boss.motion.moves.length === 0, 8000);
          await h.game('bossPattern', p);
          for (const [beat, ms] of beats(m)) {
            const { s } = await h.frameWhen(`(${movesOf(p)})?.ms >= ${ms} && !s.flashing && !s.boss.hitFlash`, true, 8000);
            const mv = s.boss.motion.moves.find((x) => x.pattern === p);
            await h.shot(`${id}-form${form}-${m.tier}-${p}-${beat}`);
            h.check(`${def.forms[form].name}: ${p} (${m.tier}) ${beat} at ${Math.round(mv.ms)} ms is posed`, mv.tier === m.tier && !isRest(s.boss.motion.pose), { ms: mv.ms, pose: s.boss.motion.pose });
            if (m.tier === 'ultimate' && beat === 'charge')
              h.check(
                `${def.forms[form].name}: ${p} charges in her casting pose (${wantArt ?? 'no casting art yet'})`,
                s.boss.stance === 'casting' && s.boss.motion.pose.cast === 1 && s.boss.motion.art === wantArt,
                { stance: s.boss.stance, cast: s.boss.motion.pose.cast, art: s.boss.motion.art, wantArt },
              );
            await h.game('resume');
          }
          const done = await h.waitFor(`${p} settles`, (s) => s.boss.motion.moves.length === 0, m.tail + 4000);
          h.check(`${def.forms[form].name}: ${p} ends back at rest in her normal art`, isRest(done.boss.motion.pose) && done.boss.motion.art === null && done.boss.stance === 'fighting', {
            pose: done.boss.motion.pose,
            art: done.boss.motion.art,
          });
          seen.add(p);
        }
      }
    }
    h.check('every pattern was forced on the form that uses it', seen.size === Object.keys(motions).length, { seen: [...seen] });

    await h.game('bossHp', 0.6);
    await h.waitFor('Eclipse holds still', (s) => s.boss.stance === 'fighting' && s.boss.motion.moves.length === 0, 8000);
    await h.game('bossPattern', 'eclipseNova');
    await h.frameWhen(`(${movesOf('eclipseNova')})?.ms >= -450`, false, 8000);
    await h.game('transAmGauge', gaugeMax);
    await h.page.keyboard.press('Space');
    const a = await h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= 200`, false);
    const b = await h.frameWhen(`s.life === 'cutIn' && s.cutInMs >= 600`, true);
    await h.shot('cut-in-frozen-eclipseNova');
    await h.game('resume');
    h.check(
      'the cut-in freezes her motion mid-charge: same moves and pose while the cut-in runs',
      JSON.stringify(a.s.boss.motion) === JSON.stringify(b.s.boss.motion) && b.s.cutInMs > a.s.cutInMs && !isRest(b.s.boss.motion.pose) && a.s.boss.castMsLeft === b.s.boss.castMsLeft,
      { a: { cutInMs: a.s.cutInMs, motion: a.s.boss.motion, castMsLeft: a.s.boss.castMsLeft }, b: { cutInMs: b.s.cutInMs, motion: b.s.boss.motion, castMsLeft: b.s.boss.castMsLeft } },
    );
    const resumed = await h.frameWhen(`s.life === 'fighting' && (${movesOf('eclipseNova')})?.ms > ${b.s.boss.motion.moves.find((x) => x.pattern === 'eclipseNova').ms + 50}`, false);
    h.check('her motion carries on after the cut-in', resumed.s.life === 'fighting', { motion: resumed.s.boss.motion });
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
        await v.throughHangar({
          atHangar: async () => {
            await sleep(300);
            await fits(`${name} hangar`, v.page);
            await v.shot(`${name}-hangar`);
          },
        });
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
    await h.throughHangar();
    await sleep(1500);
    await fits('live-resized 1600x900 stage 1', h.page);
    await h.shot('live-1600x900-stage1');
  },

  async music(h) {
    const SONG = '**/music/void-empress.*';
    const warnings = [];
    h.page.on('console', (m) => m.type() === 'warning' && m.text().startsWith('music:') && warnings.push(m.text()));
    const served = [];
    const servedAt = [];
    const serveMissing = async (route) => {
      served.push(new URL(route.request().url()).pathname);
      servedAt.push(Date.now());
      await route.fulfill({ response: await route.fetch({ url: `${APP_URL}music/no-such-song.ogg` }) });
    };
    await h.page.route(SONG, serveMissing);
    const VOLUME = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => (await import('/src/audio/music.ts')).MUSIC_VOLUME);
    })();
    // Every frame's music from now until pred holds, read in the page so no frame between two evaluate calls is missed.
    const framesUntil = (pred, timeoutMs) =>
      h.page.evaluate(
        ([src, timeoutMs]) =>
          new Promise((resolve, reject) => {
            const test = new Function('s', `return (${src})`);
            const t0 = performance.now();
            const frames = [];
            const tick = () => {
              const s = window.__game.state();
              const { track, playing, ringing, jingles, fadingGain, trackGain, busGain } = s.music;
              frames.push({ ms: Math.round(performance.now() - t0), scenes: s.scenes, life: s.life ?? null, track, playing, ringing, jingles, fadingGain, trackGain, busGain });
              if (test(s)) return resolve(frames);
              if (performance.now() - t0 > timeoutMs) return reject(new Error(`timed out waiting for ${src}`));
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [pred, timeoutMs],
      );
    const DUCK_MS = 200;
    // From the frame the stage ends: the jingle is asked for at once, starts once, and rings over a silent stage track.
    const endsOnJingle = (name, frames, jingle, before) => {
      const ending = frames.filter((f) => f.life === 'ending' || f.life === 'leaving');
      const rung = frames.filter((f) => f.ringing === jingle);
      const firstRung = rung[0]?.ms ?? Infinity;
      const ducked = rung.filter((f) => f.ms >= firstRung + DUCK_MS);
      h.log.steps.push({ action: `${name}: frames from the end of the stage`, first: frames[0], firstRung: rung[0], ducked: ducked[0], last: frames.at(-1) });
      h.check(`${name}: the stage asks for the ${jingle} jingle from the frame it ends, through the camera fade`, ending.length > 0 && ending.every((f) => f.track === jingle), { tracks: [...new Set(ending.map((f) => f.track))] });
      h.check(
        `${name}: the ${jingle} jingle starts once and plays to its end`,
        rung.length > 0 && frames.every((f) => f.jingles[jingle] <= before[jingle] + 1) && frames.at(-1).jingles[jingle] === before[jingle] + 1,
        { before: before[jingle], after: frames.at(-1).jingles[jingle], rungMs: rung.length ? rung.at(-1).ms - firstRung : 0 },
      );
      h.check(`${name}: under the jingle the stage track has faded to silence`, ducked.length > 0 && ducked.every((f) => f.fadingGain < 1e-3), { ducked: ducked.length, loudest: Math.max(...ducked.map((f) => f.fadingGain)) });
      return rung;
    };
    // The next scene's track waits for the jingle to ring out instead of fading in over it.
    const waitsForJingle = (name, frames, jingle, next) => {
      const overlap = frames.filter((f) => f.ringing === jingle && f.playing === next);
      h.check(`${name}: ${next} stays silent until the ${jingle} jingle has rung out`, overlap.every((f) => f.trackGain < 1e-3), { overlapFrames: overlap.length, loudest: Math.max(0, ...overlap.map((f) => f.trackGain)) });
    };

    const title = await h.state();
    h.check('Title asks for Starlane Patrol before any key, with no audio context yet', title.music.track === 'normal' && title.music.ctx === null && title.music.playing === null, { music: title.music });
    h.check("nothing fetches the Empress's song before the first gesture", title.music.files.empress.status === 'idle' && served.length === 0, { files: title.music.files, served: [...served] });
    await h.step('press Shift on Title (a gesture that starts nothing)', () => h.page.keyboard.press('Shift'));
    const first = await h.waitFor('normal track playing', (x) => x.music.ctx === 'running' && x.music.playing === 'normal' && x.music.step > 8, 4000);
    h.check('the first gesture starts Starlane Patrol on a running context, unmuted', first.music.plays === 1 && !first.music.muted && Math.abs(first.music.busGain - VOLUME) < 1e-3, { music: first.music });
    h.check("the first gesture starts loading the Empress's song, long before stage 10", first.music.files.empress.status !== 'idle' && served[0] === '/music/void-empress.ogg', { files: first.music.files, served: [...served] });
    await h.shot('title');
    await h.shot('title-music-hint', { x: 0, y: 0, w: 240, h: 40 });

    let hangar;
    const s1 = await h.throughHangar({ atHangar: async () => (hangar = await h.waitFor('hangar plays the shop track', (x) => x.music.playing === 'shop', 4000)) });
    h.check("the hangar swaps the title's Starlane Patrol for the shop track", hangar.music.track === 'shop' && hangar.music.plays === 2, { title: first.music, hangar: hangar.music });
    h.check("stage 1 swaps the hangar's shop track for the first act's track", s1.music.track === 'act1' && s1.music.playing === 'act1' && s1.music.plays === 3, { hangar: hangar.music, stage: s1.music });

    await h.game('transAmGauge', 100);
    const stepSec = await h.page.evaluate(async () => {
      const { TRACKS } = await import('/src/audio/tracks.ts');
      return 60 / TRACKS.act1.bpm / TRACKS.act1.stepsPerBeat;
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
      cutFrom.playing === 'act1' && frozenSec > 0.6 && cutTo.foe.x === cutFrom.foe.x && cutTo.foe.y === cutFrom.foe.y && cutTo.step - cutFrom.step >= Math.floor((frozenSec / stepSec) * 0.8),
      { from: cutFrom, to: cutTo, stepSec },
    );

    await h.waitFor('stage 1 fighting after the cut-in', (x) => x.life === 'fighting', 4000);
    const beforeClear = (await h.state()).music.jingles;
    await h.game('kill');
    const cleared = await framesUntil("s.scenes.includes('Shop') && s.music.playing === 'shop'", 8000);
    endsOnJingle('stage 1 clear', cleared, 'clear', beforeClear);
    waitsForJingle('stage 1 clear', cleared, 'clear', 'shop');
    const shopNow = await h.state();
    h.check('the shop plays Hangar Lounge', shopNow.music.track === 'shop' && shopNow.music.playing === 'shop', { music: shopNow.music });
    await h.step('press Enter in the shop', () => h.page.keyboard.press('Enter'));
    const s2 = await h.waitFor('stage 2 on act 1', (x) => x.scenes.includes('Stage') && x.run?.stage === 2 && x.music.playing === 'act1', 4000);
    h.check('stage 2, reached from the shop, plays the first act again', s2.music.track === 'act1', { music: s2.music });
    for (const [stage, act] of [[3, 'act2'], [6, 'act3'], [8, 'act4']]) {
      await h.startAt(stage);
      const s = await h.waitFor(`stage ${stage} on ${act}`, (x) => x.music.playing === act, 4000);
      h.check(`stage ${stage} plays ${act}`, s.music.track === act, { music: s.music });
    }

    const beforeDefeat = (await h.state()).music.jingles;
    await h.step('hurt the ship until it goes down', async () => {
      for (let i = 0; i < 30 && (await h.state()).life === 'fighting'; i++) {
        await h.game('hurt');
        await sleep(60);
      }
    });
    const downed = await framesUntil("s.scenes.includes('End') && s.music.playing === 'normal' && s.music.ringing === null && s.music.trackGain > 0.05", 8000);
    endsOnJingle('defeat', downed, 'defeat', beforeDefeat);
    waitsForJingle('defeat', downed, 'defeat', 'normal');
    h.check('the End screen after a defeat plays Starlane Patrol', downed.at(-1).track === 'normal', { last: downed.at(-1) });

    const fight = async (stage, name, [first, second], shot, enter = () => h.startAt(stage)) => {
      const atHpRatio = await h.page.evaluate(async (stage) => {
        const stages = await import('/src/core/stages.ts');
        return stages.BOSSES[stage === 5 ? 'crimsonSeraph' : 'voidEmpress'].transform.atHpRatio;
      }, stage);
      await enter();
      await h.game('god', true);
      const entering = await h.waitFor(`${name}: ${first.playing}`, (x) => x.music.playing === first.playing, 3000);
      h.check(`${name}: the boss stage starts on ${first.playing}`, entering.music.track === first.track && entering.boss.form === 0, { music: entering.music, boss: entering.boss });
      await h.waitFor(`${name} in place`, (x) => x.boss?.stance === 'fighting', 12000);
      await h.game('bossHp', atHpRatio - 0.05);
      const turning = await h.waitFor(`${name} transforming`, (x) => x.boss?.stance === 'transforming', 4000);
      h.check(`${name}: the transformation asks for ${second.playing} at once`, turning.music.track === second.track && turning.music.source === second.playing, { music: turning.music, boss: { form: turning.boss.form, stance: turning.boss.stance } });
      if (turning.boss.form === 0) h.log.steps.push({ action: `${name}: ${second.playing} asked for while still in form 0`, music: turning.music });
      const after = await h.waitFor(`${name} second form`, (x) => x.boss?.form === 1 && x.boss.stance === 'fighting' && x.music.playing === second.playing, 10000);
      h.check(`${name}: the second form fights to ${second.playing}`, after.music.track === second.track && after.music.playing === second.playing, { music: after.music });
      if (shot) {
        await sleep(600);
        await h.game('pause');
        await h.shot(`${name.split(' ')[1].toLowerCase()}-second-form`);
        await h.game('resume');
      }
      return { entering, turning, after };
    };
    const SERAPH = [{ track: 'boss1', playing: 'boss1' }, { track: 'boss2', playing: 'boss2' }];

    await fight(5, 'Crimson Seraph', SERAPH, true);
    const beforeSeraph = (await h.state()).music.jingles;
    await h.game('kill');
    const seraphDown = await framesUntil("s.scenes.includes('Shop') && s.music.playing === 'shop'", 8000);
    endsOnJingle('Crimson Seraph down', seraphDown, 'clear', beforeSeraph);
    h.check('the dead Seraph never asks for silence over her clear jingle', seraphDown.every((f) => f.track !== null), { tracks: [...new Set(seraphDown.map((f) => f.track))] });
    h.check('the shop after the boss plays Hangar Lounge', seraphDown.at(-1).track === 'shop', { last: seraphDown.at(-1) });

    const fellBack = await fight(10, 'Void Empress', [{ track: 'empress', playing: 'boss1' }, { track: 'empress', playing: 'boss2' }], true);
    const oggAt = servedAt.filter((_, i) => served[i].endsWith('.ogg'));
    const retryGaps = oggAt.slice(1).map((t, i) => t - oggAt[i]);
    const MAX_ATTEMPTS = await h.page.evaluate(async () => (await import('/src/audio/fileLoad.ts')).MAX_ATTEMPTS);
    h.check(
      'with no song file the Empress falls back to Crimson Verdict, then Crimson Verdict II, and says so once',
      fellBack.entering.music.fellBack && fellBack.after.music.fellBack && ['failed', 'fetching'].includes(fellBack.after.music.files.empress.status) && warnings.length === 1 && warnings[0].includes('/music/void-empress.ogg') && warnings[0].includes('/music/void-empress.mp3'),
      { warnings: [...warnings], files: fellBack.after.music.files },
    );
    h.check(
      'the missing song is retried, .ogg then .mp3 each time, at least 2 s apart and never more than the attempt cap',
      oggAt.length >= 2 && oggAt.length <= MAX_ATTEMPTS && served.every((p, i) => p === (i % 2 ? '/music/void-empress.mp3' : '/music/void-empress.ogg')) && retryGaps.every((ms) => ms >= 1900),
      { served: [...served], retryGaps, maxAttempts: MAX_ATTEMPTS },
    );
    const beforeVictory = (await h.state()).music.jingles;
    await h.game('kill');
    const won = await framesUntil("s.scenes.includes('End') && s.music.playing === 'normal' && s.music.ringing === null && s.music.trackGain > 0.05", 10000);
    const fanfare = endsOnJingle('Void Empress down', won, 'victory', beforeVictory);
    waitsForJingle('Void Empress down', won, 'victory', 'normal');
    h.check('the fanfare outlasts the outro and still rings into the End screen', fanfare.some((f) => f.scenes.includes('End')), { lastRung: fanfare.at(-1) });

    await h.step('press M', () => h.page.keyboard.press('m'));
    const muted = await h.waitFor('music bus ramped to silence', (x) => x.music.busGain < 1e-4, 1000);
    h.check('M mutes the music: the bus ramps to 0 and the track keeps its place', muted.music.muted && muted.music.playing === 'normal', { music: muted.music });
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

    const tone = loopingTone();
    const toneWav = wavStereo16(tone, TONE_RATE);
    const toneLoud95 = loud95(tone, TONE_RATE);
    let songUp = true;
    await h.page.unroute(SONG);
    served.length = 0;
    warnings.length = 0;
    await h.page.route(SONG, async (route) => {
      if (!songUp || !route.request().url().endsWith('.ogg')) return serveMissing(route);
      served.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav });
    });
    await h.page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      const taps = new Map();
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && dest.context instanceof AudioContext) {
          if (!taps.has(dest.context)) taps.set(dest.context, Object.assign(dest.context.createAnalyser(), { fftSize: 8192 }));
          connect.call(this, taps.get(dest.context));
        }
        return connect.call(this, dest, ...rest);
      };
      window.__outputRms = () =>
        Math.max(
          0,
          ...[...taps.values()].map((tap) => {
            const frame = new Float32Array(tap.fftSize);
            tap.getFloatTimeDomainData(frame);
            return Math.sqrt(frame.reduce((sum, v) => sum + v * v, 0) / frame.length);
          }),
        );
    });
    const outputRms = async (samples = 10) => {
      const frames = [];
      for (let i = 0; i < samples; i++) {
        frames.push(await h.page.evaluate(() => window.__outputRms()));
        await sleep(150);
      }
      return frames.reduce((a, b) => a + b, 0) / frames.length;
    };
    await h.page.reload();
    await h.waitFor('Title with the song file served', (x) => x.scenes.includes('Title'), 15000);
    await h.page.keyboard.press('Shift');
    await h.waitFor('normal track playing', (x) => x.music.playing === 'normal', 4000);
    const preloaded = await h.waitFor('song fetched on Title', (x) => x.music.files.empress.status === 'fetched', 4000);
    h.check(
      'the song is fetched on Title and kept compressed, not decoded',
      preloaded.scenes.includes('Title') && preloaded.music.files.empress.url === '/music/void-empress.ogg' && preloaded.music.files.empress.bytes === toneWav.length,
      { scenes: preloaded.scenes, files: preloaded.music.files },
    );

    await fight(5, 'Crimson Seraph', SERAPH, false);
    const nine = await h.startAt(9);
    h.check('the song is still compressed through stage 5 and on stage 9', nine.music.files.empress.status === 'fetched', { files: nine.music.files });
    await h.game('kill');
    const decodedAt = await h.waitFor('song decoded in the shop after stage 9', (x) => x.music.files.empress.status === 'ready', 8000);
    h.check(
      'the shop after stage 9 decodes the song, before stage 10 starts',
      decodedAt.scenes.includes('Shop') && decodedAt.run?.stage === 9 && decodedAt.music.files.empress.url === '/music/void-empress.ogg',
      { scenes: decodedAt.scenes, stage: decodedAt.run?.stage, files: decodedAt.music.files },
    );
    const own = await fight(10, 'Void Empress', [{ track: 'empress', playing: 'empress' }, { track: 'empress', playing: 'empress' }], false, () =>
      h.step('press Enter in the shop after stage 9', () => h.page.keyboard.press('Enter')),
    );
    const url = '/music/void-empress.ogg';
    h.check(
      "with the song file the Empress plays it through her transformation on one source, never restarted",
      [own.entering, own.turning, own.after].every((x) => x.music.playing === 'empress' && x.music.url === url && x.music.plays === own.entering.music.plays && !x.music.fellBack),
      { entering: own.entering.music, turning: own.turning.music, after: own.after.music },
    );
    h.check('the song file is fetched once, .ogg first, with no warning', served.length === 1 && served[0] === url && warnings.length === 0, { served: [...served], warnings: [...warnings] });

    const boss1Loud95 = await h.page.evaluate(async () => {
      const { compile, playStep } = await import('/src/audio/synth.ts');
      const { MUSIC_VOLUME, TRACK_LEVEL } = await import('/src/audio/music.ts');
      const RATE = 44100;
      const song = compile('boss1');
      const ctx = new OfflineAudioContext(1, Math.ceil(song.steps * song.stepSec * RATE), RATE);
      const bus = ctx.createGain();
      bus.gain.value = MUSIC_VOLUME * TRACK_LEVEL.boss1;
      bus.connect(ctx.destination);
      for (let step = 0; step < song.steps; step++) playStep(ctx, bus, song, step, step * song.stepSec);
      const data = (await ctx.startRendering()).getChannelData(0);
      const win = Math.round(RATE * 0.05);
      const windows = [];
      for (let i = 0; i + win <= data.length; i += win) {
        let w = 0;
        for (let j = i; j < i + win; j++) w += data[j] * data[j];
        windows.push(Math.sqrt(w / win));
      }
      windows.sort((a, b) => a - b);
      return windows[Math.floor(0.95 * windows.length)];
    });
    const { trackGain, files } = own.after.music;
    const empressLevel = await h.page.evaluate(async () => (await import('/src/audio/music.ts')).TRACK_LEVEL.empress);
    const songLoud95 = toneLoud95 * trackGain * VOLUME;
    h.check(
      "the song's gain turns it down to within 20% of Crimson Verdict's loudness on the bus",
      files.empress.gain < 0.6 && Math.abs(trackGain - files.empress.gain * empressLevel) < 1e-3 && Math.abs(songLoud95 / boss1Loud95 - 1) < 0.2,
      { toneLoud95, trackGain, fileGain: files.empress.gain, songLoud95, boss1Loud95, ratio: songLoud95 / boss1Loud95 },
    );

    await h.game('pause');
    await sleep(300);
    const heard = await outputRms();
    const toneRms = Math.sqrt(tone.reduce((sum, v) => sum + v * v, 0) / tone.length);
    const expectedRms = toneRms * trackGain * VOLUME;
    h.check('the song reaches the speakers at its matched level, measured on the output with the stage paused', Math.abs(heard / expectedRms - 1) < 0.2, { heard, expectedRms, ratio: heard / expectedRms });
    await h.step('press M during the Empress song', () => h.page.keyboard.press('m'));
    const quietSong = await h.waitFor('song muted', (x) => x.music.busGain < 1e-4, 1000);
    await sleep(300);
    const heardMuted = await outputRms();
    h.check('M mutes the song file like the synth tracks, which keeps playing', quietSong.music.muted && quietSong.music.playing === 'empress' && quietSong.music.url === url && heardMuted < 1e-4, { music: quietSong.music, heardMuted });
    await h.game('resume');

    // A wave clear with the stage frozen as the jingle starts, so no sfx reaches the output while it is measured.
    const clearHeard = async (label) => {
      await h.startAt(1);
      await h.game('kill');
      await h.waitFor(`${label}: clear jingle ringing`, (x) => x.music.ringing === 'clear', 2000);
      await h.game('pause');
      await sleep(300);
      const rms = await outputRms(5);
      const s = await h.state();
      await h.game('resume');
      return { rms, music: s.music };
    };
    await h.step('press M to unmute', () => h.page.keyboard.press('m'));
    await h.waitFor('music bus back up', (x) => Math.abs(x.music.busGain - VOLUME) < 1e-3, 1000);
    const loudClear = await clearHeard('unmuted');
    h.check('the clear jingle reaches the speakers through the music bus', loudClear.rms > 1e-3 && loudClear.music.ringing === 'clear', loudClear);
    await h.step('press M to mute', () => h.page.keyboard.press('m'));
    await h.waitFor('music bus ramped to silence', (x) => x.music.busGain < 1e-4, 1000);
    const mutedClear = await clearHeard('muted');
    h.check('M silences a jingle like any track', mutedClear.rms < 1e-4 && mutedClear.music.ringing === 'clear' && mutedClear.music.muted, mutedClear);

    songUp = false;
    served.length = 0;
    warnings.length = 0;
    await h.page.reload();
    await h.waitFor('Title with the song failing', (x) => x.scenes.includes('Title'), 15000);
    await h.page.keyboard.press('Shift');
    await h.waitFor("the song's first attempt failed", (x) => x.music.files.empress.status === 'failed', 4000);
    await h.startAt(10);
    await h.game('god', true);
    const onSynth = await h.waitFor('Empress on the synth fallback', (x) => x.run?.stage === 10 && x.music.playing === 'boss1', 4000);
    h.check('while the latest attempt has failed, the Empress fight starts on Crimson Verdict', onSynth.music.fellBack && onSynth.music.track === 'empress', { music: onSynth.music });
    await h.waitFor('a retry scheduled', (x) => x.music.files.empress.status === 'failed', 10000);
    songUp = true;
    const retryInMs = await h.page.evaluate(() => {
      const f = window.__game.state().music.files.empress;
      return f.status === 'failed' && f.retryAt !== null ? f.retryAt - performance.now() : 0;
    });
    h.log.steps.push({ action: 'serve the song from now on', retryInMs, served: [...served] });
    const flippedAt = Date.now();
    // A retry that started just before the flip still fails, and the one after it can be up to a minute away.
    const healed = await h.waitFor('song after a retry', (x) => x.music.playing === 'empress', 70000);
    h.log.steps.push({ action: 'song playing after the flip', ms: Date.now() - flippedAt, retryInMs });
    h.check(
      'once a retry loads the song, the fight crossfades from Crimson Verdict to it, with the Empress still fighting',
      healed.run?.stage === 10 && healed.boss?.stance !== 'dead' && !healed.music.fellBack && healed.music.url === '/music/void-empress.ogg' && healed.music.files.empress.status === 'ready' && healed.music.plays === onSynth.music.plays + 1 && served.at(-1) === '/music/void-empress.ogg' && served.length >= 3 && warnings.length === 1,
      { before: onSynth.music, after: healed.music, served: [...served], warnings: [...warnings] },
    );

    // A round of retries takes about five minutes, so the music module's own clock is pushed ahead instead: only
    // performance.now calls made from music.ts see the skew, and Phaser's loop keeps real time.
    songUp = false;
    served.length = 0;
    warnings.length = 0;
    await h.page.addInitScript(() => {
      const now = performance.now.bind(performance);
      window.__musicSkewMs = 0;
      performance.now = () => (window.__musicSkewMs && new Error().stack?.includes('/src/audio/music.ts') ? now() + window.__musicSkewMs : now());
    });
    await h.page.reload();
    await h.waitFor('Title with the song failing, music clock skewable', (x) => x.scenes.includes('Title'), 15000);
    await h.page.keyboard.press('Shift');
    const spent = await h.page.evaluate(async () => {
      for (let i = 0; i < 400; i++) {
        const f = window.__game.state().music.files.empress;
        if (f.status === 'failed' && f.retryAt === null) return f;
        if (f.status === 'failed') window.__musicSkewMs += 61_000;
        await new Promise((r) => setTimeout(r, 50));
      }
      return window.__game.state().music.files.empress;
    });
    await h.page.evaluate(() => (window.__musicSkewMs += 3_600_000));
    await sleep(500);
    h.check(
      'after every attempt of the round has failed the song is not requested again, an hour later on its clock',
      spent.status === 'failed' && spent.attempt === MAX_ATTEMPTS && spent.retryAt === null && served.length === 2 * MAX_ATTEMPTS && (await h.state()).music.files.empress.attempt === MAX_ATTEMPTS,
      { spent, served: served.length },
    );
    songUp = true;
    const watching = framesUntil("s.music.playing === 'empress'", 10000);
    await h.startAt(10);
    await h.game('god', true);
    const rearmed = await watching;
    const back = await h.state();
    h.check(
      'stage 10 asking for the song starts a fresh round at once: Crimson Verdict stands in, then attempt 11 loads the song',
      rearmed.some((f) => f.track === 'empress' && f.playing === 'boss1') &&
        back.music.files.empress.status === 'ready' &&
        served.length === 2 * MAX_ATTEMPTS + 1 &&
        served.at(-1) === '/music/void-empress.ogg' &&
        warnings.length === 1,
      { playing: [...new Set(rearmed.map((f) => f.playing))], files: back.music.files, served: served.length, warnings: [...warnings] },
    );
  },
  async mobile(h) {
    const outDir = join(ROOT, '.verify', runId, 'evidence', 'mobile');
    const context = await h.page.context().browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const m = harness(await context.newPage(), outDir);
    const cdp = await context.newCDPSession(m.page);
    // Chrome's CDP touch emulation takes every finger still down on touchStart and touchMove, and only the lifted
    // finger on touchEnd; a touchMove that leaves a finger out does not lift it.
    const fingers = new Map();
    const pageOf = async ({ x, y }) => {
      const [box, s] = [await m.page.locator('canvas').boundingBox(), await m.state()];
      const w = s.view.world;
      return { x: box.x + ((x - w.x) * box.width) / w.width, y: box.y + ((y - w.y) * box.height) / w.height };
    };
    const send = (type, points = fingers) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...points].map(([id, p]) => ({ id, ...p })) });
    const down = async (id, at) => {
      fingers.set(id, await pageOf(at));
      await send('touchStart');
    };
    const move = async (id, at) => {
      fingers.set(id, await pageOf(at));
      await send('touchMove');
    };
    const up = async (id) => {
      const lifted = [[id, fingers.get(id)]];
      fingers.delete(id);
      await send('touchEnd', lifted);
    };
    const tap = async (id, at) => {
      await down(id, at);
      await sleep(50);
      await up(id);
    };
    const slide = async (id, from, to, steps) => {
      for (let i = 1; i <= steps; i++) {
        await move(id, { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
        await sleep(16);
      }
    };
    const record = () =>
      m.page.evaluate(() => {
        const samples = (window.__samples = []);
        const tick = () => {
          if (window.__samples !== samples) return;
          const s = window.__game.state();
          samples.push({ x: s.player.x, y: s.player.y, ms: s.clock.fightMs, moveSpeed: s.stats.moveSpeed });
          requestAnimationFrame(tick);
        };
        tick();
      });
    const recorded = () =>
      m.page.evaluate(() => {
        const samples = window.__samples;
        window.__samples = null;
        return samples;
      });
    // Speed between consecutive frames in game time, against the moveSpeed in force on the later frame.
    const speeds = (samples) =>
      samples.slice(1).flatMap((b, i) => {
        const a = samples[i];
        const dt = (b.ms - a.ms) / 1000;
        return dt > 0 ? [{ v: Math.hypot(b.x - a.x, b.y - a.y) / dt, cap: b.moveSpeed }] : [];
      });
    const slot = (s, button) => s.tray.find((t) => t.button === button);
    const onTarget = (x) => x.move.kind === 'to' && x.player.x === x.move.x && x.player.y === x.move.y;

    try {
      const title = await m.openTitle();
      m.check('a coarse pointer puts the game in touch mode', title.input === 'touch', { input: title.input });
      await sleep(400);
      await m.shot('title');
      const s1 = await m.throughHangar({
        title: () => tap(1, { x: 240, y: 330 }),
        atHangar: async (hangar) => {
          await sleep(400);
          await m.shot('hangar');
          m.check('the hangar draws no refresh button and centers the go button under the cards', hangarButtons(hangar), { targets: hangar.targets });
        },
        go: (hangar) => {
          const go = hangar.targets.find((t) => t.id === 'go');
          return tap(1, { x: go.x + go.w / 2, y: go.y + go.h / 2 });
        },
      });
      const opening = await m.core('run.OPENING_COINS');
      m.check('a tap on Title and a tap on the hangar go button start a fresh run at stage 1 holding the opening coins', s1.run.stage === 1 && s1.run.money === opening && Object.keys(s1.run.perks).length === 0, { run: s1.run, opening });

      const w = s1.view.world;
      const band = { top: 640, bottom: w.y + w.height };
      const thumb = { x: 240, y: (band.top + band.bottom) / 2 };
      m.check('the phone shows a band below the playfield for the thumb', band.bottom - band.top > 150, { band });

      await down(1, thumb);
      await record();
      const p0 = (await m.state()).player;
      const right = { x: thumb.x + 80, y: thumb.y };
      await slide(1, thumb, right, 8);
      const settled = await m.waitFor('ship settled on the drag target', onTarget, 3000);
      const toRight = speeds(await recorded());
      const fastest = Math.max(...toRight.map((s) => s.v));
      m.check('a drag right in the bottom band flies the ship right by the drag, at the same height', Math.abs(settled.player.x - p0.x - 80) < 1.5 && Math.abs(settled.player.y - p0.y) < 0.01, { from: p0, to: settled.player, move: settled.move });
      m.check('the ship never flies faster than its moveSpeed toward the finger', toRight.every((s) => s.v <= s.cap * 1.01) && fastest > s1.stats.moveSpeed * 0.9, { fastest, moveSpeed: s1.stats.moveSpeed, frames: toRight.length });
      await record();
      await sleep(300);
      const still = await recorded();
      m.check('a finger held still keeps the ship exactly on its target, no jitter', still.length > 5 && still.every((s) => s.x === settled.player.x && s.y === settled.player.y), { frames: still.length, at: settled.player });

      const pastWall = { x: 2, y: thumb.y };
      await slide(1, right, pastWall, 12);
      const walled = await m.waitFor('ship stopped at the left wall', (x) => onTarget(x) && x.player.x < 60, 3000);
      await sleep(100);
      const wall = (await m.state()).player.x;
      m.check('pushing the finger past the left wall parks the ship on it', walled.move.x === wall, { wall, move: walled.move });
      await record();
      await slide(1, pastWall, { x: pastWall.x + 20, y: thumb.y }, 2);
      await sleep(150);
      const back = (await recorded()).filter((s) => s.x > wall);
      m.check('pulling the finger back after the wall moves the ship off it at once', back.length > 0 && back.at(-1).x > wall + 5, { wall, firstOff: back[0], last: back.at(-1) });
      await m.step('lift the steering finger', () => up(1));
      const lifted = await m.waitFor('steering over', (x) => x.move.kind === 'dir' && x.pointers.length === 0, 1000);
      await record();
      await sleep(200);
      const parked = await recorded();
      m.check('lifting the finger stops the ship', parked.every((s) => s.x === parked[0].x && s.y === parked[0].y), { at: lifted.player, frames: parked.length });

      const turnShown = () => m.page.locator('#turn').isVisible();
      await m.step('turn the phone sideways', () => m.page.setViewportSize({ width: 844, height: 390 }));
      await sleep(300);
      const side0 = await m.state();
      await m.step('tap the hint with a finger', async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 9, x: 422, y: 195 }] });
        await sleep(50);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ id: 9, x: 422, y: 195 }] });
      });
      await sleep(500);
      const side1 = await m.state();
      m.check('a phone held sideways covers the game with the turn-upright hint', await turnShown(), {});
      m.check('the fight holds still while sideways, even through a tap', side1.clock.fightMs === side0.clock.fightMs && side1.life === 'fighting', { before: side0.clock, after: side1.clock });
      m.check('the sound holds still while sideways, even through a tap', side1.music.ctx === 'suspended', { ctx: side1.music.ctx });
      await m.shot('sideways');
      await m.step('turn the phone back upright', () => m.page.setViewportSize({ width: 390, height: 844 }));
      const upright = await m.waitFor('fight running again', (x) => x.clock.fightMs > side1.clock.fightMs + 200 && x.music.ctx === 'running', 3000);
      m.check('turning back upright hides the hint and resumes the fight and the sound', !(await turnShown()) && upright.life === 'fighting', { clock: upright.clock, ctx: upright.music.ctx });
      await m.step('hold a tablet sideways', () => m.page.setViewportSize({ width: 1180, height: 820 }));
      await sleep(300);
      const tabletFrom = (await m.state()).clock.fightMs;
      await sleep(300);
      m.check('a tablet held sideways plays on with no hint', !(await turnShown()) && (await m.state()).clock.fightMs > tabletFrom, {});
      await m.page.setViewportSize({ width: 390, height: 844 });

      const s3 = await m.startAt(3, { afterburnerDash: 1 }, 0, { nitro: 2 });
      const box = await m.page.locator('canvas').boundingBox();
      const cssPerWorld = box.width / s3.view.world.width;
      m.check('the tray offers TRANS-AM, dash and the held item as tap targets', ['transAm', 'dash', 'nitro'].every((b) => slot(s3, b)), { tray: s3.tray });
      m.check('every tray tap target is at least 48 CSS px across', s3.tray.every((t) => t.r * 2 * cssPerWorld >= 48), { tray: s3.tray, cssPerWorld });

      await down(1, thumb);
      const steering = await m.waitFor('first finger steering', (x) => x.pointers.some((p) => p.job === 'steer') && x.move.kind === 'to', 1000);
      const nitro = slot(steering, 'nitro');
      const afterItem = await m.step('press the Nitro slot with a second finger while the first steers', async () => {
        await down(2, nitro);
        await m.waitFor('second finger owned by the Nitro slot', (x) => x.pointers.some((p) => p.job === 'nitro'), 1000);
      });
      await m.step('lift the second finger', () => up(2));
      const spent = await m.waitFor('nitro running and the second finger released', (x) => x.buffs.some((b) => b.buff === 'nitro') && x.pointers.length === 1, 1000);
      m.check('the tap spends exactly one Nitro and starts its buff', spent.run.items.nitro === 1, { before: steering.run.items, after: spent.run.items, buffs: spent.buffs });
      m.check('the tap leaves the first finger steering and the ship where it was going', spent.pointers[0].job === 'steer' && afterItem.pointers.some((p) => p.job === 'nitro') && spent.move.kind === 'to' && Math.abs(spent.move.x - steering.move.x) < 1e-6, { pointers: afterItem.pointers, before: steering.move, after: spent.move });
      m.check('Nitro raises moveSpeed', spent.stats.moveSpeed > s3.stats.moveSpeed * 1.2, { base: s3.stats.moveSpeed, nitro: spent.stats.moveSpeed });
      await record();
      await slide(1, thumb, { x: thumb.x - 150, y: thumb.y - 60 }, 6);
      await m.waitFor('ship caught up with the finger', onTarget, 3000);
      const boosted = speeds(await recorded());
      const fastestBoosted = Math.max(...boosted.map((s) => s.v));
      m.check('with Nitro the drag flies faster than the base speed but never past the boosted moveSpeed', boosted.every((s) => s.v <= s.cap * 1.01) && fastestBoosted > s3.stats.moveSpeed * 1.1, { fastest: fastestBoosted, base: s3.stats.moveSpeed, boosted: spent.stats.moveSpeed });
      await m.shot('mid-fight-tray');

      await m.step('tap the dash slot with a second finger', () => tap(2, slot(steering, 'dash')));
      const dashed = await m.waitFor('dashing', (x) => x.dashing, 1000);
      m.check('a tap on the dash slot dashes', dashed.dashing, { skills: dashed.skills });
      await m.waitFor('dash over', (x) => !x.dashing, 4000);

      const gaugeMax = await m.page.evaluate(() => import('/src/core/transAm.ts').then((t) => t.TRANS_AM.gaugeMax));
      await m.game('transAmGauge', gaugeMax);
      await m.step('tap the TRANS-AM slot with a second finger', () => tap(2, slot(steering, 'transAm')));
      const cut = await m.waitFor('TRANS-AM cut-in', (x) => x.life === 'cutIn', 1000);
      m.check('a tap on the TRANS-AM slot with a full gauge starts the cut-in', cut.life === 'cutIn' && cut.transAm.kind === 'active', { transAm: cut.transAm });
      await up(1);

      const full = await m.startAt(6, { afterburnerDash: 1, prismLance: 1, orbitalCannon: 1 }, 0, { repairKit: 1, nitro: 1, powerCell: 1, overclock: 1, barrierCapsule: 1 });
      const apart = full.tray.every((a, i) => full.tray.slice(i + 1).every((b) => Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 1e-6));
      m.check('a full tray keeps seven tap targets in the band, each at least 48 CSS px, none overlapping', full.tray.length === 7 && full.tray.every((t) => t.r * 2 * cssPerWorld >= 48 && t.y - t.r >= 640) && apart, { tray: full.tray, cssPerWorld });
      await m.game('pause');
      await m.shot('full-tray');
      await m.game('resume');

      // Chrome has no home indicator, so the iPhone inset is stood in for by the variable view.ts reads it through.
      const insetCss = 34;
      await m.page.evaluate((px) => document.documentElement.style.setProperty('--safe-bottom', `${px}px`), insetCss);
      await m.page.setViewportSize({ width: 390, height: 845 });
      const inset = await m.waitFor('tray refit above the inset', (x) => x.tray.length === 7 && x.view.world.height > 0 && Math.max(...x.tray.map((t) => t.y + t.r)) < Math.max(...full.tray.map((t) => t.y + t.r)) - 1);
      const safeEdge = inset.view.world.y + inset.view.world.height - insetCss / cssPerWorld;
      m.check('with a 34 CSS px home-indicator inset, no tray target reaches under it', inset.tray.every((t) => t.y + t.r <= safeEdge + 1e-6 && t.r * 2 * cssPerWorld >= 48), { tray: inset.tray, safeEdge });
      await m.game('pause');
      await m.shot('full-tray-inset');
      await m.game('resume');
      await m.page.evaluate(() => document.documentElement.style.removeProperty('--safe-bottom'));
      await m.page.setViewportSize({ width: 390, height: 844 });

      const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const target = (s, id) => s.targets.find((t) => t.id === id);
      const costs = () =>
        m.page.evaluate(async () => {
          const r = await import('/src/core/run.ts');
          const s = window.__game.state();
          return { offers: s.cards.map((o) => o && r.offerCost(s.run, o)), refresh: r.refreshCost(s.run) };
        });
      await m.startAt(1, {}, 300);
      await down(1, { x: 240, y: 160 });
      await m.game('kill');
      const shop = await m.waitFor('Shop open with a finger still down from the stage', (x) => x.scenes.includes('Shop') && x.targets?.length, 6000);
      await m.step('lift the finger that was steering when the stage ended, over the first card', () => up(1));
      await sleep(200);
      const kept = await m.state();
      m.check('a finger lifted over a card it did not press there buys nothing', kept.run.money === shop.run.money && JSON.stringify(kept.cards) === JSON.stringify(shop.cards), { before: shop.run.money, after: kept.run.money });

      const price = await costs();
      const bought = await m.step('tap the first card', () => tap(1, center(target(shop, 'card0'))));
      const afterBuy = await m.waitFor('first card bought', (x) => x.cards[0] === null || x.run.money < shop.run.money, 2000);
      const owned = (s) => JSON.stringify([s.run.perks, s.run.items]);
      m.check('a tap on a card buys it for its price', afterBuy.run.money === shop.run.money - price.offers[0] && owned(afterBuy) !== owned(shop), { before: shop.run, after: afterBuy.run, cost: price.offers[0], step: bought.run.money });

      const before = await costs();
      await m.step('tap refresh', () => tap(1, center(target(afterBuy, 'refresh'))));
      const refreshed = await m.waitFor('offers refreshed', (x) => x.run.money === afterBuy.run.money - before.refresh, 2000);
      m.check('a tap on refresh pays its cost for a new set of offers', JSON.stringify(refreshed.cards) !== JSON.stringify(afterBuy.cards), { before: afterBuy.cards, after: refreshed.cards, cost: before.refresh });

      const chip = refreshed.chips[0];
      await m.step('tap the owned chip', () => tap(1, center(chip)));
      const tipped = await m.waitFor('tooltip shown', (x) => x.tooltip.visible, 1000);
      await sleep(400);
      m.check('a tap on an owned chip shows its tooltip and it stays up after the finger lifts', (await m.state()).tooltip.visible && tipped.tooltip.kind === chip.kind && tipped.tooltip.id === chip.id, { chip, tooltip: tipped.tooltip });
      await sleep(400);
      await m.shot('shop-tooltip');
      await m.step('tap away from the chips', () => tap(1, { x: 240, y: 30 }));
      const untipped = await m.waitFor('tooltip hidden', (x) => !x.tooltip.visible, 1000);
      m.check('a tap elsewhere hides the tooltip without buying', untipped.run.money === refreshed.run.money, { tooltip: untipped.tooltip });
      await m.shot('shop');

      await m.step('tap continue', () => tap(1, center(target(untipped, 'go'))));
      const next = await m.waitFor('next stage', (x) => x.scenes.includes('Stage') && x.run.stage === 2, 4000);
      m.check('a tap on continue leaves the shop for the next stage', next.run.stage === 2, { stage: next.run.stage });

      await m.waitFor('stage 2 fighting', (x) => x.life === 'fighting', 4000);
      for (let i = 0; i < next.run.hp; i++) await m.game('hurt');
      await m.waitFor('End scene', (x) => x.scenes.includes('End'), 6000);
      await sleep(600);
      await m.shot('end');
      await m.step('tap the End screen', () => tap(1, { x: 240, y: 330 }));
      const restarted = await m.waitFor('back on Title', (x) => x.scenes.includes('Title'), 3000);
      m.check('a tap on End returns to Title', restarted.scenes.includes('Title'), { scenes: restarted.scenes });
    } finally {
      h.log.steps.push(...m.log.steps);
      h.log.checks.push(...m.log.checks);
      h.log.consoleErrors.push(...m.log.consoleErrors);
      await context.close();
    }
  },
  async sfx(h) {
    const record = (ms, stopSrc = 'false') =>
      h.page.evaluate(
        ([ms, stopSrc]) =>
          new Promise((resolve) => {
            const stop = new Function('s', `return (${stopSrc})`);
            const out = [];
            const start = performance.now();
            const tick = () => {
              const s = window.__game.state();
              out.push({
                ms: performance.now() - start,
                scenes: s.scenes,
                life: s.life,
                transAm: s.transAm?.kind,
                fightMs: s.clock?.fightMs,
                interval: s.stats?.fireIntervalMs,
                laserFiring: s.laserFiring,
                played: s.sfx.played,
                beam: s.sfx.beam,
                zips: s.transAmSound.shots,
                stance: s.boss?.stance,
                castMsLeft: s.boss?.castMsLeft,
                orbital: s.skills?.find((k) => k.id === 'orbital')?.kind,
              });
              if (performance.now() - start > ms || stop(s)) return resolve(out);
              requestAnimationFrame(tick);
            };
            tick();
          }),
        [ms, stopSrc],
      );
    const n = (x, name) => x.played[name] ?? 0;
    const { gaugeMax, castSound, motions, bosses, chargeMs } = await (async () => {
      await h.openTitle();
      return h.page.evaluate(async () => {
        const [transAm, recipes, motion, stages, patterns] = await Promise.all([
          import('/src/core/transAm.ts'),
          import('/src/audio/sfxRecipes.ts'),
          import('/src/game/bossMotion.ts'),
          import('/src/core/stages.ts'),
          import('/src/game/patterns.ts'),
        ]);
        return {
          gaugeMax: transAm.TRANS_AM.gaugeMax,
          castSound: recipes.CAST_SOUND,
          motions: Object.fromEntries(Object.entries(motion.MOTIONS).map(([p, m]) => [p, m.tier])),
          bosses: JSON.parse(JSON.stringify(stages.BOSSES)),
          chargeMs: Object.fromEntries(Object.entries(patterns.PATTERNS).map(([p, def]) => [p, def.cast?.chargeMs ?? null])),
        };
      });
    })();
    await h.page.keyboard.press('Shift');

    const volleysMatch = async (label) => {
      const rec = await record(3000);
      const [a, b] = [rec[0], rec.at(-1)];
      const shots = n(b, 'shot') - n(a, 'shot');
      const volleys = (b.fightMs - a.fightMs) / b.interval;
      h.check(`${label}: one gun sound per volley`, rec.every((x) => x.life === 'fighting' && x.interval === b.interval) && Math.abs(shots - volleys) <= 1.5, { shots, volleys, intervalMs: b.interval, fightMs: b.fightMs - a.fightMs });
    };
    await h.startAt(4);
    await h.game('god', true);
    await volleysMatch('base gun');
    await h.shot('base-gun');

    await h.startAt(4, { hairTrigger: 3 }, 0, { overclock: 1 });
    await h.game('god', true);
    await h.page.keyboard.press('v');
    await h.waitFor('Overclock running', (s) => s.buffs.some((b) => b.buff === 'overclock'), 2000);
    await volleysMatch('Hair Trigger III with Overclock');

    await h.game('transAmGauge', gaugeMax);
    await h.page.keyboard.press('Space');
    const ta = await record(12000, `s.transAm.kind === 'depleted' && s.transAm.msLeft < 3000`);
    let [activeFrames, shotsActive, zips] = [0, 0, 0];
    for (let i = 1; i < ta.length; i++) {
      if (ta[i].transAm !== 'active' || ta[i - 1].transAm !== 'active') continue;
      activeFrames++;
      shotsActive += n(ta[i], 'shot') - n(ta[i - 1], 'shot');
      zips += ta[i].zips - ta[i - 1].zips;
    }
    h.check('no gun sound while TRANS-AM is active, which zips every volley instead', activeFrames > 100 && shotsActive === 0 && zips > 20, { activeFrames, shotsActive, zips });
    const depleted = ta.filter((x) => x.transAm === 'depleted' && x.life === 'fighting');
    h.check('the gun sounds again once TRANS-AM is spent', depleted.length > 0 && n(depleted.at(-1), 'shot') > n(depleted[0], 'shot'), { from: n(depleted[0], 'shot'), to: n(depleted.at(-1), 'shot') });

    const beamsOf = (rec) => {
      const beams = [];
      rec.forEach((x, i) => {
        if (i > 0 && x.laserFiring && !rec[i - 1].laserFiring) beams.push({ on: i });
        if (i > 0 && !x.laserFiring && rec[i - 1].laserFiring && beams.length) beams.at(-1).off = i;
      });
      return beams;
    };
    await h.startAt(1, { prismLance: 3 });
    await h.game('god', true);
    const lr = await record(8000);
    const beams = beamsOf(lr).filter((b) => b.off !== undefined);
    h.check('the laser fired at least twice', beams.length >= 2, { beams: beams.length });
    for (const [k, { on, off }] of beams.slice(0, 2).entries()) {
      const before = lr[on - 1];
      const firing = lr.slice(on, off);
      const after = lr.slice(off).filter((x) => x.ms - lr[off].ms >= 250 && x.ms - lr[off].ms < 600);
      h.check(`beam ${k + 1}: the zap plays once and the buzz starts as it fires`, n(firing.at(-1), 'laser') - n(before, 'laser') === 1 && lr[on].beam.starts - before.beam.starts === 1 && firing.slice(2).every((x) => x.beam.live === 1), {
        zaps: n(firing.at(-1), 'laser') - n(before, 'laser'),
        starts: lr[on].beam.starts - before.beam.starts,
        live: firing.map((x) => x.beam.live),
      });
      h.check(`beam ${k + 1}: the buzz stops when the beam ends and its nodes are gone 250 ms later`, lr[off].beam.stops - before.beam.stops === 1 && after.length > 0 && after.every((x) => x.beam.live === 0 && x.beam.starts === lr[on].beam.starts), {
        stops: lr[off].beam.stops - before.beam.stops,
        after: after.map((x) => x.beam),
        firedForMs: lr[off].ms - lr[on].ms,
      });
    }
    await h.shot('laser-stage');

    await h.startAt(1, { prismLance: 1, longDischarge: 3 });
    await h.game('god', true);
    await h.frameWhen('s.laserFiring', false, 8000);
    await h.game('transAmGauge', gaugeMax);
    const pre = await h.state();
    await h.page.keyboard.press('Space');
    const ci = await record(6000, `s.life === 'fighting' && !s.laserFiring && s.sfx.beam.live === 0`);
    const cut = ci.filter((x) => x.life === 'cutIn');
    const cutQuiet = cut.filter((x) => x.ms - cut[0].ms >= 250);
    const back = ci.filter((x, i) => i > ci.indexOf(cut.at(-1)) && x.life === 'fighting' && x.laserFiring);
    h.check('the TRANS-AM cut-in stops the buzz while it freezes the beam', cut.length > 0 && cutQuiet.length > 0 && cutQuiet.every((x) => x.beam.live === 0 && x.laserFiring) && cut.at(-1).beam.stops === pre.sfx.beam.stops + 1, {
      cutFrames: cut.length,
      live: cutQuiet.map((x) => x.beam.live),
    });
    h.check('the beam left after the cut-in buzzes again without a second zap', back.length > 0 && back.at(-1).beam.starts === cut.at(-1).beam.starts + 1 && n(ci.at(-1), 'laser') === n(pre.sfx, 'laser') && back.slice(2).every((x) => x.beam.live === 1), {
      startsBefore: cut.at(-1).beam.starts,
      startsAfter: back.at(-1)?.beam.starts,
      zaps: n(ci.at(-1), 'laser') - n(pre.sfx, 'laser'),
    });
    h.check('and stops when that beam ends', ci.at(-1).beam.live === 0 && ci.at(-1).beam.stops === back.at(-1).beam.stops + 1, { end: ci.at(-1).beam });

    for (const [how, stage, end] of [
      ['a stage clear', 1, async () => h.game('kill')],
      ['a defeat', 2, async () => { for (let i = 0; i < 12; i++) await h.game('hurt'); }],
    ]) {
      await h.startAt(stage, { prismLance: 1, longDischarge: 3 });
      await h.frameWhen('s.laserFiring', false, 8000);
      const pre = await h.state();
      await end();
      const er = await record(1500, `!s.scenes.includes('Stage')`);
      const ending = er.filter((x) => x.life === 'ending');
      const settled = ending.filter((x) => x.ms - ending[0].ms >= 250);
      h.check(`${how} mid-beam stops the buzz for good while the beam burns on through the outro`, ending.length > 0 && ending.some((x) => x.laserFiring) && settled.length > 0 && settled.every((x) => x.beam.live === 0) && ending.at(-1).beam.starts === pre.sfx.beam.starts && ending.at(-1).beam.stops === pre.sfx.beam.stops + 1, {
        endingFrames: ending.length,
        firingInOutro: ending.filter((x) => x.laserFiring).length,
        first: pre.sfx.beam,
        last: ending.at(-1)?.beam,
      });
    }

    await h.startAt(3, { orbitalCannon: 1 });
    await h.game('god', true);
    const or = await record(15000, `(s.sfx.played.orbital ?? 0) > 0 && s.skills.find((k) => k.id === 'orbital')?.kind === 'cooling'`);
    const struck = or.findIndex((x, i) => i > 0 && n(x, 'orbital') > n(or[i - 1], 'orbital'));
    h.check('the orbital cannon sounds its blast on the frame it strikes', struck > 0 && or[struck - 1].orbital === 'active' && or[struck].orbital === 'cooling' && n(or.at(-1), 'orbital') - n(or[0], 'orbital') === 1, {
      before: or[struck - 1]?.orbital,
      at: or[struck]?.orbital,
      blasts: n(or.at(-1), 'orbital') - n(or[0], 'orbital'),
    });

    const castNames = Object.values(castSound);
    const covered = new Set();
    for (const [stage, id] of [[5, 'crimsonSeraph'], [10, 'voidEmpress']]) {
      const def = bosses[id];
      await h.startAt(stage);
      await h.game('god', true);
      await h.waitFor(`${id} in place`, (s) => s.boss?.stance === 'fighting', 12000);
      await h.game('bossPattern', null);
      for (const form of [0, 1]) {
        if (form === 1) {
          await h.game('bossHp', def.transform.atHpRatio - 0.02);
          await h.waitFor(`${id} second form`, (s) => s.boss.form === 1 && s.boss.stance === 'fighting', 10000);
        }
        for (const p of [...new Set(def.forms[form].phases.flatMap((ph) => ph.patterns))]) {
          const tier = motions[p];
          const name = castSound[tier];
          await h.game('bossHp', form === 0 ? 0.9 : 0.6);
          const before = await h.waitFor(`${id} holds still before ${p}`, (s) => s.boss.stance === 'fighting' && s.boss.motion.moves.length === 0, 8000);
          await h.game('bossPattern', p);
          const rec = await record(8000, `s.boss.motion.moves.some((m) => m.pattern === '${p}' && m.ms > 400)`);
          const done = await h.waitFor(`${p} settles`, (s) => s.boss.motion.moves.length === 0 && s.boss.stance === 'fighting', 8000);
          const deltas = Object.fromEntries(castNames.map((c) => [c, n(done.sfx, c) - n(before.sfx, c)]));
          h.check(`${def.forms[form].name}: ${p} (${tier}) plays ${name} once`, deltas[name] === 1 && castNames.every((c) => c === name || deltas[c] === 0), deltas);
          if (tier === 'ultimate') {
            const charge = rec.find((x) => x.stance === 'casting');
            h.check(`${def.forms[form].name}: ${p} sounds as the charge starts`, charge && n(charge, name) === n(before.sfx, name) + 1 && charge.castMsLeft > chargeMs[p] - 120, { castMsLeft: charge?.castMsLeft, chargeMs: chargeMs[p] });
          }
          covered.add(p);
        }
      }
    }
    h.check('every boss move was cast', covered.size === Object.keys(motions).length, { covered: [...covered] });
  },
};

// Close-ups of small HUD art need the canvas's full backing resolution.
const CONTEXT = { 'gunner-fan': { deviceScaleFactor: 2 }, 'boss-forms': { deviceScaleFactor: 2 }, 'skill-hud': { deviceScaleFactor: 2 }, items: { deviceScaleFactor: 2 }, movement: { deviceScaleFactor: 2 }, 'enemy-hp': { deviceScaleFactor: 2 }, 'shop-tooltip': { deviceScaleFactor: 2 }, 'trans-am': { deviceScaleFactor: 2 }, 'cut-in': { deviceScaleFactor: 2 }, voice: { deviceScaleFactor: 2 } };

const selected = names.includes('all') ? Object.keys(JOURNEYS).filter((n) => n !== 'doctor') : names;
const unknown = selected.filter((n) => !JOURNEYS[n]);
if (unknown.length) {
  console.error(`unknown journey(s): ${unknown.join(', ')}. Known: ${Object.keys(JOURNEYS).join(', ')}`);
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: ['--disable-audio-output'] });
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
  writeFileSync(join(outDir, 'log.json'), JSON.stringify({ journey: name, url: APP_URL, ok: !error, error, ...h.log }, null, 2));
  console.log(`${error ? 'FAIL' : 'PASS'} ${name}${error ? `: ${error}` : ''} -> ${outDir}`);
  if (error) failed++;
  await context.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
