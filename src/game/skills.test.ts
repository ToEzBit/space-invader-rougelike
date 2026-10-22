import { describe, expect, it } from 'vitest';
import { TRANS_AM } from '../core/transAm';
import { chargesMeter, cooldownMeter, READY, sweepAngle, transAmMeter } from './skills';

describe('chargesMeter', () => {
  it('is ready with no refill on a full stack', () => {
    expect(chargesMeter({ count: 2, msToNext: 4000 }, 2, 4000)).toEqual({ kind: 'ready', charges: 2, maxCharges: 2, refill: null });
  });

  it('is ready with refill progress while a spare charge recharges', () => {
    expect(chargesMeter({ count: 1, msToNext: 1000 }, 2, 4000)).toEqual({ kind: 'ready', charges: 1, maxCharges: 2, refill: 0.75 });
  });

  it('cools down only when no charge is left', () => {
    expect(chargesMeter({ count: 0, msToNext: 3000 }, 2, 4000)).toEqual({ kind: 'cooling', msLeft: 3000, progress: 0.25, charges: 0, maxCharges: 2 });
  });
});

describe('cooldownMeter', () => {
  it('clamps progress when a refund leaves less than a full cooldown', () => {
    expect(cooldownMeter(5000, 4000)).toMatchObject({ kind: 'cooling', progress: 0 });
    expect(cooldownMeter(-10, 4000)).toMatchObject({ kind: 'cooling', progress: 1 });
  });
});

describe('sweepAngle', () => {
  it('starts at 12 o clock and turns clockwise', () => {
    expect(sweepAngle(0)).toBeCloseTo(-Math.PI / 2);
    expect(sweepAngle(0.25)).toBeCloseTo(0);
    expect(sweepAngle(0.5)).toBeCloseTo(Math.PI / 2);
    expect(sweepAngle(1)).toBeCloseTo((Math.PI * 3) / 2);
  });
});

describe('transAmMeter', () => {
  it('shows the gauge fill while charging and ready once full', () => {
    expect(transAmMeter({ kind: 'charging', gauge: TRANS_AM.gaugeMax / 4 })).toEqual({ kind: 'charging', ratio: 0.25 });
    expect(transAmMeter({ kind: 'charging', gauge: TRANS_AM.gaugeMax })).toEqual(READY);
  });

  it('drains while active and counts the depleted time down like a cooldown', () => {
    expect(transAmMeter({ kind: 'active', msLeft: TRANS_AM.activeMs / 2 })).toEqual({ kind: 'active', ratioLeft: 0.5 });
    expect(transAmMeter({ kind: 'depleted', msLeft: TRANS_AM.depletedMs / 4 })).toMatchObject({ kind: 'cooling', msLeft: TRANS_AM.depletedMs / 4, progress: 0.75 });
  });
});
