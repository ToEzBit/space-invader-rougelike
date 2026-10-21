import { describe, expect, it } from 'vitest';
import { distanceToSegment, rayEnd } from './geometry';

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
});
