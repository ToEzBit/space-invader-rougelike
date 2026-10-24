#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId] = process.argv.slice(2);
if (!runId) {
  console.error('usage: sfx.mjs <run-id>');
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const outDir = join(ROOT, '.verify', runId, 'evidence', 'sfx-render');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async () => {
  const { blip } = await import('/src/audio/sfx.ts');
  const { SOUNDS, CAST_PITCH, recipeMs, shotPitch } = await import('/src/audio/sfxRecipes.ts');
  const { loud95 } = await import('/src/audio/loudness.ts');
  const { compile, playStep } = await import('/src/audio/synth.ts');
  const { TRACKS } = await import('/src/audio/tracks.ts');
  const { MUSIC_VOLUME, TRACK_LEVEL } = await import('/src/audio/music.ts');
  const { deriveStats, OVERDRIVE_CALM_MS, PERKS } = await import('/src/core/perks.ts');
  const { withBuffs } = await import('/src/core/items.ts');
  const { fireInterval } = await import('/src/game/volley.ts');
  const RATE = 44100;
  const WINDOW = Math.round(RATE * 0.05);
  const FRAME_SEC = 1 / 60;
  const PREVIEW_PEAK = 0.9;

  // The loudest 50 ms anywhere, sliding by 1 ms over the sound padded with silence, so a sound shorter
  // than one window still gets one.
  const loudMax = (data) => {
    const padded = new Float32Array(data.length + WINDOW);
    padded.set(data);
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += padded[i] ** 2;
    let best = sum;
    const hop = Math.round(RATE / 1000);
    for (let i = WINDOW; i < padded.length; i++) {
      sum += padded[i] ** 2 - padded[i - WINDOW] ** 2;
      if ((i - WINDOW) % hop === 0) best = Math.max(best, sum);
    }
    return Math.sqrt(Math.max(0, best) / WINDOW);
  };

  const trim = (data) => {
    let end = data.length;
    while (end > 0 && Math.abs(data[end - 1]) < 1e-4) end--;
    return data.subarray(0, end);
  };

  const stats = (all) => {
    const data = trim(all);
    let peak = 0;
    let sum = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const r = (x) => +x.toFixed(4);
    return { sec: +(data.length / RATE).toFixed(3), peak: r(peak), ownRms: r(Math.sqrt(sum / Math.max(1, data.length))), loud95: r(loud95([data], RATE)), loudMax: r(loudMax(data)) };
  };

  const wav = (data, gain = 1) => {
    const bytes = new Uint8Array(44 + data.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF');
    view.setUint32(4, 36 + data.length * 2, true);
    text(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, data.length * 2, true);
    data.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v * gain)) * 0x7fff, true));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  const render = async (sec, draw) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(sec * RATE), RATE);
    draw(ctx);
    return (await ctx.startRendering()).getChannelData(0);
  };

  const renders = {};
  const keep = (name, data, extra = {}) => {
    const s = stats(data);
    renders[name] = { ...s, ...extra, wav: wav(data), preview: s.peak > 0 ? wav(data, PREVIEW_PEAK / s.peak) : null };
  };

  for (const name of Object.keys(SOUNDS)) keep(name, await render(recipeMs(SOUNDS[name]) / 1000 + 0.1, (ctx) => blip(ctx, ctx.destination, name, 0)), { kind: 'sound', recipeMs: recipeMs(SOUNDS[name]) });
  for (const [boss, pitch] of Object.entries(CAST_PITCH))
    for (const name of ['castLight', 'castHeavy', 'castUltimate'])
      keep(`${name}-${boss}`, await render(recipeMs(SOUNDS[name]) / 1000 + 0.1, (ctx) => blip(ctx, ctx.destination, name, 0, pitch)), { kind: 'cast', pitch });

  // Gun volleys land on frames: each one fires on the first frame its cooldown has run out.
  const gun = async (intervalMs, sec) => {
    const at = [];
    let cooldown = 0;
    for (let t = 0; t < sec; t += FRAME_SEC) {
      cooldown -= FRAME_SEC * 1000;
      if (cooldown > 0) continue;
      at.push(t);
      cooldown += intervalMs;
    }
    return render(sec + 0.1, (ctx) => at.forEach((t, i) => blip(ctx, ctx.destination, 'shot', t, shotPitch(i))));
  };
  const maxed = deriveStats({ hairTrigger: PERKS.hairTrigger.maxLevel, overdrive: PERKS.overdrive.maxLevel });
  const fastestMs = fireInterval(withBuffs(maxed, ['overclock']), OVERDRIVE_CALM_MS);
  const overclockMs = fireInterval(withBuffs(deriveStats({}), ['overclock']), 0);
  keep('gun-fastest', await gun(fastestMs, 3), { kind: 'gun', intervalMs: +fastestMs.toFixed(2) });
  keep('gun-overclock', await gun(overclockMs, 3), { kind: 'gun', intervalMs: +overclockMs.toFixed(2) });

  const tracks = {};
  for (const [id, track] of Object.entries(TRACKS)) {
    if (!(TRACK_LEVEL[id] > 1)) continue;
    const song = compile(id, track);
    const data = await render(song.steps * song.stepSec, (ctx) => {
      const bus = ctx.createGain();
      bus.gain.value = MUSIC_VOLUME * TRACK_LEVEL[id];
      bus.connect(ctx.destination);
      for (let step = 0; step < song.steps; step++) playStep(ctx, bus, song, step, step * song.stepSec);
    });
    tracks[id] = stats(data);
  }
  return { renders, tracks };
});
await browser.close();

