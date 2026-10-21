import { describe, expect, it } from 'vitest';
import { deriveStats, OVERDRIVE_CALM_MS } from '../core/perks';
import { fireInterval, volley } from './volley';

describe('volley', () => {
  it('fires one straight shot with no perks', () => {
    expect(volley(deriveStats({}))).toEqual([{ dx: 0, angle: 0 }]);
  });

  it('adds parallel barrels centered on the nose and mirrored spread pairs', () => {
    const barrels = volley(deriveStats({ twinCannons: 2, spreadFan: 2 }));
    expect(barrels.filter((b) => b.angle === 0).map((b) => b.dx)).toEqual([-9, 0, 9]);
    expect(barrels.filter((b) => b.angle !== 0).map((b) => b.angle).sort((a, b) => a - b)).toEqual([-24, -12, 12, 24]);
  });

  it('speeds up only after going long enough without a hit with overdrive', () => {
    const stats = deriveStats({ overdrive: 1 });
    expect(fireInterval(stats, 0)).toBe(stats.fireIntervalMs);
    expect(fireInterval(stats, OVERDRIVE_CALM_MS - 1)).toBe(stats.fireIntervalMs);
    expect(fireInterval(stats, OVERDRIVE_CALM_MS)).toBeCloseTo(stats.fireIntervalMs * 0.6);
    expect(fireInterval(deriveStats({}), 5000)).toBe(deriveStats({}).fireIntervalMs);
  });
});
