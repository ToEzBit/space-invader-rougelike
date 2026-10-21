import { describe, expect, it } from 'vitest';
import { BOSSES } from '../core/stages';
import { bossPhaseIndex } from './phases';

describe('bossPhaseIndex', () => {
  const phases = BOSSES.voidEmpress.phases;

  it('starts in the first phase and advances at each threshold', () => {
    expect(bossPhaseIndex(phases, 1)).toBe(0);
    expect(bossPhaseIndex(phases, 0.67)).toBe(0);
    expect(bossPhaseIndex(phases, 0.66)).toBe(1);
    expect(bossPhaseIndex(phases, 0.2)).toBe(2);
  });
});
