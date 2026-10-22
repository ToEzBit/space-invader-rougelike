import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './stats';
import { activate, carriedGauge, charging, enemyTimeScale, gain, isFull, loseOnHit, releaseProgress, tick, TRANS_AM, withTransAm, type TransAm } from './transAm';

const full = charging(TRANS_AM.gaugeMax);

function runFor(t: TransAm, ms: number, stepMs = 16): TransAm {
  for (let left = ms; left > 0; left -= stepMs) t = tick(t, Math.min(stepMs, left));
  return t;
}

describe('trans-am gauge', () => {
  it('fills while charging and stops at the cap', () => {
    expect(gain(charging(10), 2.5)).toEqual({ kind: 'charging', gauge: 12.5 });
    expect(gain(charging(TRANS_AM.gaugeMax - 1), 5)).toEqual(full);
  });

  it('cannot gain while active or depleted', () => {
    const active = activate(full)!;
    expect(gain(active, 50)).toBe(active);
    const depleted = runFor(active, TRANS_AM.activeMs);
    expect(depleted.kind).toBe('depleted');
    expect(gain(depleted, 50)).toBe(depleted);
  });

  it('loses hitLoss on a landed hit, never below 0', () => {
    expect(loseOnHit(charging(50))).toEqual(charging(50 - TRANS_AM.hitLoss));
    expect(loseOnHit(charging(TRANS_AM.hitLoss / 2))).toEqual(charging(0));
  });

  it('carries the gauge only while charging', () => {
    expect(carriedGauge(charging(37))).toBe(37);
    expect(carriedGauge(activate(full)!)).toBe(0);
    expect(carriedGauge(runFor(activate(full)!, TRANS_AM.activeMs))).toBe(0);
  });
});

describe('trans-am activation', () => {
  it('is refused until the gauge is full', () => {
    expect(activate(charging(TRANS_AM.gaugeMax - 0.5))).toBeNull();
    expect(isFull(charging(TRANS_AM.gaugeMax - 0.5))).toBe(false);
    expect(activate(full)).toEqual({ kind: 'active', msLeft: TRANS_AM.activeMs });
  });

  it('is refused while already active or depleted', () => {
    const active = activate(full)!;
    expect(activate(active)).toBeNull();
    expect(activate(runFor(active, TRANS_AM.activeMs))).toBeNull();
  });
});

describe('trans-am phases', () => {
  it('runs active for activeMs, depleted for depletedMs, then charges from 0', () => {
    let t = activate(full)!;
    t = runFor(t, TRANS_AM.activeMs - 1);
    expect(t.kind).toBe('active');
    t = tick(t, 1);
    expect(t).toEqual({ kind: 'depleted', msLeft: TRANS_AM.depletedMs });
    t = runFor(t, TRANS_AM.depletedMs - 1);
    expect(t.kind).toBe('depleted');
    expect(tick(t, 1)).toEqual(charging(0));
  });

  it('starts the next phase in full when a tick overshoots the boundary', () => {
    expect(tick({ kind: 'active', msLeft: 10 }, 50)).toEqual({ kind: 'depleted', msLeft: TRANS_AM.depletedMs });
  });

  it('leaves charging untouched by time', () => {
    const t = charging(40);
    expect(tick(t, 10_000)).toBe(t);
  });

  it('releases over the first releaseMs of the active time', () => {
    const active = activate(full)!;
    expect(releaseProgress(active)).toBe(0);
    expect(releaseProgress(tick(active, TRANS_AM.releaseMs / 2))).toBeCloseTo(0.5);
    expect(releaseProgress(tick(active, TRANS_AM.releaseMs))).toBeNull();
    expect(releaseProgress(full)).toBeNull();
  });

  it('slows enemies only while active', () => {
    const active = activate(full)!;
    expect(enemyTimeScale(full)).toBe(1);
    expect(enemyTimeScale(active)).toBe(TRANS_AM.enemyTimeScale);
    expect(enemyTimeScale(runFor(active, TRANS_AM.activeMs))).toBe(1);
  });
});

describe('trans-am stats', () => {
  it('leaves stats alone while charging', () => {
    expect(withTransAm(BASE_STATS, charging(80))).toEqual(BASE_STATS);
  });

  it('fires faster, moves faster and pierces one more foe while active, with no damage bonus', () => {
    const s = withTransAm(BASE_STATS, activate(full)!);
    expect(s.fireIntervalMs).toBeLessThan(BASE_STATS.fireIntervalMs);
    expect(s.moveSpeed).toBeGreaterThan(BASE_STATS.moveSpeed);
    expect(s.pierce).toBe(BASE_STATS.pierce + 1);
    expect(s.bulletDamage).toBe(BASE_STATS.bulletDamage);
  });

  it('fires slower and moves slower while depleted', () => {
    const s = withTransAm(BASE_STATS, { kind: 'depleted', msLeft: 1000 });
    expect(s.fireIntervalMs).toBeGreaterThan(BASE_STATS.fireIntervalMs);
    expect(s.moveSpeed).toBeLessThan(BASE_STATS.moveSpeed);
    expect(s.pierce).toBe(BASE_STATS.pierce);
  });

  it('never mutates the stats it folds over', () => {
    const base = { ...BASE_STATS };
    withTransAm(base, activate(full)!);
    expect(base).toEqual(BASE_STATS);
  });
});
