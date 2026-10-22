import { describe, expect, it } from 'vitest';
import { TRANS_AM, tick, type TransAm } from '../core/transAm';
import { humAt, tickHz, ticksCrossed, TRANS_AM_SOUND } from './transAmLayers';

const FRAME_MS = 1000 / 60;

function ticksOver(frameMs: number): { index: number; msLeft: number }[] {
  const fired: { index: number; msLeft: number }[] = [];
  let t: TransAm = { kind: 'active', msLeft: TRANS_AM.activeMs };
  while (t.kind === 'active') {
    const next = tick(t, frameMs);
    const msLeft = next.kind === 'active' ? next.msLeft : 0;
    for (const index of ticksCrossed(t.msLeft, msLeft)) fired.push({ index, msLeft });
    t = next;
  }
  return fired;
}

describe('TRANS-AM drive hum', () => {
  it('fades in from silence at the release and holds full after the fade', () => {
    expect(humAt(0).gain).toBe(0);
    expect(humAt(TRANS_AM_SOUND.hum.fadeInMs / 2).gain).toBeCloseTo(0.5);
    expect(humAt(TRANS_AM_SOUND.hum.fadeInMs).gain).toBe(1);
    expect(humAt(TRANS_AM.activeMs).gain).toBe(1);
  });

  it('rises in pitch, brightness and tremolo from the release to the end of the active time', () => {
    const { hum } = TRANS_AM_SOUND;
    expect(humAt(0)).toMatchObject({ hz: hum.hz.from, cutoffHz: hum.cutoffHz.from, tremoloHz: hum.tremoloHz.from });
    const end = humAt(TRANS_AM.activeMs);
    expect(end.hz).toBeCloseTo(hum.hz.to);
    expect(end.cutoffHz).toBeCloseTo(hum.cutoffHz.to);
    expect(end.tremoloHz).toBeCloseTo(hum.tremoloHz.to);
    for (let ms = FRAME_MS; ms <= TRANS_AM.activeMs; ms += FRAME_MS) {
      const [a, b] = [humAt(ms - FRAME_MS), humAt(ms)];
      expect(b.hz).toBeGreaterThan(a.hz);
      expect(b.cutoffHz).toBeGreaterThan(a.cutoffHz);
      expect(b.tremoloHz).toBeGreaterThan(a.tremoloHz);
    }
  });

  it('climbs the same interval in each half of the active time', () => {
    const [start, mid, end] = [0, TRANS_AM.activeMs / 2, TRANS_AM.activeMs].map((ms) => humAt(ms).hz);
    expect(mid! / start!).toBeCloseTo(end! / mid!);
  });
});

describe('TRANS-AM ending ticks', () => {
  it('fire once each, in order, inside the last 1.5 s of the active time and never before', () => {
    for (const frameMs of [FRAME_MS, 50, 7]) {
      const fired = ticksOver(frameMs);
      expect(fired.map((f) => f.index)).toEqual(TRANS_AM_SOUND.tick.atMsLeft.map((_, i) => i));
      for (const f of fired) expect(f.msLeft).toBeLessThanOrEqual(1500);
    }
  });

  it('fire on the frame that reaches each tick time, not the frame after', () => {
    expect(ticksCrossed(1500 + FRAME_MS, 1500)).toEqual([0]);
    expect(ticksCrossed(1500, 1500 - FRAME_MS)).toEqual([]);
  });

  it('all fire when one long frame jumps past several', () => {
    expect(ticksCrossed(1600, 300)).toEqual([0, 1, 2, 3]);
  });

  it('rise in pitch, each a step above the last', () => {
    const hz = TRANS_AM_SOUND.tick.atMsLeft.map((_, i) => tickHz(i));
    expect(hz[0]).toBe(TRANS_AM_SOUND.tick.hz.from);
    expect(hz.at(-1)).toBeCloseTo(TRANS_AM_SOUND.tick.hz.to);
    for (let i = 1; i < hz.length; i++) expect(hz[i]).toBeGreaterThan(hz[i - 1]!);
  });

  it('come closer together as the active time runs out', () => {
    const at = TRANS_AM_SOUND.tick.atMsLeft;
    const gaps = at.slice(1).map((ms, i) => at[i]! - ms);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThan(gaps[i - 1]!);
  });
});
