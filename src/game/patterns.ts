import type Phaser from 'phaser';
import type { BossPattern } from '../core/stages';
import { VIEW } from '../viewSize';
import type { BossFight } from './boss';
import type { BulletKind } from './bullets';
import { rayEnd, type Point } from './geometry';
import { PLAYER_Y } from './layout';

type Graphics = Phaser.GameObjects.Graphics;

// A special attack charges for chargeMs with its callout over the boss. aim() fixes the attack's geometry when the
// charge starts, so the telegraph drawn during the charge is exactly where the release lands.
export type Cast = {
  chargeMs: number;
  callout: string;
  aim(fight: BossFight): unknown;
  telegraph(fight: BossFight, aim: unknown, g: Graphics, progress: number): void;
};

export type PatternDef = { run(fight: BossFight, aim?: unknown): void; cast?: Cast };

type Special<A> = {
  chargeMs: number;
  callout: string;
  aim(fight: BossFight): A;
  telegraph(fight: BossFight, aim: A, g: Graphics, progress: number): void;
  run(fight: BossFight, aim: A): void;
};

// The aim a special makes is only ever read back by the same special, which is what makes these casts safe.
function special<A>({ run, ...cast }: Special<A>): PatternDef {
  return {
    run: (f, aim) => run(f, aim as A),
    cast: { ...cast, telegraph: (f, aim, g, p) => cast.telegraph(f, aim as A, g, p) },
  };
}

