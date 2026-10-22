import { audioContext } from './context';
import { SOUNDS, type Layer, type Sound } from './sfxRecipes';
import { seededNoise } from './synth';

export type { Sound } from './sfxRecipes';

const SILENT = 0.0001;

const lastPlayed = new Map<Sound, number>();
const played: Partial<Record<Sound, number>> = {};

export function sfxState(): Partial<Record<Sound, number>> {
  return { ...played };
}

// pitch scales every frequency in the recipe.
export function sfx(name: Sound, pitch = 1): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now * 1000 - (lastPlayed.get(name) ?? -Infinity) < SOUNDS[name].minGapMs) return;
  lastPlayed.set(name, now * 1000);
  played[name] = (played[name] ?? 0) + 1;
  blip(ctx, ctx.destination, name, now, pitch);
}

export function blip(ctx: BaseAudioContext, out: AudioNode, name: Sound, at: number, pitch = 1): void {
  for (const layer of SOUNDS[name].layers) play(ctx, out, layer, at + (layer.delayMs ?? 0) / 1000, pitch);
}

function play(ctx: BaseAudioContext, out: AudioNode, layer: Layer, at: number, pitch: number): void {
  const end = at + layer.ms / 1000;
  const env = ctx.createGain();
  // A source started between samples emits one sample before `at`, which the default gain of 1 would let through.
  env.gain.value = 0;
  if (layer.attackMs) {
    env.gain.setValueAtTime(SILENT, at);
    env.gain.exponentialRampToValueAtTime(layer.gain, at + layer.attackMs / 1000);
  } else env.gain.setValueAtTime(layer.gain, at);
  env.gain.exponentialRampToValueAtTime(SILENT, end);
  env.connect(out);
  const { source, hz } = layer.kind === 'tone' ? oscillator(ctx, layer.wave, env) : filteredNoise(ctx, layer, env);
  hz.setValueAtTime(layer.hz.from * pitch, at);
  hz.exponentialRampToValueAtTime(layer.hz.to * pitch, end);
  source.start(at);
  source.stop(end);
  source.onended = () => env.disconnect();
}

type Voice = { source: AudioScheduledSourceNode; hz: AudioParam };

function oscillator(ctx: BaseAudioContext, wave: OscillatorType, out: AudioNode): Voice {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.connect(out);
  return { source: osc, hz: osc.frequency };
}

function filteredNoise(ctx: BaseAudioContext, layer: Extract<Layer, { kind: 'noise' }>, out: AudioNode): Voice {
  const noise = ctx.createBufferSource();
  noise.buffer = seededNoise(ctx);
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = layer.filter;
  filter.Q.value = layer.q;
  noise.connect(filter).connect(out);
  return { source: noise, hz: filter.frequency };
}
