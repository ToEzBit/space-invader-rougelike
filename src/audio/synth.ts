import { freqOf, parseBars, type NoteEvent } from './score';
import { TRACKS, type Channel, type ScoreId, type Track, type Voice } from './tracks';

export type Song = {
  id: ScoreId;
  stepSec: number;
  steps: number;
  channels: { channel: Channel; byStep: readonly (NoteEvent | undefined)[] }[];
};

export function compile(id: ScoreId, track: Track = TRACKS[id]): Song {
  const stepsPerBar = track.stepsPerBeat * track.beatsPerBar;
  const bars = new Set(track.channels.map((c) => c.bars.length));
  if (bars.size !== 1) throw new Error(`${id}: channels disagree on the loop length (${[...bars].join(', ')} bars)`);
  const steps = [...bars][0]! * stepsPerBar;
  return {
    id,
    stepSec: 60 / track.bpm / track.stepsPerBeat,
    steps,
    channels: track.channels.map((channel) => {
      const byStep: (NoteEvent | undefined)[] = new Array(steps);
      for (const e of parseBars(channel.bars, stepsPerBar)) byStep[e.step] = e;
      return { channel, byStep };
    }),
  };
}

export function playStep(ctx: BaseAudioContext, out: AudioNode, song: Song, step: number, at: number): void {
  const kit = kitFor(ctx);
  for (const { channel, byStep } of song.channels) {
    const e = byStep[step % song.steps];
    if (e) VOICES[channel.voice](kit, out, e, at, e.steps * song.stepSec, channel.gain);
  }
}

type Kit = { ctx: BaseAudioContext; pulse50: PeriodicWave; pulse25: PeriodicWave; pulse12: PeriodicWave; noise: AudioBuffer };
type Play = (kit: Kit, out: AudioNode, e: NoteEvent, at: number, dur: number, gain: number) => void;

const OPEN_HAT_SEC = 0.15;
const CLOSED_HAT_SEC = 0.035;
const ATTACK_SEC = 0.003;
const RELEASE_SEC = 0.015;
const SUSTAIN_LEVEL = 0.7;
// The vibrato voice sings: a held note starts plain, then wavers once it has sounded a moment.
const VIBRATO = { hz: 5.5, cents: 22, delaySec: 0.12, riseSec: 0.2 };

const VOICES: Record<Voice, Play> = {
  pulse50: (kit, out, e, at, dur, gain) => tones(kit, out, kit.pulse50, e, at, dur, gain),
  vibrato: (kit, out, e, at, dur, gain) => tones(kit, out, kit.pulse50, e, at, dur, gain, true),
  pulse25: (kit, out, e, at, dur, gain) => tones(kit, out, kit.pulse25, e, at, dur, gain),
  pulse12: (kit, out, e, at, dur, gain) => tones(kit, out, kit.pulse12, e, at, dur, gain),
  triangle: (kit, out, e, at, dur, gain) => tones(kit, out, 'triangle', e, at, dur, gain),
  kick: ({ ctx }, out, e, at, _dur, gain) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.1);
    decay(ctx, osc, out, at, 0.16, gain * (e.accent ? 1.3 : 1));
  },
  snare: (kit, out, e, at, _dur, gain) => {
    const g = gain * (e.accent ? 1.3 : 1);
    noise(kit, out, e, at, 0.13, g, 'bandpass', 2400);
    const body = kit.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(200, at);
    body.frequency.exponentialRampToValueAtTime(130, at + 0.05);
    decay(kit.ctx, body, out, at, 0.06, g * 0.8);
  },
  hat: (kit, out, e, at, _dur, gain) => noise(kit, out, e, at, e.accent ? OPEN_HAT_SEC : CLOSED_HAT_SEC, gain * (e.accent ? 1.2 : 1), 'highpass', 7000),
};

const kits = new WeakMap<BaseAudioContext, Kit>();

// Seeded, because a stage must never draw from Math.random for sound: the boss replay owns its order.
export function seededNoise(ctx: BaseAudioContext): AudioBuffer {
  return kitFor(ctx).noise;
}

function kitFor(ctx: BaseAudioContext): Kit {
  let kit = kits.get(ctx);
  if (!kit) {
    kit = { ctx, pulse50: pulse(ctx, 0.5), pulse25: pulse(ctx, 0.25), pulse12: pulse(ctx, 0.125), noise: seededWhiteNoise(ctx) };
    kits.set(ctx, kit);
  }
  return kit;
}

function pulse(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, new Float32Array(n));
}

function seededWhiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 0x80000000 - 1;
  }
  return buffer;
}

function tones(kit: Kit, out: AudioNode, wave: OscillatorType | PeriodicWave, e: NoteEvent, at: number, dur: number, gain: number, vibrato = false): void {
  const { ctx } = kit;
  const end = at + dur;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + ATTACK_SEC);
  env.gain.linearRampToValueAtTime(gain * SUSTAIN_LEVEL, Math.max(at + ATTACK_SEC + 0.001, end - RELEASE_SEC));
  env.gain.linearRampToValueAtTime(0, end);
  env.connect(out);
  for (const midi of e.midis) {
    const osc = ctx.createOscillator();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freqOf(midi), at);
    if (vibrato && dur > VIBRATO.delaySec) waver(ctx, osc.frequency, freqOf(midi), at, end);
    osc.connect(env);
    osc.start(at);
    osc.stop(end + 0.01);
  }
}

function waver(ctx: BaseAudioContext, frequency: AudioParam, hz: number, at: number, end: number): void {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = VIBRATO.hz;
  const depth = ctx.createGain();
  const from = at + VIBRATO.delaySec;
  depth.gain.setValueAtTime(0, at);
  depth.gain.setValueAtTime(0, from);
  depth.gain.linearRampToValueAtTime(hz * (2 ** (VIBRATO.cents / 1200) - 1), Math.min(end, from + VIBRATO.riseSec));
  lfo.connect(depth).connect(frequency);
  lfo.start(at);
  lfo.stop(end + 0.01);
}

function decay(ctx: BaseAudioContext, src: AudioScheduledSourceNode, out: AudioNode, at: number, sec: number, gain: number): void {
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.001, at + sec);
  src.connect(env).connect(out);
  src.start(at);
  src.stop(at + sec + 0.01);
}

function noise(kit: Kit, out: AudioNode, e: NoteEvent, at: number, sec: number, gain: number, type: BiquadFilterType, hz: number): void {
  const { ctx } = kit;
  const src = ctx.createBufferSource();
  src.buffer = kit.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = hz;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.001, at + sec);
  src.connect(filter).connect(env).connect(out);
  src.start(at, noiseOffset(e.step));
  src.stop(at + sec + 0.01);
}

function noiseOffset(step: number): number {
  return (step * 0.137) % 0.8;
}
