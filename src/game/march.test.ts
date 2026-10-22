import { describe, expect, it } from 'vitest';
import { VIEW } from '../viewSize';
import { diveOver, frontRank, marchSpeed } from './march';

describe('march', () => {
  it('speeds up as enemies die', () => {
    expect(marchSpeed(20, 30, 30)).toBe(20);
    expect(marchSpeed(20, 15, 30)).toBeGreaterThan(20);
    expect(marchSpeed(20, 1, 30)).toBeGreaterThan(marchSpeed(20, 15, 30));
  });

  it('picks the bottom-most member of each column as a shooter', () => {
    const members = [
      { col: 0, row: 0 },
      { col: 0, row: 2 },
      { col: 1, row: 1 },
    ];
    expect(frontRank(members)).toEqual([{ col: 0, row: 2 }, { col: 1, row: 1 }]);
  });

  it('ends a dive that leaves the screen on any side, so a diver aimed up at the ship comes back', () => {
    expect(diveOver({ x: 240, y: 320 })).toBe(false);
    expect(diveOver({ x: 240, y: VIEW.h + 30 })).toBe(true);
    expect(diveOver({ x: 141, y: -407 })).toBe(true);
    expect(diveOver({ x: -497, y: 118 })).toBe(true);
    expect(diveOver({ x: VIEW.w + 30, y: 118 })).toBe(true);
  });
});
