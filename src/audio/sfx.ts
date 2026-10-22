import { audioContext } from './context';

export type Sound = 'pop' | 'boom' | 'hurt' | 'buy' | 'deny' | 'dash' | 'laser' | 'phase' | 'transAm' | 'powerDown';

type Blip = { wave: OscillatorType; from: number; to: number; ms: number; gain: number; minGapMs: number };

const BLIPS: Record<Sound, Blip> = {
  pop: { wave: 'square', from: 520, to: 90, ms: 90, gain: 0.05, minGapMs: 45 },
  boom: { wave: 'sawtooth', from: 160, to: 30, ms: 500, gain: 0.12, minGapMs: 120 },
  hurt: { wave: 'sawtooth', from: 300, to: 60, ms: 260, gain: 0.12, minGapMs: 100 },
  buy: { wave: 'triangle', from: 660, to: 1320, ms: 160, gain: 0.1, minGapMs: 60 },
  deny: { wave: 'square', from: 140, to: 110, ms: 140, gain: 0.07, minGapMs: 100 },
  dash: { wave: 'sawtooth', from: 200, to: 900, ms: 220, gain: 0.07, minGapMs: 100 },
  laser: { wave: 'sine', from: 1200, to: 400, ms: 380, gain: 0.07, minGapMs: 200 },
  phase: { wave: 'square', from: 90, to: 400, ms: 600, gain: 0.08, minGapMs: 300 },
  transAm: { wave: 'sawtooth', from: 120, to: 1600, ms: 700, gain: 0.1, minGapMs: 300 },
  powerDown: { wave: 'triangle', from: 600, to: 70, ms: 650, gain: 0.1, minGapMs: 300 },
};

const lastPlayed = new Map<Sound, number>();

export function sfx(name: Sound): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (now * 1000 - (lastPlayed.get(name) ?? -Infinity) < BLIPS[name].minGapMs) return;
  lastPlayed.set(name, now * 1000);
  blip(ctx, ctx.destination, name, now);
}

export function blip(ctx: BaseAudioContext, out: AudioNode, name: Sound, at: number): void {
  const blip = BLIPS[name];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = blip.wave;
  osc.frequency.setValueAtTime(blip.from, at);
  osc.frequency.exponentialRampToValueAtTime(blip.to, at + blip.ms / 1000);
  gain.gain.setValueAtTime(blip.gain, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + blip.ms / 1000);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + blip.ms / 1000);
}
