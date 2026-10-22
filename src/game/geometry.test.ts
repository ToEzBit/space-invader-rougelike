import { describe, expect, it } from 'vitest';
import { distanceToSegment, rayEnd, stepToward, stepWithin } from './geometry';

describe('geometry', () => {
  it('measures distance to the nearest point of a segment, clamped to its ends', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: -100 };
    expect(distanceToSegment({ x: 5, y: -50 }, a, b)).toBeCloseTo(5);
    expect(distanceToSegment({ x: 0, y: 10 }, a, b)).toBeCloseTo(10);
  });

  it('leans rays right for positive angles', () => {
    const end = rayEnd({ x: 0, y: 0 }, 20, 100);
    expect(end.x).toBeGreaterThan(30);
    expect(end.y).toBeLessThan(-90);
  });

  it('steps a diagonal no farther than a straight move', () => {
    const box = { left: 0, right: 1000, top: 0, bottom: 1000 };
    const diag = stepWithin({ x: 500, y: 500 }, { x: 1, y: -1 }, 50, box);
    expect(Math.hypot(diag.x - 500, diag.y - 500)).toBeCloseTo(50);
    expect(diag.x - 500).toBeCloseTo(500 - diag.y);
    expect(stepWithin({ x: 500, y: 500 }, { x: 0, y: 1 }, 50, box)).toEqual({ x: 500, y: 550 });
    expect(stepWithin({ x: 500, y: 500 }, { x: 0, y: 0 }, 50, box)).toEqual({ x: 500, y: 500 });
  });

  it('clamps each axis into the box on its own', () => {
    const box = { left: 10, right: 100, top: 384, bottom: 572 };
    const top = stepWithin({ x: 50, y: 390 }, { x: 1, y: -1 }, 50, box);
    expect(top.y).toBe(384);
    expect(top.x).toBeCloseTo(50 + 50 / Math.SQRT2);
    expect(stepWithin({ x: 95, y: 570 }, { x: 1, y: 1 }, 50, box)).toEqual({ x: 100, y: 572 });
  });

  it('flies toward a target at most the step distance and stops exactly on it', () => {
    const box = { left: 0, right: 1000, top: 0, bottom: 1000 };
    const far = stepToward({ x: 100, y: 100 }, { x: 400, y: 500 }, 50, box);
    expect(Math.hypot(far.x - 100, far.y - 100)).toBeCloseTo(50);
    expect((far.y - 100) / (far.x - 100)).toBeCloseTo(4 / 3);
    expect(stepToward({ x: 100, y: 100 }, { x: 120, y: 110 }, 50, box)).toEqual({ x: 120, y: 110 });
    expect(stepToward({ x: 120, y: 110 }, { x: 120, y: 110 }, 50, box)).toEqual({ x: 120, y: 110 });
  });

  it('keeps a target past the wall inside the box', () => {
    const box = { left: 10, right: 100, top: 384, bottom: 572 };
    expect(stepToward({ x: 95, y: 500 }, { x: 98, y: 600 }, 500, box)).toEqual({ x: 98, y: 572 });
  });
});
