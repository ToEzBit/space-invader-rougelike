import { freqOf, parseBars, type NoteEvent } from './score';
import { TRACKS, type Channel, type Track, type TrackId, type Voice } from './tracks';

export type Song = {
  id: TrackId;
  stepSec: number;
  steps: number;
  channels: { channel: Channel; byStep: readonly (NoteEvent | undefined)[] }[];
};

export function compile(id: TrackId, track: Track = TRACKS[id]): Song {
  const stepsPerBar = track.stepsPerBeat * track.beatsPerBar;
  const steps = (track.channels[0]?.bars.length ?? 0) * stepsPerBar;
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

// Plays whatever starts on this step of the loop. The live scheduler and the offline render both come through here.
export function playStep(ctx: BaseAudioContext, out: AudioNode, song: Song, step: number, at: number): void {
  const kit = kitFor(ctx);
  for (const { channel, byStep } of song.channels) {
    const e = byStep[step % song.steps];
    if (e) VOICES[channel.voice](kit, out, e, at, e.steps * song.stepSec, channel.gain);
  }
}

type Kit = { ctx: BaseAudioContext; pulse25: PeriodicWave; pulse12: PeriodicWave; noise: AudioBuffer };
type Play = (kit: Kit, out: AudioNode, e: NoteEvent, at: number, dur: number, gain: number) => void;

const VOICES: Record<Voice, Play> = {
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
  // An accented hat rings open.
  hat: (kit, out, e, at, _dur, gain) => noise(kit, out, e, at, e.accent ? 0.15 : 0.035, gain * (e.accent ? 1.2 : 1), 'highpass', 7000),
};

const kits = new WeakMap<BaseAudioContext, Kit>();

function kitFor(ctx: BaseAudioContext): Kit {
  let kit = kits.get(ctx);
  if (!kit) {
    kit = { ctx, pulse25: pulse(ctx, 0.25), pulse12: pulse(ctx, 0.125), noise: whiteNoise(ctx) };
    kits.set(ctx, kit);
  }
  return kit;
}

// The Fourier series of a pulse wave high for `duty` of each period.
function pulse(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, new Float32Array(n));
}

// Seeded so two renders of a track come out the same.
function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1d;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = seed / 0x80000000 - 1;
  }
  return buffer;
}

function tones(kit: Kit, out: AudioNode, wave: OscillatorType | PeriodicWave, e: NoteEvent, at: number, dur: number, gain: number): void {
  const { ctx } = kit;
  const end = at + dur;
  const env = ctx.createGain();
  // A quick attack, a slight sag over the note, and a short release, so repeated notes stay separate.
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.003);
  env.gain.linearRampToValueAtTime(gain * 0.7, Math.max(at + 0.004, end - 0.015));
  env.gain.linearRampToValueAtTime(0, end);
  env.connect(out);
  for (const midi of e.midis) {
    const osc = ctx.createOscillator();
    if (wave instanceof PeriodicWave) osc.setPeriodicWave(wave);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freqOf(midi), at);
    osc.connect(env);
    osc.start(at);
    osc.stop(end + 0.01);
  }
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
  // A different stretch of the noise per step, so hits are not identical clicks.
  src.start(at, (e.step * 0.137) % 0.8);
  src.stop(at + sec + 0.01);
}
