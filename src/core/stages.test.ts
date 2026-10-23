import { describe, expect, it } from 'vitest';
import { BOSSES, STAGES, bossPhaseAt, healedHp, transformDue, type FormIndex } from './stages';

const empress = BOSSES.voidEmpress;

describe('boss forms', () => {
  it('give each form phases that start at full HP and fall in order', () => {
    for (const def of Object.values(BOSSES))
      for (const form of def.forms) {
        expect(form.phases[0]?.hpRatio).toBe(1);
        const ratios = form.phases.map((p) => p.hpRatio);
        expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
      }
  });

  it('pick the latest phase of the current form whose threshold HP has fallen to', () => {
    const [second] = empress.forms[0].phases.slice(1).map((p) => p.hpRatio);
    expect(bossPhaseAt(empress, 0, 1)).toBe(0);
    expect(bossPhaseAt(empress, 0, second! + 0.01)).toBe(0);
    expect(bossPhaseAt(empress, 0, second!)).toBe(1);
    expect(bossPhaseAt(empress, 1, 1)).toBe(0);
    const last = empress.forms[1].phases.length - 1;
    expect(bossPhaseAt(empress, 1, 0.01)).toBe(last);
  });

  it('transform once: only the first form at or below the threshold is due', () => {
    for (const def of Object.values(BOSSES)) {
      const at = def.transform.atHpRatio;
      let form: FormIndex = 0;
      let transforms = 0;
      for (const ratio of [1, at + 0.01, at, at - 0.05, at + 0.2, at - 0.1, 0.05]) {
        if (!transformDue(def, form, ratio)) continue;
        transforms++;
        form = 1;
      }
      expect(transforms).toBe(1);
      expect(transformDue(def, 0, at + 0.001)).toBe(false);
      expect(transformDue(def, 1, 0)).toBe(false);
    }
  });

  it('heal healRatio of full HP over the transformation, never past full', () => {
    for (const def of Object.values(BOSSES)) {
      const at = def.hp * def.transform.atHpRatio;
      expect(healedHp(def, at)).toBeCloseTo(at + def.hp * def.transform.healRatio);
      expect(healedHp(def, def.hp)).toBe(def.hp);
    }
  });

  it('change look and name between forms', () => {
    for (const { forms } of Object.values(BOSSES)) {
      expect(forms[1].texture).not.toBe(forms[0].texture);
      expect(forms[1].name).not.toBe(forms[0].name);
    }
  });
});

describe('wave stages', () => {
  const waves = STAGES.flatMap((def, i) => (def.kind === 'wave' ? [{ stage: i + 1, def }] : []));

  it('give Gunner Girls single needles through stage 3 and a 3-needle fan from stage 4 on', () => {
    expect(waves.map(({ stage, def }) => [stage, def.gunnerFan])).toEqual(waves.map(({ stage }) => [stage, stage <= 3 ? 1 : 3]));
  });

  it('fire more often stage by stage', () => {
    const rates = waves.map(({ def }) => def.fireRate);
    rates.slice(1).forEach((rate, i) => expect(rate).toBeGreaterThan(rates[i]!));
  });
});
