import { COLORS } from '../art/palette';
import type { BossPattern } from '../core/stages';

export type Tier = 'light' | 'heavy' | 'ultimate';

export type Pose = {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
  glow: number;
  flash: number;
  aura: number;
  ghosts: number;
  darken: number;
  glint: number;
  cast: number;
};

export const REST: Pose = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, glow: 0, flash: 0, aura: 0, ghosts: 0, darken: 0, glint: 0, cast: 0 };

const EFFECTS = ['glow', 'flash', 'aura', 'ghosts', 'darken', 'glint', 'cast'] as const;
const PROPS = ['dx', 'dy', 'sx', 'sy', 'rot', ...EFFECTS] as const;

type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'back';

const EASE: Record<Ease, (k: number) => number> = {
  linear: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  inOut: (k) => 0.5 - 0.5 * Math.cos(Math.PI * k),
  back: (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
};

type Key = { at: number; ease?: Ease } & Partial<Pose>;

type Wobble = { prop: 'dx' | 'dy' | 'rot' | 'sx' | 'sy'; amp: number; periodMs: number; from: number; to: number };

export type AuraKind = 'burst' | 'shock' | 'rays' | 'cross' | 'implode' | 'corona';

export type Facing = 'none' | 'ship' | 'beam';

export type Motion = {
  tier: Tier;
  keys: readonly Key[];
  wobble?: readonly Wobble[];
  clock: 'real' | 'bulletTime';
  facing: Facing;
  aura: AuraKind;
  color?: number;
};

const TAU = Math.PI * 2;

export const MOTIONS: Record<BossPattern, Motion> = {
  fanSpread: {
    tier: 'light',
    clock: 'real',
    facing: 'none',
    aura: 'burst',
    keys: [
      { at: -220 },
      { at: -30, dy: -7, sx: 1.12, sy: 0.86, glow: 0.3 },
      { at: 50, ease: 'out', dy: 7, sx: 0.9, sy: 1.14, flash: 0.7, aura: 1 },
      { at: 170, dy: -2, sx: 1.03, sy: 0.97, aura: 0.6 },
      { at: 330 },
    ],
  },
  aimedBurst: {
    tier: 'light',
    clock: 'real',
    facing: 'ship',
    aura: 'burst',
    keys: [
      { at: -200 },
      { at: -30, dx: -4, rot: 0.08, sx: 1.06, sy: 0.93, glow: 0.3 },
      { at: 60, ease: 'out', dx: 5, rot: -0.1, sy: 1.08, flash: 0.6, glint: 1, aura: 0.7 },
      { at: 900, ease: 'linear', dx: 3, rot: -0.06, glint: 0.7, glow: 0.2 },
      { at: 1150 },
    ],
    wobble: [{ prop: 'dy', amp: 2.5, periodMs: 110, from: 60, to: 1000 }],
  },
  summonMinions: {
    tier: 'light',
    clock: 'real',
    facing: 'none',
    aura: 'burst',
    keys: [
      { at: -240 },
      { at: -40, dy: -10, sx: 0.9, sy: 1.12, glow: 0.5 },
      { at: 60, ease: 'out', dy: 4, sx: 1.16, sy: 0.86, flash: 0.9, aura: 1 },
      { at: 220, sx: 0.98, sy: 1.02, aura: 0.5 },
      { at: 380 },
    ],
  },

  spiral: {
    tier: 'heavy',
    clock: 'real',
    facing: 'none',
    aura: 'burst',
    keys: [
      { at: -320 },
      { at: -40, rot: -0.45, sx: 1.06, sy: 0.94, glow: 0.4 },
      { at: 120, ease: 'out', rot: 0.4, sx: 0.95, sy: 1.06, flash: 0.5, ghosts: 0.9, glow: 0.7, aura: 1 },
      { at: 1550, rot: TAU + 0.18, ghosts: 0.9, glow: 0.6 },
      { at: 1900, ease: 'out', rot: TAU },
    ],
    wobble: [{ prop: 'dy', amp: 4, periodMs: 280, from: 0, to: 1690 }],
  },
  sweepLaser: {
    tier: 'heavy',
    clock: 'bulletTime',
    facing: 'beam',
    aura: 'burst',
    keys: [
      { at: -260 },
      { at: -40, dy: -6, sx: 0.95, sy: 1.07, glow: 0.3 },
      { at: 120, ease: 'out', dy: 2, glint: 0.5, aura: 0.6 },
      { at: 850, dx: -10, rot: 0.28, glint: 1, glow: 0.5, ghosts: 0.3 },
      { at: 2350, ease: 'linear', dx: 10, rot: -0.28, glint: 1, glow: 0.5, ghosts: 0.4 },
      { at: 2650 },
    ],
  },
  bulletRain: {
    tier: 'heavy',
    clock: 'real',
    facing: 'none',
    aura: 'shock',
    keys: [
      { at: -380 },
      { at: -60, ease: 'out', dy: -20, sx: 0.92, sy: 1.1, glow: 0.5, ghosts: 0.3 },
      { at: 40, ease: 'in', dy: 9, sx: 1.2, sy: 0.82, flash: 1, aura: 1, ghosts: 0.7 },
      { at: 220, dy: 2, sx: 1.02, sy: 0.98, aura: 0.4, glow: 0.3 },
      { at: 1900, glow: 0.3 },
      { at: 2200 },
    ],
    wobble: [{ prop: 'dy', amp: 1.8, periodMs: 160, from: 220, to: 1900 }],
  },

  featherStorm: {
    tier: 'ultimate',
    clock: 'real',
    facing: 'ship',
    aura: 'rays',
    color: COLORS.gold,
    keys: [
      { at: -1000 },
      { at: -840, ease: 'out', cast: 1, dy: -4, glow: 0.4, darken: 0.15, aura: 0.25, ghosts: 0.3 },
      { at: -110, dy: -10, sx: 1.12, sy: 1.06, glow: 1, darken: 0.45, aura: 1, ghosts: 0.8, cast: 1 },
      { at: 0, ease: 'in', dy: -6, sx: 0.88, sy: 1.22, flash: 1, aura: 1, ghosts: 1, glow: 1, darken: 0.45, cast: 1 },
      { at: 100, ease: 'out', dy: -9, sx: 1.12, sy: 0.92, flash: 0.3, aura: 0.8, ghosts: 0.8, glow: 0.8, darken: 0.35, cast: 1 },
      { at: 1100, dy: -5, glow: 0.4, ghosts: 0.4, darken: 0.2, cast: 1 },
      { at: 1350 },
    ],
    wobble: [
      { prop: 'dy', amp: 3, periodMs: 480, from: -840, to: -110 },
      { prop: 'dx', amp: 7, periodMs: 840, from: 100, to: 1260 },
    ],
  },
  crossJudgement: {
    tier: 'ultimate',
    clock: 'bulletTime',
    facing: 'none',
    aura: 'cross',
    color: COLORS.red,
    keys: [
      { at: -1200 },
      { at: -1000, ease: 'out', cast: 1, dy: -5, glow: 0.5, darken: 0.2, aura: 0.2 },
      { at: -150, dy: -12, sx: 1.06, sy: 1.08, glow: 1, darken: 0.55, aura: 1, ghosts: 0.5, cast: 1 },
      { at: 0, ease: 'in', dy: -9, sx: 0.86, sy: 1.26, flash: 1, aura: 1, ghosts: 1, glow: 1, darken: 0.55, cast: 1 },
      { at: 110, ease: 'out', dy: -11, sx: 1.1, sy: 0.94, flash: 0.3, aura: 1, ghosts: 0.7, glow: 0.9, darken: 0.45, cast: 1 },
      { at: 1400, ease: 'linear', dy: -8, glow: 0.6, aura: 0.5, ghosts: 0.4, darken: 0.3, cast: 1 },
      { at: 1700 },
    ],
    wobble: [{ prop: 'dy', amp: 1.5, periodMs: 600, from: -1000, to: -150 }],
  },
  blackHole: {
    tier: 'ultimate',
    clock: 'real',
    facing: 'ship',
    aura: 'implode',
    color: COLORS.violet,
    keys: [
      { at: -1100 },
      { at: -950, ease: 'out', cast: 1, dy: -4, glow: 0.4, darken: 0.25, aura: 0.3, ghosts: 0.3 },
      { at: -100, dy: -9, sx: 0.94, sy: 0.94, glow: 1, darken: 0.6, aura: 1, ghosts: 0.7, cast: 1 },
      { at: 0, ease: 'in', dy: 6, dx: 6, rot: -0.12, sx: 0.9, sy: 1.2, flash: 1, aura: 1, ghosts: 1, glow: 1, darken: 0.6, cast: 1 },
      { at: 130, ease: 'out', dy: -8, dx: -3, rot: 0.05, sx: 1.08, sy: 0.94, flash: 0.3, aura: 0.6, ghosts: 0.6, glow: 0.7, darken: 0.45, cast: 1 },
      { at: 600, dy: -4, glow: 0.4, darken: 0.3, ghosts: 0.3, cast: 1 },
      { at: 900 },
    ],
    wobble: [
      { prop: 'dx', amp: 4, periodMs: 700, from: -950, to: -100 },
      { prop: 'rot', amp: 0.05, periodMs: 700, from: -950, to: -100 },
    ],
  },
  eclipseNova: {
    tier: 'ultimate',
    clock: 'real',
    facing: 'none',
    aura: 'corona',
    color: COLORS.cyan,
    keys: [
      { at: -1100 },
      { at: -950, ease: 'out', cast: 1, dy: -5, glow: 0.4, darken: 0.2, aura: 0.2 },
      { at: -150, ease: 'in', dy: -10, sx: 0.86, sy: 0.86, glow: 1, darken: 0.55, aura: 1, ghosts: 0.6, cast: 1 },
      { at: 0, ease: 'out', dy: -9, sx: 1.26, sy: 1.26, flash: 1, aura: 1, ghosts: 1, glow: 1, darken: 0.55, cast: 1 },
      { at: 70, dy: -9, sx: 1.08, sy: 1.08, flash: 0.4, aura: 1, ghosts: 0.9, glow: 0.9, darken: 0.5, cast: 1 },
      { at: 150, ease: 'out', dy: -9, sx: 1.2, sy: 1.2, flash: 0.6, aura: 1, ghosts: 1, glow: 1, darken: 0.5, cast: 1 },
      { at: 520, dy: -5, sx: 1.02, sy: 1.02, aura: 0.4, ghosts: 0.4, glow: 0.5, darken: 0.3, cast: 1 },
      { at: 800 },
    ],
    wobble: [{ prop: 'rot', amp: 0.035, periodMs: 90, from: -700, to: -150 }],
  },
};

export const leadMs = (pattern: BossPattern): number => -MOTIONS[pattern].keys[0]!.at;
export const tailMs = (pattern: BossPattern): number => MOTIONS[pattern].keys.at(-1)!.at;

export type Dir = 1 | -1;

export function poseAt(pattern: BossPattern, ms: number, dir: Dir = 1): Pose {
  const { keys, wobble = [] } = MOTIONS[pattern];
  if (!(ms > keys[0]!.at && ms < keys.at(-1)!.at)) return REST;
  let i = 1;
  while (keys[i]!.at < ms) i++;
  const a = keys[i - 1]!;
  const b = keys[i]!;
  const k = EASE[b.ease ?? 'inOut']((ms - a.at) / (b.at - a.at));
  const pose = { ...REST };
  for (const p of PROPS) pose[p] = (a[p] ?? REST[p]) + ((b[p] ?? REST[p]) - (a[p] ?? REST[p])) * k;
  for (const w of wobble) {
    if (ms <= w.from || ms >= w.to) continue;
    const t = ms - w.from;
    pose[w.prop] += w.amp * Math.sin((TAU * t) / w.periodMs) * Math.sin((Math.PI * t) / (w.to - w.from));
  }
  for (const e of EFFECTS) pose[e] = Math.min(1, Math.max(0, pose[e]));
  pose.dx *= dir;
  pose.rot = dir * (pose.rot - TAU * Math.round(pose.rot / TAU));
  return pose;
}

export type Move = { readonly pattern: BossPattern; readonly ms: number; readonly dir: Dir };

export function advance(moves: readonly Move[], dtMs: number, enemyTimeScale: number): Move[] {
  return moves
    .map((m) => ({ ...m, ms: m.ms + dtMs * (MOTIONS[m.pattern].clock === 'bulletTime' ? enemyTimeScale : 1) }))
    .filter((m) => m.ms < tailMs(m.pattern));
}

export function poseOf(moves: readonly Move[], lagMs = 0): Pose {
  const pose = { ...REST };
  for (const m of moves) {
    const p = poseAt(m.pattern, m.ms - lagMs, m.dir);
    pose.dx += p.dx;
    pose.dy += p.dy;
    pose.rot += p.rot;
    pose.sx *= p.sx;
    pose.sy *= p.sy;
    for (const e of EFFECTS) pose[e] = Math.max(pose[e], p[e]);
  }
  return pose;
}

export function originFor(w: number, h: number, { dx, dy, sx, sy, rot }: Pose): { x: number; y: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: 0.5 - (c * dx + s * dy) / sx / w, y: 0.5 - (-s * dx + c * dy) / sy / h };
}
