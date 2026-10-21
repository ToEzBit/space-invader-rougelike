import { describe, expect, it } from 'vitest';
import { PALETTE } from './palette';
import { SPRITES } from './sprites';

describe('sprites', () => {
  it('are rectangular and only use palette colors', () => {
    for (const [key, grid] of Object.entries(SPRITES)) {
      const width = grid[0]!.length;
      for (const row of grid) {
        expect(row.length, key).toBe(width);
        for (const ch of row) expect(ch === '.' || ch in PALETTE, `${key} uses '${ch}'`).toBe(true);
      }
    }
  });
});