const { renders, tracks } = result;
const failures = errors.map((e) => `console error: ${e}`);
const [loudTrack, { peak: trackPeak }] = Object.entries(tracks).sort(([, a], [, b]) => b.peak - a.peak)[0];
const pop = renders.pop;
const bossLoud = Math.max(...Object.values(tracks).map((t) => t.loud95));
const OVER_BOSS_MUSIC = 1.5;
const LASER_OVER_POP = 1.6;
const report = { tracks, loudestBossTrack: loudTrack, renders: {} };
console.log(`${'name'.padEnd(26)} ${'sec'.padStart(6)} ${'peak'.padStart(7)} ${'ownRms'.padStart(7)} ${'loud95'.padStart(7)} ${'loudMax'.padStart(7)}  vs pop loudMax  +${loudTrack} peak`);
for (const [name, r] of Object.entries(renders)) {
  const { wav, preview, ...rest } = r;
  const file = join(outDir, `${name}.wav`);
  writeFileSync(file, Buffer.from(wav, 'base64'));
  if (preview) writeFileSync(join(outDir, `${name}-preview.wav`), Buffer.from(preview, 'base64'));
  const headroom = +(r.peak + trackPeak).toFixed(4);
  report.renders[name] = { ...rest, vsPop: +(r.loudMax / pop.loudMax).toFixed(2), peakWithBossTrack: headroom, wav: file };
  console.log(
    `${name.padEnd(26)} ${r.sec.toFixed(3).padStart(6)} ${r.peak.toFixed(4).padStart(7)} ${r.ownRms.toFixed(4).padStart(7)} ${r.loud95.toFixed(4).padStart(7)} ${r.loudMax.toFixed(4).padStart(7)}  ${report.renders[name].vsPop.toFixed(2).padStart(14)}  ${headroom}${r.intervalMs ? `  (${r.intervalMs} ms volleys)` : ''}`,
  );
  if (r.peak < 1e-3) failures.push(`${name} renders silent (peak ${r.peak})`);
  if (headroom >= 1) failures.push(`${name}: peak ${r.peak} plus ${loudTrack}'s ${trackPeak} can clip`);
  if (r.kind === 'sound' && r.sec * 1000 > r.recipeMs + 20) failures.push(`${name} sounds for ${r.sec}s, past its recipe's ${r.recipeMs} ms`);
  if (/^cast/.test(name) && r.loudMax < OVER_BOSS_MUSIC * bossLoud) failures.push(`${name}: loudMax ${r.loudMax} is not ${OVER_BOSS_MUSIC} times the boss music's loud95 ${bossLoud}, and it only plays over that music`);
}
const shot = renders.shot;
if (!(shot.loudMax < pop.loudMax && shot.peak < pop.peak)) failures.push(`shot loudMax ${shot.loudMax} / peak ${shot.peak} is not under pop's ${pop.loudMax} / ${pop.peak}`);
const laser = renders.laser;
if (!(laser.loudMax < LASER_OVER_POP * pop.loudMax)) failures.push(`laser loudMax ${laser.loudMax} is not under ${LASER_OVER_POP} times pop's ${pop.loudMax}, and it plays on every beam, every few seconds`);
for (const [id, t] of Object.entries(tracks)) console.log(`${id} at its in-game level: peak ${t.peak} loud95 ${t.loud95}`);
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ ...report, failures }, null, 2));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} sfx -> ${outDir}`);
process.exit(failures.length ? 1 : 0);
