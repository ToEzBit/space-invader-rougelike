import { TRANS_AM } from '../core/transAm';

export type Layer = 'release' | 'hum' | 'shot' | 'tick';
export const LAYERS: readonly Layer[] = ['release', 'hum', 'shot', 'tick'];

type Span = { readonly from: number; readonly to: number };

// Every TRANS-AM sound past the press. Each layer plays into its own bus at `level`, beside the sfx and not through
// the music bus, so M leaves it alone. The release and the hum start on the release frame, after the cut-in.
export const TRANS_AM_SOUND = {
  level: { release: 0.2, hum: 0.032, shot: 0.012, tick: 0.045 } satisfies Record<Layer, number>,
  release: {
    thump: { hz: { from: 120, to: 34 }, sec: 0.6 },
    punch: { hz: { from: 420, to: 70 }, sec: 0.09, gain: 0.5 },
    whoosh: { hz: { from: 9000, to: 1800 }, sec: 0.45, gain: 0.35, q: 0.9 },
  },
  hum: {
    fadeInMs: 450,
    fadeOutSec: 0.25,
    hz: { from: 55, to: 82.41 },
    detuneCents: 14,
    cutoffHz: { from: 320, to: 1900 },
    q: 6,
    tremoloHz: { from: 9, to: 16 },
    tremoloDepth: 0.4,
    // How fast the oscillators chase each frame's target, so the 60 fps steps blur into a glide.
    glideSec: 0.03,
  },
  shot: { hz: { from: 2600, to: 1200 }, sec: 0.03 },
  // Ticks count down the active time, closer together and higher as it runs out.
  tick: { atMsLeft: [1500, 1100, 750, 450, 200], hz: { from: 1320, to: 2640 }, sec: 0.06 },
  // The music bus lowpass while TRANS-AM is active, so the music sounds slowed with the enemy bullets.
  muffle: { cutoffHz: 650, downSec: 0.3, upSec: 0.8 },
} as const;

export type HumPoint = { gain: number; hz: number; cutoffHz: number; tremoloHz: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = ({ from, to }: Span, p: number) => from + (to - from) * p;
// Pitch and cutoff rise on a log scale, so each second climbs the same musical interval.
const glide = ({ from, to }: Span, p: number) => from * (to / from) ** p;

export function humAt(elapsedMs: number): HumPoint {
  const { hum } = TRANS_AM_SOUND;
  const p = clamp01(elapsedMs / TRANS_AM.activeMs);
  return { gain: clamp01(elapsedMs / hum.fadeInMs), hz: glide(hum.hz, p), cutoffHz: glide(hum.cutoffHz, p), tremoloHz: lerp(hum.tremoloHz, p) };
}

// Indexes of the ticks due when the active time drops from prevMsLeft to msLeft.
export function ticksCrossed(prevMsLeft: number, msLeft: number): number[] {
  return TRANS_AM_SOUND.tick.atMsLeft.flatMap((at, i) => (prevMsLeft > at && msLeft <= at ? [i] : []));
}

export function tickHz(index: number): number {
  const { atMsLeft, hz } = TRANS_AM_SOUND.tick;
  return glide(hz, index / (atMsLeft.length - 1));
}
