import { describe, expect, it } from 'vitest';
import { BOSSES, type BossPattern } from '../core/stages';
import { PATTERNS } from './patterns';

const SPECIALS: BossPattern[] = ['featherStorm', 'crossJudgement', 'blackHole', 'eclipseNova'];

describe('boss patterns', () => {
  it('give a charge and a callout to exactly the four specials', () => {
    const cast = Object.entries(PATTERNS).filter(([, def]) => def.cast).map(([id]) => id);
    expect(cast.sort()).toEqual([...SPECIALS].sort());
    for (const id of SPECIALS) {
      expect(PATTERNS[id].cast!.chargeMs).toBeGreaterThan(0);
      expect(PATTERNS[id].cast!.callout.length).toBeGreaterThan(0);
    }
  });

  it('keep specials for the second forms, each used by one', () => {
    const used = (form: 0 | 1) => new Set(Object.values(BOSSES).flatMap((b) => b.forms[form].phases.flatMap((p) => p.patterns)));
    for (const id of SPECIALS) {
      expect(used(0).has(id), id).toBe(false);
      expect(used(1).has(id), id).toBe(true);
    }
  });
});
