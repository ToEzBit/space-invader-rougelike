import { describe, expect, it } from 'vitest';
import { CUT_IN, CUT_IN_MS, cutInPose, type CutInPose } from './cutIn';

const pose = (ms: number): CutInPose => {
  const p = cutInPose(ms);
  if (!p) throw new Error(`no pose at ${ms}ms`);
  return p;
};
const bandStart = CUT_IN.dimMs;
const slashStart = CUT_IN.dimMs + CUT_IN.bandMs;
const every = (from: number, to: number, stepMs = 10) => Array.from({ length: Math.floor((to - from) / stepMs) + 1 }, (_, i) => from + i * stepMs);

describe('trans-am cut-in', () => {
  it('lasts about a second and is over at its end', () => {
    expect(CUT_IN_MS).toBe(1000);
    expect(cutInPose(0)).not.toBeNull();
    expect(cutInPose(CUT_IN_MS - 1)).not.toBeNull();
    expect(cutInPose(CUT_IN_MS)).toBeNull();
    expect(cutInPose(CUT_IN_MS + 500)).toBeNull();
  });

  it('dims the screen first, with the band still off screen', () => {
    expect(pose(0).dim).toBe(0);
    expect(pose(CUT_IN.dimMs / 2).dim).toBeCloseTo(0.5);
    for (const ms of every(0, CUT_IN.dimMs - 1)) expect(pose(ms)).toMatchObject({ slide: -1, red: 0, title: 0, slash: null, flash: 0 });
    expect(pose(bandStart).dim).toBe(1);
  });

  it('slides the band in and holds it centred through most of the band beat', () => {
    expect(pose(bandStart).slide).toBe(-1);
    for (const ms of every(bandStart + CUT_IN.bandMs * 0.25, slashStart - 1)) expect(pose(ms).slide).toBe(0);
  });

  it('turns the eyes from blue to red during the band, never back', () => {
    expect(pose(bandStart).red).toBe(0);
    const mid = pose(bandStart + CUT_IN.bandMs * 0.55).red;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(pose(slashStart - 1).red).toBe(1);
    const reds = every(0, CUT_IN_MS - 1, 5).map((ms) => pose(ms).red);
    expect(reds.every((r, i) => i === 0 || r >= reds[i - 1]!)).toBe(true);
  });

  it('shows the title once the band is in', () => {
    expect(pose(bandStart).title).toBe(0);
    expect(pose(bandStart + CUT_IN.bandMs * 0.5).title).toBe(1);
  });

  it('sweeps the slash only at the start of the last beat, then flashes', () => {
    for (const ms of every(0, slashStart - 1)) expect(pose(ms).slash).toBeNull();
    expect(pose(slashStart).slash).toBe(0);
    const sweep = every(slashStart, slashStart + CUT_IN.slashMs * 0.34).map((ms) => pose(ms).slash!);
    expect(sweep.every((s, i) => i === 0 || s > sweep[i - 1]!)).toBe(true);
    expect(pose(slashStart + CUT_IN.slashMs * 0.5).slash).toBeNull();
    expect(pose(slashStart).flash).toBe(0);
    expect(pose(slashStart + CUT_IN.slashMs * 0.3).flash).toBe(1);
  });

  it('ends with the band gone, the flash out and the dim lifted', () => {
    const last = pose(CUT_IN_MS - 1);
    expect(last.slide).toBeGreaterThan(0.95);
    expect(last.flash).toBe(0);
    expect(last.dim).toBeLessThan(0.01);
  });
});
