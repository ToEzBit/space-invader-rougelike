import { describe, expect, it } from 'vitest';
import { COLORS } from '../art/palette';
import { HIDDEN, HP_BAR_MS, hitBar, hpBarColor, tickBar, type HpBar } from './hpBar';

const run = (bar: HpBar, ratio: number, ms: number, frameMs = 16): HpBar => {
  for (let t = 0; t < ms; t += frameMs) bar = tickBar(bar, ratio, frameMs);
  return bar;
};

describe('foe HP bar', () => {
  it('shows the lost slice as a chip that shrinks to the new HP within about 250ms', () => {
    const hit = hitBar(HIDDEN, 1, true);
    expect(hit).toMatchObject({ kind: 'shown', chip: 1 });
    expect(run(hit, 0.8, 96)).toMatchObject({ chip: 1 });
    const settled = run(hit, 0.8, 256);
    expect(settled.kind === 'shown' && settled.chip - 0.8).toBeLessThan(0.02);
  });

  it('hides once no damage has landed for HP_BAR_MS', () => {
    const hit = hitBar(HIDDEN, 1, true);
    expect(run(hit, 0.8, HP_BAR_MS - 32).kind).toBe('shown');
    expect(run(hit, 0.8, HP_BAR_MS + 16)).toEqual(HIDDEN);
  });

  it('keeps showing under damage every frame without holding the chip again', () => {
    let bar = hitBar(HIDDEN, 1, true);
    let ratio = 1;
    for (let t = 0; t < 2 * HP_BAR_MS; t += 16) {
      ratio -= 0.004;
      bar = tickBar(hitBar(bar, ratio + 0.004, false), ratio, 16);
    }
    expect(bar.kind).toBe('shown');
    expect(bar.kind === 'shown' && bar.chip - ratio).toBeLessThan(0.02);
  });

  it('never shows on a boss', () => {
    expect(run(hitBar({ kind: 'hud' }, 0.5, true), 0.4, 100)).toEqual({ kind: 'hud' });
  });

  it('colors the fill green, then yellow, then red as HP drops', () => {
    expect(hpBarColor(0.9)).toBe(COLORS.green);
    expect(hpBarColor(0.5)).toBe(COLORS.yellow);
    expect(hpBarColor(0.2)).toBe(COLORS.red);
  });
});
