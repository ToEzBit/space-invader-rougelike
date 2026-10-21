import { describe, expect, it } from 'vitest';
import { CHARACTER_ART } from './characters';
import { PALETTE } from './palette';
import { SPRITES } from './sprites';
import manifestJson from '../../art-src/chibi-ui/manifest.json?raw';
import { UI_FRAMES, UI_ICONS, UI_IMAGES } from './ui';

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
    expect(files).toEqual([...Object.keys(UI_ICONS), ...Object.keys(UI_FRAMES), ...Object.keys(UI_IMAGES)].map((key) => `${key}.png`).sort());
  });

  type Entry = { key: string; kind: 'icon' | 'image' | 'nineSlice'; w: number; h: number; insets?: Record<string, number> };
  const manifest = new Map((JSON.parse(manifestJson) as { assets: Entry[] }).assets.map((a) => [a.key, a]));
  const pngs = import.meta.glob<string>('../assets/ui/*.png', { query: '?inline', import: 'default', eager: true });
  // A PNG's IHDR chunk holds its width and height as big-endian words at bytes 16 and 20.
  const sizeOf = (key: string) => {
    const bytes = Uint8Array.from(atob(pngs[`../assets/ui/${key}.png`]!.split(',')[1]!), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    return { w: view.getUint32(16), h: view.getUint32(20) };
  };
  const kinds = [
    ['icon', UI_ICONS],
    ['image', UI_IMAGES],
    ['nineSlice', UI_FRAMES],
  ] as const;

  it('ships each PNG at the size and kind art-src/chibi-ui/manifest.json gives it', () => {
    for (const [kind, assets] of kinds)
      for (const key of Object.keys(assets)) {
        const entry = manifest.get(key);
        expect(entry?.kind, key).toBe(kind);
        expect(sizeOf(key), key).toEqual({ w: entry?.w, h: entry?.h });
      }
  });

  it('uses the manifest 9-slice insets, which leave every frame a stretchable center', () => {
    for (const [key, { insets }] of Object.entries(UI_FRAMES)) {
      expect(insets, key).toEqual(manifest.get(key)?.insets);
      const { w, h } = sizeOf(key);
      expect(insets.left + insets.right, key).toBeLessThan(w);
      expect(insets.top + insets.bottom, key).toBeLessThan(h);
    }
  });
});
