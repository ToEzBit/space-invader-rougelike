// The TRANS-AM cut-in's timeline. The stage is frozen while it plays, and the view draws whatever pose this gives
// for the time elapsed, so the cut-in needs no tweens or timers of its own.
export const CUT_IN = { dimMs: 100, bandMs: 600, slashMs: 300 } as const;
export const CUT_IN_MS = CUT_IN.dimMs + CUT_IN.bandMs + CUT_IN.slashMs;

// slide is the band's place along its own axis: -1 off one end, 0 centred, 1 off the other.
// red crossfades the eyes from blue (0) to red (1). slash is the light's sweep across the band, null outside it.
export type CutInPose = { dim: number; slide: number; red: number; title: number; slash: number | null; flash: number };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const span = (p: number, from: number, to: number) => clamp01((p - from) / (to - from));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;
const smooth = (x: number) => x * x * (3 - 2 * x);

const POSES = {
  dim: (p: number): CutInPose => ({ dim: p, slide: -1, red: 0, title: 0, slash: null, flash: 0 }),
  band: (p: number): CutInPose => ({
    dim: 1,
    slide: easeOut(span(p, 0, 0.25)) - 1,
    red: smooth(span(p, 0.3, 0.8)),
    title: easeOut(span(p, 0.15, 0.35)),
    slash: null,
    flash: 0,
  }),
  slash: (p: number): CutInPose => ({
    dim: 1 - span(p, 0.4, 1),
    slide: easeIn(span(p, 0.45, 1)),
    red: 1,
    title: 1,
    slash: p < 0.35 ? p / 0.35 : null,
    flash: p < 0.3 ? 0 : 1 - span(p, 0.3, 0.65),
  }),
} as const;

const BEATS = [
  { beat: 'dim', ms: CUT_IN.dimMs },
  { beat: 'band', ms: CUT_IN.bandMs },
  { beat: 'slash', ms: CUT_IN.slashMs },
] as const;

// Null once the cut-in is over.
export function cutInPose(elapsedMs: number): CutInPose | null {
  let start = 0;
  for (const { beat, ms } of BEATS) {
    if (elapsedMs < start + ms) return POSES[beat](Math.max(0, elapsedMs - start) / ms);
    start += ms;
  }
  return null;
}
