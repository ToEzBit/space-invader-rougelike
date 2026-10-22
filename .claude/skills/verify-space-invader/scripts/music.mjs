#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId] = process.argv.slice(2);
if (!runId) {
  console.error('usage: music.mjs <run-id>');
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const outDir = join(ROOT, '.verify', runId, 'evidence', 'music');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async () => {
  const { compile, playStep } = await import('/src/audio/synth.ts');
  const { TRACKS } = await import('/src/audio/tracks.ts');
  const { MUSIC_VOLUME } = await import('/src/audio/music.ts');
  const { blip } = await import('/src/audio/sfx.ts');
  const { BOSS1_PRE_BUS_LOUD95, loud95 } = await import('/src/audio/loudness.ts');
  const RATE = 44100;
  const LOUDNESS_WINDOW_SEC = 0.05;
  const PREVIEW_PEAK = 0.9;

  const windowedRms = (data) => {
    const win = Math.round(RATE * LOUDNESS_WINDOW_SEC);
    const windows = [];
    for (let i = 0; i + win <= data.length; i += win) {
      let w = 0;
      for (let j = i; j < i + win; j++) w += data[j] * data[j];
      windows.push(Math.sqrt(w / win));
    }
    windows.sort((a, b) => a - b);
    const at = (q) => +(windows[Math.min(windows.length - 1, Math.floor(q * windows.length))] ?? 0).toFixed(4);
    return { loud95: at(0.95), loudMax: at(1) };
  };

  const stats = (data) => {
    let peak = 0;
    let sum = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / data.length).toFixed(4), ...windowedRms(data) };
  };

  const render = async (id, track) => {
    const song = compile(id, track);
    const sec = song.steps * song.stepSec;
    const ctx = new OfflineAudioContext(1, Math.ceil(sec * RATE), RATE);
    const bus = ctx.createGain();
    bus.gain.value = MUSIC_VOLUME;
    bus.connect(ctx.destination);
    for (let step = 0; step < song.steps; step++) playStep(ctx, bus, song, step, step * song.stepSec);
    return { sec, data: (await ctx.startRendering()).getChannelData(0) };
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

  const sfx = {};
  for (const name of ['pop', 'boom', 'hurt', 'buy']) {
    const ctx = new OfflineAudioContext(1, RATE, RATE);
    blip(ctx, ctx.destination, name, 0);
    const data = (await ctx.startRendering()).getChannelData(0);
    let end = data.length;
    while (end > 0 && Math.abs(data[end - 1]) < 1e-4) end--;
    sfx[name] = { ...stats(data.subarray(0, end)), sec: +(end / RATE).toFixed(3) };
  }

  const tracks = {};
  let boss1PreBusLoud95 = null;
  for (const [id, track] of Object.entries(TRACKS)) {
    const { sec, data } = await render(id, track);
    if (id === 'boss1') boss1PreBusLoud95 = loud95([data], RATE) / MUSIC_VOLUME;
    const channels = {};
    for (const channel of track.channels) channels[channel.name] = stats((await render(id, { ...track, channels: [channel] })).data);
    const bars = track.channels[0].bars.length;
    tracks[id] = { title: track.title, bpm: track.bpm, bars, sec: +sec.toFixed(2), ...stats(data), channels, wav: wav(data), preview: wav(data, PREVIEW_PEAK / stats(data).peak) };
  }
  return { musicVolume: MUSIC_VOLUME, sfx, tracks, boss1PreBusLoud95, BOSS1_PRE_BUS_LOUD95 };
});
await browser.close();

const failures = [...errors.map((e) => `console error: ${e}`)];
const [loudestSfx, { peak: loudestSfxPeak }] = Object.entries(result.sfx).sort(([, a], [, b]) => b.peak - a.peak)[0];
const sfxLoud = Object.values(result.sfx).map((s) => s.loudMax).sort((a, b) => a - b);
const medianSfxLoud = sfxLoud[Math.floor(sfxLoud.length / 2)];
const [quietestSfx, { loudMax: quietestSfxLoud }] = Object.entries(result.sfx).sort(([, a], [, b]) => a.loudMax - b.loudMax)[0];
const report = { musicVolume: result.musicVolume, sfx: result.sfx, medianSfxLoud, boss1PreBusLoud95: result.boss1PreBusLoud95, tracks: {} };
const REFERENCE_DRIFT = 0.02;
if (Math.abs(result.boss1PreBusLoud95 / result.BOSS1_PRE_BUS_LOUD95 - 1) > REFERENCE_DRIFT)
  failures.push(`boss1 renders at a pre-bus loud95 of ${result.boss1PreBusLoud95.toFixed(4)} but BOSS1_PRE_BUS_LOUD95 in src/audio/loudness.ts is ${result.BOSS1_PRE_BUS_LOUD95}, so file tracks would be matched to the wrong loudness`);
for (const [id, t] of Object.entries(result.tracks)) {
  const { wav, preview, ...rest } = t;
  writeFileSync(join(outDir, `${id}.wav`), Buffer.from(wav, 'base64'));
  writeFileSync(join(outDir, `${id}-preview.wav`), Buffer.from(preview, 'base64'));
  const silent = Object.entries(t.channels).filter(([, c]) => c.rms < 1e-4).map(([name]) => name);
  if (silent.length) failures.push(`${id}: silent channel(s) ${silent.join(', ')}`);
  if (t.loud95 >= quietestSfxLoud) failures.push(`${id}: loud95 ${t.loud95} is not under the quietest sfx, ${quietestSfx} at ${quietestSfxLoud}`);
  if (t.peak + loudestSfxPeak >= 1) failures.push(`${id}: peak ${t.peak} plus the ${loudestSfx} sfx ${loudestSfxPeak} can clip`);
  report.tracks[id] = { ...rest, loudVsSfx: +(t.loud95 / medianSfxLoud).toFixed(2), wav: join(outDir, `${id}.wav`) };
  console.log(
    `${id.padEnd(7)} ${t.title.padEnd(20)} ${t.bpm} bpm  ${t.bars} bars  ${t.sec}s  peak ${t.peak}  rms ${t.rms}  loud95 ${t.loud95} (${report.tracks[id].loudVsSfx}x the median sfx)  channels ${Object.entries(t.channels).map(([n, c]) => `${n}:${c.peak}/${c.rms}`).join(' ')}`,
  );
}
console.log(`boss1 pre-bus loud95 ${result.boss1PreBusLoud95.toFixed(4)} (BOSS1_PRE_BUS_LOUD95 ${result.BOSS1_PRE_BUS_LOUD95}, the target file tracks are matched to)`);
console.log(`sfx ${Object.entries(result.sfx).map(([n, s]) => `${n}: peak ${s.peak} loudMax ${s.loudMax} ${s.sec}s`).join(' | ')}`);
writeFileSync(join(outDir, 'report.json'), JSON.stringify({ ...report, failures }, null, 2));
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} music -> ${outDir}`);
process.exit(failures.length ? 1 : 0);
