import { describe, expect, it } from 'vitest';
import type { BossPattern } from '../core/stages';
import { advance, leadMs, MOTIONS, originFor, poseAt, poseOf, REST, tailMs, type Move, type Pose } from './bossMotion';
import { PATTERNS } from './patterns';

const ALL = Object.keys(PATTERNS) as BossPattern[];
const TAU = Math.PI * 2;

function expectPose(pose: Pose, want: Pose, label: string): void {
  for (const [k, v] of Object.entries(want)) expect(pose[k as keyof Pose], `${label} ${k}`).toBeCloseTo(v, 2);
}

describe('boss motion table', () => {
  it('gives every pattern a motion, with the tiers by strength', () => {
    expect(Object.keys(MOTIONS).sort()).toEqual([...ALL].sort());
    const tier = (t: string) => ALL.filter((p) => MOTIONS[p].tier === t).sort();
    expect(tier('light')).toEqual(['aimedBurst', 'fanSpread', 'summonMinions']);
    expect(tier('heavy')).toEqual(['bulletRain', 'spiral', 'sweepLaser']);
    expect(tier('ultimate')).toEqual(ALL.filter((p) => PATTERNS[p].cast).sort());
  });

  it("charges an ultimate over exactly the special's charge, and winds a light skill up for 150 to 250 ms", () => {
    for (const p of ALL) {
      if (MOTIONS[p].tier === 'ultimate') expect(leadMs(p), p).toBe(PATTERNS[p].cast!.chargeMs);
      if (MOTIONS[p].tier === 'light') {
        expect(leadMs(p), p).toBeGreaterThanOrEqual(150);
        expect(leadMs(p), p).toBeLessThanOrEqual(250);
      }
    }
  });

  it('only lets ultimates wear the casting pose and darken the sky, and keeps afterimages off light skills', () => {
    const peak = (p: BossPattern, e: keyof Pose) => Math.max(...range(p).map((ms) => poseAt(p, ms)[e]));
    for (const p of ALL) {
      const ultimate = MOTIONS[p].tier === 'ultimate';
      expect(peak(p, 'cast') > 0, `${p} cast`).toBe(ultimate);
      expect(peak(p, 'darken') > 0, `${p} darken`).toBe(ultimate);
      expect(peak(p, 'ghosts') > 0, `${p} ghosts`).toBe(MOTIONS[p].tier !== 'light');
    }
  });
});

describe('boss motion', () => {
  it('starts and ends every skill at rest, before and after its window', () => {
    for (const p of ALL)
      for (const dir of [1, -1] as const) {
        for (const ms of [-leadMs(p) - 500, -leadMs(p), -leadMs(p) + 0.01, tailMs(p) - 0.01, tailMs(p), tailMs(p) + 500]) expectPose(poseAt(p, ms, dir), REST, `${p} at ${ms}`);
      }
  });

  it('never jumps between frames', () => {
    for (const p of ALL) {
      let prev = poseAt(p, -leadMs(p) - 1);
      for (const ms of range(p)) {
        const pose = poseAt(p, ms);
        const turn = Math.abs(pose.rot - prev.rot) % TAU;
        expect(Math.min(turn, TAU - turn), `${p} rot at ${ms}`).toBeLessThan(0.05);
        expect(Math.abs(pose.dx - prev.dx), `${p} dx at ${ms}`).toBeLessThan(1);
        expect(Math.abs(pose.dy - prev.dy), `${p} dy at ${ms}`).toBeLessThan(1);
        for (const k of ['sx', 'sy', 'glow', 'flash', 'aura', 'ghosts', 'darken', 'glint', 'cast'] as const)
          expect(Math.abs(pose[k] - prev[k]), `${p} ${k} at ${ms}`).toBeLessThan(0.05);
        prev = pose;
      }
    }
  });

  it('mirrors only the sideways offset and the turn', () => {
    for (const p of ALL)
      for (const ms of range(p, 37)) {
        const right = poseAt(p, ms, 1);
        const left = poseAt(p, ms, -1);
        expectPose(left, { ...right, dx: -right.dx, rot: -right.rot }, `${p} at ${ms}`);
      }
  });

  it('lands on the same pose at the same time whatever the frame rate', () => {
    const run = (steps: number[]) => {
      let moves: Move[] = [{ pattern: 'spiral', ms: 0, dir: 1 }];
      for (const dt of steps) moves = advance(moves, dt, 1);
      return moves;
    };
    const at60 = run(Array(60).fill(1000 / 60));
    const at30 = run(Array(30).fill(1000 / 30));
    const at144 = run(Array(144).fill(1000 / 144));
    const ragged = run([5, 40, 3, 33.3, 18.7, ...Array(18).fill(50)]);
    for (const moves of [at30, at144, ragged]) {
      expect(moves[0]!.ms).toBeCloseTo(1000, 6);
      for (const [k, v] of Object.entries(poseOf(at60))) expect(poseOf(moves)[k as keyof Pose], k).toBeCloseTo(v, 6);
    }
  });

  it('runs a beam-following motion on the enemy clock, and every other on real time', () => {
    const [laser, spiral] = advance(
      [
        { pattern: 'sweepLaser', ms: 0, dir: 1 },
        { pattern: 'spiral', ms: 0, dir: 1 },
      ],
      1000,
      0.4,
    );
    expect(laser!.ms).toBeCloseTo(400, 9);
    expect(spiral!.ms).toBeCloseTo(1000, 9);
  });

  it('drops each motion after its tail, so overlapping skills settle back to rest', () => {
    let moves: Move[] = ALL.map((pattern, i) => ({ pattern, ms: -leadMs(pattern) + i * 50, dir: i % 2 ? 1 : -1 }));
    expect(poseOf(moves.map((m) => ({ ...m, ms: m.ms + 200 })))).not.toEqual(REST);
    for (let i = 0; i < 400 && moves.length; i++) moves = advance(moves, 1000 / 60, 1);
    expect(moves).toEqual([]);
    expect(poseOf(moves)).toEqual(REST);
  });
});

describe('originFor', () => {
  it('draws the frame centre at the offset while the position stays put', () => {
    const w = 127;
    const h = 128;
    for (const pose of [
      { ...REST, dx: 7, dy: -16 },
      { ...REST, dx: -5, dy: 9, sx: 1.2, sy: 0.82, rot: 0.4 },
      { ...REST, dx: 3, dy: -14, sx: 0.88, sy: 1.26, rot: -2.9 },
    ]) {
      const o = originFor(w, h, pose);
      // A Phaser image draws local point (u, v) at position + R(rot) * S * (u - origin.x * w, v - origin.y * h).
      const lx = pose.sx * (w / 2 - o.x * w);
      const ly = pose.sy * (h / 2 - o.y * h);
      const cx = Math.cos(pose.rot) * lx - Math.sin(pose.rot) * ly;
      const cy = Math.sin(pose.rot) * lx + Math.cos(pose.rot) * ly;
      expect(cx).toBeCloseTo(pose.dx, 9);
      expect(cy).toBeCloseTo(pose.dy, 9);
    }
    expect(originFor(w, h, REST)).toEqual({ x: 0.5, y: 0.5 });
  });
});

function range(p: BossPattern, stepMs = 1): number[] {
  const out: number[] = [];
  for (let ms = -leadMs(p); ms <= tailMs(p); ms += stepMs) out.push(ms);
  return out;
}
