#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
if (!runId) {
  console.error('usage: boss-shots.mjs <run-id> [--out <file>] [--against <file>] [--headed]');
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const out = resolve(flag('--out') ?? join(ROOT, '.verify', runId, 'evidence', 'boss-shots', 'record.json'));
const against = flag('--against');

function virtualWorld() {
  let seed = 1;
  let idSeed = 1;
  const mulberry = (s) => {
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Phaser's UUID() draws from Math.random for every Text texture, so a new HUD label would shift every later
  // gameplay draw. Those draws get a stream of their own.
  Math.random = () => {
    if (new Error().stack?.includes('UUID')) return mulberry((idSeed = (idSeed + 0x6d2b79f5) | 0));
    return mulberry((seed = (seed + 0x6d2b79f5) | 0));
  };
  let now = 0;
  performance.now = () => now;
  Date.now = () => 1_700_000_000_000 + now;
  let queue = [];
  window.requestAnimationFrame = (cb) => queue.push(cb);
  window.cancelAnimationFrame = () => {};
  window.__vt = {
    reseed: (s) => (seed = s),
    step: () => {
      // 1000/64 is exact in binary, so every frame delta is identical however many frames the page took to boot.
      // With 1000/60 the clock's rounding depended on that boot count, and a timer could fire a frame apart.
      now += 1000 / 64;
      const q = queue;
      queue = [];
      for (const cb of q) cb(now);
    },
  };
}

function inPageSegment({ frames, pin, until }) {
  const g = window.__game;
  const seen = window.__seen ?? (window.__seen = new Map());
  const shots = [];
  const boss = [];
  const foes = [];
  let posed = 0;
  const done = until && new Function('s', `return (${until})`);
  let f = 0;
  for (; f < frames; f++) {
    if (pin !== null) g.bossHp(pin);
    window.__vt.step();
    const s = g.state();
    for (const b of g.shots()) {
      const first = seen.get(b.id);
      if (!first) {
        const rec = { f, id: b.id, kind: b.kind, x: b.x, y: b.y };
        seen.set(b.id, rec);
        shots.push(rec);
      } else if (first.x1 === undefined) {
        first.x1 = b.x;
        first.y1 = b.y;
      }
    }
    boss.push([s.boss.x, s.boss.y, s.boss.stance, s.boss.form, s.boss.phase, s.boss.pattern ?? null]);
    foes.push(s.foeSpots.map((p) => [p.x, p.y]));
    const pose = s.boss.motion?.pose;
    if (pose && (pose.dx || pose.dy || pose.rot || pose.sx !== 1 || pose.sy !== 1)) posed++;
    if (done && done(s)) break;
  }
  const s = g.state();
  return { frames: f, shots, boss, foes, tally: s.tally, hp: s.run.hp, posed };
}

const browser = await chromium.launch({ channel: 'chrome', headless: !rest.includes('--headed') });
const page = await (await browser.newContext({ viewport: { width: 600, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.addInitScript(virtualWorld);
await page.goto(`http://127.0.0.1:${port}/`);
for (let i = 0; i < 2000; i++) {
  const up = await page.evaluate(() => {
    window.__vt.step();
    return window.__game?.state().scenes.includes('Title') ?? false;
  });
  if (up) break;
  await new Promise((r) => setTimeout(r, 5));
}

const plan = await page.evaluate(async () => {
  const { BOSSES } = await import('/src/core/stages.ts');
  const { PATTERNS } = await import('/src/game/patterns.ts');
  const cycleFrames = (phase) =>
    Math.ceil(((phase.patterns.reduce((ms, p) => ms + phase.patternGapMs + (PATTERNS[p].cast?.chargeMs ?? 0), 0) + 3000) * 64) / 1000);
  return Object.fromEntries(Object.entries(BOSSES).map(([id, def]) => [id, { def: JSON.parse(JSON.stringify(def)), frames: def.forms.map((f) => f.phases.map(cycleFrames)) }]));
});

const record = {};
for (const [stage, id] of [[5, 'crimsonSeraph'], [10, 'voidEmpress']]) {
  const { def, frames } = plan[id];
  await page.evaluate(([stage]) => {
    window.__seen = new Map();
    window.__vt.reseed(stage);
    window.__game.start(stage);
    window.__vt.step();
    window.__game.god(true);
  }, [stage]);
  const seg = (args) => page.evaluate(inPageSegment, { pin: null, until: null, ...args });
  const pinFor = (form, phase) => {
    const phases = def.forms[form].phases;
    const below = phases[phase + 1]?.hpRatio ?? (form === 0 ? def.transform.atHpRatio : 0.05);
    return (phases[phase].hpRatio + below) / 2;
  };
  const segments = {};
  segments.enter = await seg({ frames: 1200, pin: pinFor(0, 0), until: "s.boss.stance === 'fighting'" });
  for (let p = 0; p < def.forms[0].phases.length; p++) segments[`form0-phase${p}`] = await seg({ frames: frames[0][p], pin: pinFor(0, p) });
  await page.evaluate((r) => window.__game.bossHp(r), def.transform.atHpRatio - 0.02);
  segments.transform = await seg({ frames: 1200, until: "s.boss.stance === 'fighting' && s.boss.form === 1" });
  for (let p = 0; p < def.forms[1].phases.length; p++) segments[`form1-phase${p}`] = await seg({ frames: frames[1][p], pin: pinFor(1, p) });
  record[id] = segments;
}
await browser.close();
if (errors.length) {
  console.error('console errors:', errors);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(record));
for (const [id, segments] of Object.entries(record))
  for (const [name, s] of Object.entries(segments))
    console.log(`${id} ${name}: ${s.frames} frames (${s.posed} posed), ${s.shots.length} bullets, hits ${s.tally.hits}, contacts ${s.tally.contacts}, bossDealt ${s.tally.bossDealt}`);
console.log(`wrote ${out}`);

if (against) {
  const base = JSON.parse(readFileSync(resolve(against), 'utf8'));
  let diffs = 0;
  for (const [id, segments] of Object.entries(base))
    for (const [name, b] of Object.entries(segments)) {
      const a = record[id]?.[name];
      const parts = ['frames', 'shots', 'boss', 'foes', 'tally', 'hp'].filter((k) => JSON.stringify(a?.[k]) !== JSON.stringify(b[k]));
      if (parts.length === 0) {
        console.log(`SAME ${id} ${name}: ${b.shots.length} bullets over ${b.frames} frames`);
        continue;
      }
      diffs++;
      const i = (b.shots ?? []).findIndex((s, k) => JSON.stringify(s) !== JSON.stringify(a?.shots?.[k]));
      const shotDiffs = (b.shots ?? []).filter((s, k) => JSON.stringify(s) !== JSON.stringify(a?.shots?.[k])).length;
      console.log(`DIFF ${id} ${name}: ${parts.join(', ')}; ${shotDiffs} of ${b.shots.length} bullets differ` + (i >= 0 ? `; first #${i} was ${JSON.stringify(b.shots[i])} now ${JSON.stringify(a?.shots?.[i])}` : ''));
    }
  if (diffs) process.exit(1);
}
