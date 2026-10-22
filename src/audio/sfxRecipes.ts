import type { BossId } from '../core/stages';
import type { Tier } from '../game/bossMotion';

export type Sound =
  | 'pop'
  | 'boom'
  | 'hurt'
  | 'buy'
  | 'deny'
  | 'dash'
  | 'laser'
  | 'phase'
  | 'transAm'
  | 'powerDown'
  | 'shot'
  | 'orbital'
  | 'castLight'
  | 'castHeavy'
  | 'castUltimate';

type Sweep = { readonly from: number; readonly to: number };

// A layer with no attackMs starts at full gain, the way every sound did before layers existed.
type Envelope = { readonly ms: number; readonly gain: number; readonly attackMs?: number; readonly delayMs?: number };

export type Layer =
  | ({ readonly kind: 'tone'; readonly wave: OscillatorType; readonly hz: Sweep } & Envelope)
  | ({ readonly kind: 'noise'; readonly filter: BiquadFilterType; readonly hz: Sweep; readonly q: number } & Envelope);

export type Recipe = { readonly layers: readonly Layer[]; readonly minGapMs: number };

const tone = (wave: OscillatorType, from: number, to: number, ms: number, gain: number, more: Partial<Envelope> = {}): Layer => ({
  kind: 'tone',
  wave,
  hz: { from, to },
  ms,
  gain,
  ...more,
});

const noise = (filter: BiquadFilterType, from: number, to: number, q: number, ms: number, gain: number, more: Partial<Envelope> = {}): Layer => ({
  kind: 'noise',
  filter,
  hz: { from, to },
  q,
  ms,
  gain,
  ...more,
});

export const SOUNDS: Record<Sound, Recipe> = {
  pop: { layers: [tone('square', 520, 90, 90, 0.05)], minGapMs: 45 },
  boom: { layers: [tone('sawtooth', 160, 30, 500, 0.12)], minGapMs: 120 },
  hurt: { layers: [tone('sawtooth', 300, 60, 260, 0.12)], minGapMs: 100 },
  buy: { layers: [tone('triangle', 660, 1320, 160, 0.1)], minGapMs: 60 },
  deny: { layers: [tone('square', 140, 110, 140, 0.07)], minGapMs: 100 },
  dash: { layers: [tone('sawtooth', 200, 900, 220, 0.07)], minGapMs: 100 },
  phase: { layers: [tone('square', 90, 400, 600, 0.08)], minGapMs: 300 },
  transAm: { layers: [tone('sawtooth', 120, 1600, 700, 0.1)], minGapMs: 300 },
  powerDown: { layers: [tone('triangle', 600, 70, 650, 0.1)], minGapMs: 300 },
  // Plays on every volley for whole stages, so it is soft, short and has no square edge.
  shot: {
    layers: [tone('triangle', 1500, 560, 55, 0.034, { attackMs: 2 }), noise('highpass', 5200, 3000, 0.7, 20, 0.018, { attackMs: 1 })],
    minGapMs: 35,
  },
  // The zap that opens the beam; the buzz under the rest of it is LaserSound's.
  laser: {
    layers: [
      tone('sawtooth', 1900, 240, 150, 0.045, { attackMs: 2 }),
      noise('bandpass', 7000, 1600, 1.2, 170, 0.22, { attackMs: 2 }),
      tone('sine', 170, 55, 200, 0.08, { attackMs: 3 }),
    ],
    minGapMs: 200,
  },
  orbital: {
    layers: [
      tone('square', 1600, 200, 80, 0.025, { attackMs: 1 }),
      tone('sine', 200, 38, 480, 0.07, { attackMs: 4 }),
      noise('lowpass', 4200, 180, 0.8, 520, 0.18, { attackMs: 3 }),
    ],
    minGapMs: 200,
  },
  castLight: {
    layers: [noise('bandpass', 420, 2000, 2.2, 300, 0.42, { attackMs: 140 }), tone('triangle', 330, 156, 260, 0.05, { attackMs: 30 })],
    minGapMs: 150,
  },
  castHeavy: {
    layers: [
      noise('bandpass', 260, 1700, 1.6, 520, 0.5, { attackMs: 200 }),
      tone('sawtooth', 98, 49, 480, 0.04, { attackMs: 60 }),
      tone('triangle', 196, 98, 440, 0.05, { attackMs: 40 }),
    ],
    minGapMs: 150,
  },
  // Swells under the whole charge so it peaks into the release boom.
  castUltimate: {
    layers: [
      noise('bandpass', 180, 3200, 3, 980, 0.42, { attackMs: 860 }),
      tone('sawtooth', 55, 110, 980, 0.045, { attackMs: 800 }),
      tone('sine', 82, 165, 980, 0.08, { attackMs: 700 }),
    ],
    minGapMs: 150,
  },
};

export function recipeMs({ layers }: Recipe): number {
  return Math.max(...layers.map((l) => (l.delayMs ?? 0) + l.ms));
}

export const CAST_SOUND = { light: 'castLight', heavy: 'castHeavy', ultimate: 'castUltimate' } as const satisfies Record<Tier, Sound>;

// The Seraph's casts ring brighter and the Empress's sink lower.
export const CAST_PITCH: Record<BossId, number> = { crimsonSeraph: 1.3, voidEmpress: 0.72 };

const SHOT_PITCHES = [1, 0.95, 1.05, 0.97] as const;

export function shotPitch(volley: number): number {
  return SHOT_PITCHES[volley % SHOT_PITCHES.length]!;
}
