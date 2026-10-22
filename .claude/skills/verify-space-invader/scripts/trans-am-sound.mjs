#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const [runId, ...rest] = process.argv.slice(2);
const outFlag = rest.indexOf('--out');
const copyTo = outFlag >= 0 ? resolve(rest[outFlag + 1]) : null;
if (!runId) {
  console.error('usage: trans-am-sound.mjs <run-id> [--out <dir>]');
  process.exit(2);
}
const port = readFileSync(join(ROOT, '.verify', runId, 'instance', 'port'), 'utf8').trim();
const outDir = join(ROOT, '.verify', runId, 'evidence', 'trans-am-sound-render');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/`);

const result = await page.evaluate(async () => {
  const { TransAmSound, layerBuses } = await import('/src/audio/transAmSound.ts');
  const { TRANS_AM_SOUND } = await import('/src/audio/transAmLayers.ts');
  const { TRANS_AM, activate, charging, tick } = await import('/src/core/transAm.ts');
  const { compile, playStep } = await import('/src/audio/synth.ts');
  const { MUSIC_VOLUME, TRACK_LEVEL, openLowpass } = await import('/src/audio/music.ts');
  const { blip } = await import('/src/audio/sfx.ts');
  const { VOICE_URLS, decodeLine, playLine } = await import('/src/audio/voice.ts');
  const { CUT_IN, SILENT_CUT_IN_MS } = await import('/src/core/cutIn.ts');
  const { deriveStats } = await import('/src/core/perks.ts');
  const RATE = 44100;
  const FRAME_SEC = 1 / 60;
  const PREVIEW_PEAK = 0.9;
  const LOUDNESS_WINDOW_SEC = 0.05;
  const PRESS_SEC = 0.5;
  const TAIL_SEC = 1.5;
  const HF_HZ = 2000;

  const windows = (data) => {
    const win = Math.round(RATE * LOUDNESS_WINDOW_SEC);
    const out = [];
    for (let i = 0; i + win <= data.length; i += win) {
      let w = 0;
      for (let j = i; j < i + win; j++) w += data[j] * data[j];
      out.push(Math.sqrt(w / win));
    }
    return out.sort((a, b) => a - b);
  };
  const stats = (data) => {
    let peak = 0;
    let sum = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    const w = windows(data);
    const at = (q) => +(w[Math.min(w.length - 1, Math.floor(q * w.length))] ?? 0).toFixed(4);
    return { peak: +peak.toFixed(4), rms: +Math.sqrt(sum / data.length).toFixed(4), loud95: at(0.95), loudMax: at(1) };
  };
  // A sound shorter than a loudness window is compared by its RMS over its own length.
  const ownRms = (data) => {
    let [start, end] = [0, data.length];
    while (end > 0 && Math.abs(data[end - 1]) < 1e-5) end--;
    while (start < end && Math.abs(data[start]) < 1e-5) start++;
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    return { sec: +((end - start) / RATE).toFixed(3), ownRms: +Math.sqrt(sum / Math.max(1, end - start)).toFixed(4) };
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
  const sum = (...stems) => Float32Array.from(stems[0], (_, i) => stems.reduce((s, d) => s + d[i], 0));
  const slice = (data, fromSec, toSec) => data.subarray(Math.round(fromSec * RATE), Math.round(toSec * RATE));

  const sfx = {};
  for (const name of ['pop', 'boom', 'hurt', 'buy', 'transAm', 'powerDown']) {
    const ctx = new OfflineAudioContext(1, RATE, RATE);
    blip(ctx, ctx.destination, name, 0);
    const data = (await ctx.startRendering()).getChannelData(0);
    sfx[name] = { ...stats(data), ...ownRms(data) };
  }

  const line = await decodeLine(new OfflineAudioContext(1, 1, RATE), VOICE_URLS[0]);
  if (typeof line === 'string') throw new Error(`voice line ${VOICE_URLS[0]}: ${line}`);
  const cutInSec = Math.max(SILENT_CUT_IN_MS, CUT_IN.dimMs + line.shoutAtMs) / 1000;
  const releaseSec = PRESS_SEC + cutInSec + FRAME_SEC;
  const seqSec = releaseSec + TRANS_AM.activeMs / 1000 + TAIL_SEC;

  const STEMS = ['release', 'hum', 'shot', 'tick', 'music', 'voice', 'sfx', 'openMusic'];
  const ctx = new OfflineAudioContext(STEMS.length, Math.ceil(seqSec * RATE), RATE);
  const merger = ctx.createChannelMerger(STEMS.length);
  merger.connect(ctx.destination);
  const stemOut = Object.fromEntries(
    STEMS.map((name, i) => {
      const g = ctx.createGain();
      g.channelCount = 1;
      g.channelCountMode = 'explicit';
      g.connect(merger, 0, i);
      return [name, g];
    }),
  );
  const buses = Object.fromEntries(Object.entries(layerBuses(ctx, ctx.destination)).map(([layer, bus]) => (bus.disconnect(), bus.connect(stemOut[layer]), [layer, bus])));

  const song = compile('boss1');
  const musicBus = (out) => {
    const g = ctx.createGain();
    g.gain.value = MUSIC_VOLUME * TRACK_LEVEL.boss1;
    g.connect(out);
    return g;
  };
  const lowpass = openLowpass(ctx);
  lowpass.connect(stemOut.music);
  const [muffled, open] = [musicBus(lowpass), musicBus(stemOut.openMusic)];
  for (let step = 0; step * song.stepSec < seqSec; step++) for (const bus of [muffled, open]) playStep(ctx, bus, song, step, step * song.stepSec);

  blip(ctx, stemOut.sfx, 'transAm', PRESS_SEC);
  const lineAtSec = PRESS_SEC + cutInSec - line.shoutAtMs / 1000;
  const lastSlice = line.slices.at(-1);
  const lineSec = lastSlice.lineAtSec + lastSlice.toSec - lastSlice.fromSec;
  playLine(ctx, stemOut.voice, line, lineAtSec);

  let now = releaseSec;
  let cutoff = lowpass.frequency.maxValue;
  lowpass.frequency.setValueAtTime(cutoff, 0);
  const rig = {
    ctx,
    buses,
    now: () => now,
    muffle: (hz, sec) => {
      lowpass.frequency.setValueAtTime(cutoff, now);
      cutoff = hz ?? lowpass.frequency.maxValue;
      lowpass.frequency.exponentialRampToValueAtTime(cutoff, now + sec);
    },
  };
  const sound = new TransAmSound(() => rig);
  const fireIntervalMs = deriveStats({}).fireIntervalMs * TRANS_AM.active.fireIntervalScale;
  let t = activate(charging(TRANS_AM.gaugeMax));
  let cooldownMs = 0;
  let volleys = 0;
  sound.release(volleys);
  // Mirrors World.update: the release before the first tick, then the gun, then the look.
  for (;;) {
    t = tick(t, FRAME_SEC * 1000);
    if (t.kind !== 'active') {
      blip(ctx, stemOut.sfx, 'powerDown', now);
      sound.endActive();
      break;
    }
    cooldownMs = Math.max(cooldownMs - FRAME_SEC * 1000, -FRAME_SEC * 1000);
    if (cooldownMs <= 0) {
      volleys++;
      cooldownMs += fireIntervalMs;
    }
    sound.update(t, volleys);
    now += FRAME_SEC;
  }
  const endSec = now;
  const rendered = await ctx.startRendering();
  const stem = Object.fromEntries(STEMS.map((name, i) => [name, rendered.getChannelData(i)]));

  const layerOnly = async (layer, drive) => {
    const c = new OfflineAudioContext(1, RATE, RATE);
    const b = layerBuses(c, c.destination);
    for (const [name, bus] of Object.entries(b)) if (name !== layer) bus.disconnect();
    let at = 0;
    drive(new TransAmSound(() => ({ ctx: c, buses: b, now: () => at, muffle: () => {} })), (sec) => (at = sec));
    const data = (await c.startRendering()).getChannelData(0);
    return { ...stats(data), ...ownRms(data) };
  };
  const releaseAlone = await layerOnly('release', (s) => s.release(0));
  const shotAlone = await layerOnly('shot', (s, go) => {
    s.release(0);
    go(0.5);
    s.update({ kind: 'active', msLeft: TRANS_AM.activeMs - 500 }, 1);
  });
  const tickAlone = await layerOnly('tick', (s, go) => {
    s.release(0);
    go(0.1);
    s.update({ kind: 'active', msLeft: 1500 }, 0);
  });

  const loopPeak = async (id) => {
    const tune = compile(id);
    const c = new OfflineAudioContext(1, Math.ceil(tune.steps * tune.stepSec * RATE), RATE);
    const g = c.createGain();
    g.gain.value = MUSIC_VOLUME * TRACK_LEVEL[id];
    g.connect(c.destination);
    for (let step = 0; step < tune.steps; step++) playStep(c, g, tune, step, step * tune.stepSec);
    return stats((await c.startRendering()).getChannelData(0));
  };
  const loops = { boss1: await loopPeak('boss1'), boss2: await loopPeak('boss2') };

  const hfEnergy = async (cutoffHz) => {
    const sec = song.steps * song.stepSec;
    const c = new OfflineAudioContext(2, Math.ceil(sec * RATE), RATE);
    const merge = c.createChannelMerger(2);
    merge.connect(c.destination);
    const lp = openLowpass(c);
    if (cutoffHz) lp.frequency.value = cutoffHz;
    const hp = [c.createBiquadFilter(), c.createBiquadFilter()];
    for (const f of hp) Object.assign(f, { type: 'highpass' }).frequency.value = HF_HZ;
    const g = c.createGain();
    g.gain.value = MUSIC_VOLUME * TRACK_LEVEL.boss1;
    g.connect(lp);
    lp.connect(merge, 0, 0);
    lp.connect(hp[0]).connect(hp[1]).connect(merge, 0, 1);
    for (let step = 0; step < song.steps; step++) playStep(c, g, song, step, step * song.stepSec);
    const r = await c.startRendering();
    return { full: stats(r.getChannelData(0)), hf: stats(r.getChannelData(1)) };
  };
  const [openHf, muffledHf] = [await hfEnergy(null), await hfEnergy(TRANS_AM_SOUND.muffle.cutoffHz)];

  const active = (data) => slice(data, releaseSec, endSec);
  const humSteady = slice(stem.hum, releaseSec + TRANS_AM_SOUND.hum.fadeInMs / 1000, endSec);
  const full = sum(stem.release, stem.hum, stem.shot, stem.tick, stem.music, stem.voice, stem.sfx);
  const before = sum(stem.openMusic, stem.voice, stem.sfx);
  const previewGain = PREVIEW_PEAK / Math.max(stats(full).peak, stats(before).peak);
  const tickStarts = [];
  for (let i = 1; i < stem.tick.length; i++) if (stem.tick[i] !== 0 && stem.tick[i - 1] === 0 && (tickStarts.length === 0 || i / RATE - tickStarts.at(-1) > 0.1)) tickStarts.push(i / RATE);
  const files = {
    'transam-sequence.wav': wav(full),
    'transam-sequence-preview.wav': wav(full, previewGain),
    'transam-before-preview.wav': wav(before, previewGain),
  };
  for (const name of ['release', 'hum', 'shot', 'tick']) files[`stem-${name}-preview.wav`] = wav(stem[name], PREVIEW_PEAK / stats(stem[name]).peak);
  files['boss1-open.wav'] = wav(active(stem.openMusic));
  files['boss1-muffled.wav'] = wav(active(stem.music));
  return {
    timeline: { pressSec: PRESS_SEC, releaseSec: +releaseSec.toFixed(3), depletedSec: +endSec.toFixed(3), seqSec: +seqSec.toFixed(3), voice: VOICE_URLS[0], cutInSec, fireIntervalMs, volleys },
    tickStartsAfterReleaseMs: tickStarts.map((s) => Math.round((s - releaseSec) * 1000)),
    sfx,
    voice: stats(slice(stem.voice, lineAtSec, lineAtSec + lineSec)),
    music: { boss1: loops.boss1, boss2: loops.boss2, boss1Muffled: stats(active(stem.music)), boss1OpenSameWindow: stats(active(stem.openMusic)) },
    layers: {
      release: { ...releaseAlone },
      hum: { ...stats(active(stem.hum)), steadyLoud95: stats(humSteady).loud95 },
      shot: { ...shotAlone, train: stats(active(stem.shot)) },
      tick: { ...tickAlone, train: stats(stem.tick) },
    },
    hf: { hz: HF_HZ, cutoffHz: TRANS_AM_SOUND.muffle.cutoffHz, open: openHf, muffled: muffledHf },
    mix: { full: stats(full), before: stats(before), fullActive: stats(active(full)), beforeActive: stats(active(before)) },
    files,
  };
});
await browser.close();

const db = (a, b) => +(20 * Math.log10(a / b)).toFixed(1);
const { sfx, layers, music, voice, hf, mix } = result;
const loudestSfx = Object.entries(sfx).sort(([, a], [, b]) => b.loudMax - a.loudMax)[0];
const otherTransAm = { sweep: sfx.transAm.loudMax, powerDown: sfx.powerDown.loudMax, hum: layers.hum.loudMax, tick: layers.tick.ownRms, shot: layers.shot.loudMax };
const worstPeaks = { boss2Music: music.boss2.peak, hum: layers.hum.peak, release: layers.release.peak, loudestSfx: Math.max(...Object.values(sfx).map((s) => s.peak)), voice: voice.peak };
const peakSum = +Object.values(worstPeaks).reduce((a, b) => a + b, 0).toFixed(4);
const hfDropDb = db(hf.muffled.hf.rms, hf.open.hf.rms);
const fullDropDb = db(hf.muffled.full.loud95, hf.open.full.loud95);
const failures = errors.map((e) => `console error: ${e}`);
const want = (ok, msg) => ok || failures.push(msg);
want(layers.release.loudMax >= 0.8 * loudestSfx[1].loudMax && layers.release.loudMax <= 1.3 * loudestSfx[1].loudMax, `release loudMax ${layers.release.loudMax} is not about the loudest sfx, ${loudestSfx[0]} at ${loudestSfx[1].loudMax}`);
want(Object.values(otherTransAm).every((l) => layers.release.loudMax > l), `release loudMax ${layers.release.loudMax} is not the loudest TRANS-AM sound, ${JSON.stringify(otherTransAm)}`);
want(layers.hum.loud95 < 0.75 * music.boss1.loud95, `hum loud95 ${layers.hum.loud95} is not clearly under boss1 at ${music.boss1.loud95}`);
want(layers.hum.loud95 < 0.5 * voice.loud95, `hum loud95 ${layers.hum.loud95} is not clearly under the voice at ${voice.loud95}`);
want(layers.shot.peak < sfx.pop.peak && layers.shot.ownRms < sfx.pop.ownRms, `shot peak ${layers.shot.peak} / rms ${layers.shot.ownRms} is not under pop's ${sfx.pop.peak} / ${sfx.pop.ownRms}`);
want(result.tickStartsAfterReleaseMs.length === 5 && result.tickStartsAfterReleaseMs.every((ms) => ms >= 6000 - 1500 - 20), `ticks at ${result.tickStartsAfterReleaseMs} ms after the release are not five inside the last 1.5 s`);
want(peakSum < 1, `boss2 music, hum, release, the loudest sfx and the voice peak at ${peakSum} together`);
want(mix.full.peak < 1, `the rendered sequence peaks at ${mix.full.peak}`);
want(hfDropDb <= -12, `the muffle only drops boss1 above ${hf.hz} Hz by ${hfDropDb} dB`);

