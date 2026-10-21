import { describe, expect, it } from 'vitest';
import { frontRank, marchSpeed } from './march';

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
});
