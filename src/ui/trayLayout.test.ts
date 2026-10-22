import { describe, expect, it } from 'vitest';
import { VIEW } from '../viewSize';
import { placeTray, TRAY } from './trayLayout';

const all = (p: ReturnType<typeof placeTray>) => [...p.skills, ...p.items];

// No two slots closer than one gap, so hit circles a gap across never overlap.
function spaced(p: ReturnType<typeof placeTray>): boolean {
  const slots = all(p);
  return slots.every((a, i) => slots.slice(i + 1).every((b) => Math.hypot(a.x - b.x, a.y - b.y) >= p.scale * TRAY.gap - 1e-9));
}

describe('placeTray', () => {
  it('keeps the playfield tray where it always was without a band', () => {
    const p = placeTray(2, 3, null);
    expect(p).toEqual({
      scale: 1,
      skills: [{ x: 32, y: 604 }, { x: 84, y: 604 }],
      items: [{ x: 344, y: 604 }, { x: 396, y: 604 }, { x: 448, y: 604 }],
    });
  });

  it('centers a short tray in one enlarged row in a tall band', () => {
    const p = placeTray(2, 2, 199);
    expect(p.scale).toBe(1.4);
    expect(all(p).every((s) => s.y === VIEW.h + 199 / 2)).toBe(true);
    expect(spaced(p)).toBe(true);
  });

  it('puts skills on a row above items when a full tray would shrink in one row', () => {
    const p = placeTray(4, 5, 199);
    expect(p.scale).toBe(1.4);
    expect(Math.max(...p.skills.map((s) => s.y))).toBeLessThan(Math.min(...p.items.map((s) => s.y)));
    expect(spaced(p)).toBe(true);
    expect(all(p).every((s) => s.x - p.scale * TRAY.r > 0 && s.x + p.scale * TRAY.r < VIEW.w)).toBe(true);
    expect(all(p).every((s) => s.y - p.scale * TRAY.gap / 2 >= VIEW.h && s.y + p.scale * TRAY.gap / 2 <= VIEW.h + 199)).toBe(true);
  });

  it('moves even a full tray off the playfield while the band holds it at its playfield size', () => {
    const p = placeTray(4, 5, 80);
    expect(p.scale).toBe(1);
    expect(all(p).every((s) => s.y === VIEW.h + 40)).toBe(true);
  });

  it('stays on the playfield when the band would have to shrink the tray', () => {
    expect(placeTray(4, 5, 60)).toEqual(placeTray(4, 5, null));
    expect(placeTray(1, 0, 40).skills[0]).toEqual({ x: 32, y: 604 });
  });
});