const report = { ...result, files: undefined, worstPeaks, peakSum, hfDropDb, fullDropDb, failures };
for (const [name, b64] of Object.entries(result.files)) writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'));
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (copyTo) {
  mkdirSync(copyTo, { recursive: true });
  for (const name of [...Object.keys(result.files), 'report.json']) copyFileSync(join(outDir, name), join(copyTo, name));
}

const row = (name, s) => `${name.padEnd(14)} peak ${String(s.peak).padEnd(7)} loud95 ${String(s.loud95).padEnd(7)} loudMax ${String(s.loudMax).padEnd(7)}${s.ownRms !== undefined ? ` ownRms ${s.ownRms} over ${s.sec}s` : ''}`;
console.log(`timeline ${JSON.stringify(result.timeline)}`);
for (const [n, s] of Object.entries(sfx)) console.log(row(`sfx ${n}`, s));
console.log(row('voice', voice));
console.log(row('boss1', music.boss1));
console.log(row('release hit', layers.release));
console.log(`${row('hum', layers.hum)} steady loud95 ${layers.hum.steadyLoud95}  (${db(layers.hum.loud95, music.boss1.loud95)} dB vs boss1, ${db(layers.hum.loud95, voice.loud95)} dB vs voice)`);
console.log(row('shot zip', layers.shot));
console.log(row('shot train', layers.shot.train));
console.log(`${row('one tick', layers.tick)} at ${result.tickStartsAfterReleaseMs.join(', ')} ms after the release`);
console.log(`music lowpass ${hf.cutoffHz} Hz: boss1 above ${hf.hz} Hz rms ${hf.open.hf.rms} -> ${hf.muffled.hf.rms} (${hfDropDb} dB), full-band loud95 ${hf.open.full.loud95} -> ${hf.muffled.full.loud95} (${fullDropDb} dB)`);
console.log(`worst-case peak sum ${peakSum} ${JSON.stringify(worstPeaks)}; rendered sequence peak ${mix.full.peak} (before ${mix.before.peak}), active-window loud95 ${mix.fullActive.loud95} (before ${mix.beforeActive.loud95})`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`${failures.length ? 'FAIL' : 'PASS'} trans-am-sound -> ${outDir}${copyTo ? ` and ${copyTo}` : ''}`);
process.exit(failures.length ? 1 : 0);