// Down-angles in degrees: 0 points straight down the screen, positive leans right.
const down = (from: Point, deg: number, length: number): Point => rayEnd(from, 180 - deg, length);
const downAngleTo = (from: Point, to: Point): number => (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;

function shootDown(f: BossFight, kind: BulletKind, from: Point, deg: number, speed: number): void {
  const v = down({ x: 0, y: 0 }, deg, speed);
  f.fire({ kind, x: from.x, y: from.y, vx: v.x, vy: v.y });
}

const inGap = (deg: number, gaps: readonly number[], halfWidth: number) => gaps.some((g) => Math.abs(deg - g) <= halfWidth);

// Feather Storm: three fans of feathers, each two staggered rows thick, each with one lane that slides sideways.
const FEATHER = { waves: 3, waveMs: 420, fromDeg: -76, toDeg: 76, stepDeg: 5, gapHalfDeg: 9, slideDeg: 16, speed: 200 } as const;

// Cross Judgement: two beams from the wing tips sweep inward across each other. The outer edges stay safe.
const CROSS = { tipDx: 46, tipDy: 10, outerX: 92, innerX: 345, sweepMs: 1400 } as const;

// Black Hole: a well near the ship that pulls it and bends enemy bullets for msLeft.
export const WELL = { ms: 3200, y: 430, minX: 90, maxX: 390, pullRadius: 240, shipPull: 95, bulletPull: 520, coreRadius: 12 } as const;

// Eclipse Nova: two staggered rings of orbs, the second half a step behind, with safe lanes through both.
const NOVA = { count: 72, ringMs: 130, speed: 150, gapHalfDeg: 7.5, lanes: 3 } as const;

type FeatherAim = { from: Point; gaps: number[] };
type CrossAim = { beams: { origin: Point; fromDeg: number; toDeg: number }[] };
type WellAim = { at: Point };
type NovaAim = { from: Point; gaps: number[] };

export const PATTERNS: Record<BossPattern, PatternDef> = {
  fanSpread: {
    run: (b) => {
      const waves = b.phase + 1;
      for (let w = 0; w < waves; w++)
        b.after(w * 260, () => {
          const count = 9 + w;
          for (let i = 0; i < count; i++) b.shoot(b.look.orb, b.muzzle, -55 + (110 * i) / (count - 1), 165);
        });
    },
  },
  aimedBurst: { run: (b) => b.repeat(6, 110, () => b.shoot('needle', b.muzzle, b.aimAtPlayer(), 270)) },
  summonMinions: { run: (b) => b.summon(3 + b.phase) },
  spiral: {
    run: (b) => {
      let angle = 0;
      b.repeat(26, 65, () => {
        for (const arm of [0, 120, 240]) b.shoot(b.look.orb, b.muzzle, angle + arm, 150);
        angle += 17;
      });
    },
  },
  sweepLaser: {
    run: (b) => {
      const flip = Math.random() < 0.5 ? 1 : -1;
      b.addBeam({ origin: 'muzzle', fromDeg: -55 * flip, toDeg: 55 * flip, telegraphMs: 850, sweepMs: 1500 });
    },
  },
  bulletRain: {
    run: (b) =>
      b.repeat(24, 80, () => {
        const x = 20 + Math.random() * (VIEW.w - 40);
        b.fire({ kind: 'pellet', x, y: 40, vx: 0, vy: 170 + Math.random() * 70 });
      }),
  },

  featherStorm: special<FeatherAim>({
    chargeMs: 1000,
    callout: 'Feather Storm!',
    aim: (f) => {
      const from = f.muzzle;
      const slide = (Math.random() < 0.5 ? -1 : 1) * FEATHER.slideDeg;
      const travel = (FEATHER.waves - 1) * slide;
      const lo = FEATHER.fromDeg + 12 + Math.max(0, -travel);
      const hi = FEATHER.toDeg - 12 - Math.max(0, travel);
      const start = clampDeg(downAngleTo(from, f.world.player) + (Math.random() - 0.5) * 16, lo, hi);
      return { from, gaps: Array.from({ length: FEATHER.waves }, (_, w) => start + w * slide) };
    },
    telegraph: (f, { from, gaps }, g, p) => {
      for (let deg = FEATHER.fromDeg; deg <= FEATHER.toDeg; deg += FEATHER.stepDeg * 2) {
        if (inGap(deg, gaps, FEATHER.gapHalfDeg)) continue;
        const to = down(from, deg, 130 + 380 * p);
        g.lineStyle(1, f.look.beam, 0.25 + 0.25 * p).lineBetween(from.x, from.y, to.x, to.y);
      }
      gaps.forEach((gap, w) => lane(g, from, gap, FEATHER.gapHalfDeg, 0.55 - w * 0.17, p));
    },
    run: (f, { from, gaps }) => {
      gaps.forEach((gap, w) =>
        f.after(w * FEATHER.waveMs, () => {
          for (const row of [0, 1])
            f.after(row * 90, () => {
              for (let deg = FEATHER.fromDeg + row * FEATHER.stepDeg * 0.5; deg <= FEATHER.toDeg; deg += FEATHER.stepDeg)
                if (!inGap(deg, [gap], FEATHER.gapHalfDeg)) shootDown(f, 'needle', from, deg, FEATHER.speed);
            });
        }),
      );
    },
  }),

  crossJudgement: special<CrossAim>({
    chargeMs: 1200,
    callout: 'Cross Judgement',
    aim: (f) => {
      const { x, y } = f.foe.sprite;
      const jitter = (Math.random() - 0.5) * 30;
      return {
        beams: ([-1, 1] as const).map((side) => {
          const origin = { x: x + side * CROSS.tipDx, y: y + CROSS.tipDy };
          const atBottom = (bx: number) => downAngleTo(origin, { x: bx, y: PLAYER_Y });
          const outer = VIEW.w / 2 + side * (VIEW.w / 2 - CROSS.outerX) + jitter;
          const inner = VIEW.w / 2 - side * (CROSS.innerX - VIEW.w / 2) + jitter;
          return { origin, fromDeg: atBottom(outer), toDeg: atBottom(inner) };
        }),
      };
    },
    telegraph: (f, { beams }, g, p) => {
      const blink = Math.floor(p * 12) % 2 === 0;
      for (const { origin, fromDeg, toDeg } of beams) {
        const a = down(origin, fromDeg, 900);
        const b = down(origin, toDeg, 900);
        g.fillStyle(f.look.beam, 0.08 + 0.1 * p).fillTriangle(origin.x, origin.y, a.x, a.y, b.x, b.y);
        g.lineStyle(2, f.look.beam, blink ? 0.95 : 0.4).lineBetween(origin.x, origin.y, a.x, a.y);
        g.lineStyle(1, f.look.beam, 0.35).lineBetween(origin.x, origin.y, b.x, b.y);
        g.fillStyle(f.look.beam, 0.7).fillCircle(origin.x, origin.y, 3 + 6 * p);
      }
    },
    run: (f, { beams }) => {
      for (const b of beams) f.addBeam({ origin: b.origin, fromDeg: b.fromDeg, toDeg: b.toDeg, telegraphMs: 0, sweepMs: CROSS.sweepMs });
    },
  }),

  blackHole: special<WellAim>({
    chargeMs: 1100,
    callout: 'Black Hole',
    aim: (f) => ({ at: { x: Math.min(WELL.maxX, Math.max(WELL.minX, f.world.player.x)), y: WELL.y } }),
    telegraph: (f, { at }, g, p) => {
      g.fillStyle(f.look.beam, 0.06 + 0.08 * p).fillCircle(at.x, at.y, WELL.pullRadius);
      g.lineStyle(2, f.look.beam, 0.6).strokeCircle(at.x, at.y, WELL.pullRadius);
      for (let i = 0; i < 3; i++) {
        const k = 1 - ((p * 2 + i / 3) % 1);
        g.lineStyle(2, f.look.glow, 0.7 * (1 - k)).strokeCircle(at.x, at.y, WELL.coreRadius + k * (WELL.pullRadius - WELL.coreRadius));
      }
      g.fillStyle(0x05040f, 0.9).fillCircle(at.x, at.y, WELL.coreRadius * p);
    },
    run: (f, { at }) => f.openWell(at, WELL.ms),
  }),

  eclipseNova: special<NovaAim>({
    chargeMs: 1100,
    callout: 'Eclipse Nova',
    aim: (f) => {
      const from = f.muzzle;
      const spread = 100 / NOVA.lanes;
      const gaps = Array.from({ length: NOVA.lanes }, (_, i) => -50 + spread * (i + 0.5) + (Math.random() - 0.5) * spread * 0.5);
      return { from, gaps };
    },
    telegraph: (f, { from, gaps }, g, p) => {
      const r = 30 + 90 * p;
      g.lineStyle(3, f.look.beam, 0.3 + 0.5 * p).strokeCircle(from.x, from.y, r);
      for (const gap of gaps) lane(g, from, gap, NOVA.gapHalfDeg, 0.55, p);
    },
    run: (f, { from, gaps }) => {
      const step = 360 / NOVA.count;
      for (const ring of [0, 1])
        f.after(ring * NOVA.ringMs, () => {
          for (let i = 0; i < NOVA.count; i++) {
            const deg = ((i + ring * 0.5) * step + 180) % 360 - 180;
            if (!inGap(deg, gaps, NOVA.gapHalfDeg)) shootDown(f, f.look.orb, from, deg, NOVA.speed);
          }
        });
    },
  }),
};

// A safe lane: a bright wedge with hard edges from the boss to the bottom of the screen.
function lane(g: Graphics, from: Point, centerDeg: number, halfDeg: number, alpha: number, p: number): void {
  const a = down(from, centerDeg - halfDeg, 900);
  const b = down(from, centerDeg + halfDeg, 900);
  g.fillStyle(0xffffff, alpha * (0.15 + 0.2 * p)).fillTriangle(from.x, from.y, a.x, a.y, b.x, b.y);
  g.lineStyle(2, 0xffffff, alpha).lineBetween(from.x, from.y, a.x, a.y).lineBetween(from.x, from.y, b.x, b.y);
}

function clampDeg(deg: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, deg));
}
