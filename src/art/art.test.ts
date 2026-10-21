import { describe, expect, it } from 'vitest';
import { CHARACTER_ART } from './characters';
import { PALETTE } from './palette';
import { SPRITES } from './sprites';
import { UI_ICONS } from './ui';

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

  it('leave no palette color unused', () => {
    const used = new Set(Object.values(SPRITES).flatMap((grid) => grid.flatMap((row) => [...row])));
    expect(Object.keys(PALETTE).filter((ch) => !used.has(ch))).toEqual([]);
  });
});

describe('character art', () => {
  it('loads every PNG in src/assets/characters, one per character', () => {
    const files = Object.keys(import.meta.glob('../assets/characters/*.png')).map((path) => path.split('/').pop()).sort();
    expect(files).toEqual(Object.keys(CHARACTER_ART).map((key) => `${key}.png`).sort());
  });
});

describe('UI art', () => {
  it('loads every PNG in src/assets/ui, one per UI asset', () => {
    const files = Object.keys(import.meta.glob('../assets/ui/*.png')).map((path) => path.split('/').pop()).sort();
    expect(files).toEqual(Object.keys(UI_ICONS).map((key) => `${key}.png`).sort());
  });
});
