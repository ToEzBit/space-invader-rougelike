import { describe, expect, it } from 'vitest';
import { CUT_IN, SILENT_CUT_IN_MS, cutInPose, type CutInPose } from './cutIn';

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
    expect(SILENT_CUT_IN_MS).toBe(1000);
    expect(cutInPose(0)).not.toBeNull();
    expect(cutInPose(SILENT_CUT_IN_MS - 1)).not.toBeNull();
    expect(cutInPose(SILENT_CUT_IN_MS)).toBeNull();
    expect(cutInPose(SILENT_CUT_IN_MS + 500)).toBeNull();
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
    const reds = every(0, SILENT_CUT_IN_MS - 1, 5).map((ms) => pose(ms).red);
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
    const last = pose(SILENT_CUT_IN_MS - 1);
    expect(last.slide).toBeGreaterThan(0.95);
    expect(last.flash).toBe(0);
    expect(last.dim).toBeLessThan(0.01);
  });
});

describe('a cut-in stretched to a voice line', () => {
  const total = 2700;
  const slashStart = total - CUT_IN.slashMs;
  const pose = (ms: number): CutInPose => {
    const p = cutInPose(ms, total);
    if (!p) throw new Error(`no pose at ${ms}ms`);
    return p;
  };

  it('lasts the length it is given', () => {
    expect(cutInPose(total - 1, total)).not.toBeNull();
    expect(cutInPose(total, total)).toBeNull();
  });

  it('never runs shorter than the silent cut-in', () => {
    expect(cutInPose(SILENT_CUT_IN_MS - 1, 400)).toEqual(cutInPose(SILENT_CUT_IN_MS - 1));
    expect(cutInPose(SILENT_CUT_IN_MS, 400)).toBeNull();
  });

  it('starts at rest and dims first, as the silent one does', () => {
    expect(pose(0)).toMatchObject({ dim: 0, slide: -1, red: 0, title: 0, slash: null, flash: 0 });
    for (const ms of every(0, CUT_IN.dimMs - 1)) expect(pose(ms)).toEqual(cutInPose(ms));
  });

  it('brings the band and title in as fast as the silent one, then holds them until the slash', () => {
    for (const ms of every(CUT_IN.dimMs, CUT_IN.dimMs + 250)) {
      expect(pose(ms).slide).toBe(cutInPose(ms)!.slide);
      expect(pose(ms).title).toBe(cutInPose(ms)!.title);
    }
    for (const ms of every(CUT_IN.dimMs + 250, slashStart - 1)) expect(pose(ms)).toMatchObject({ slide: 0, title: 1, slash: null, flash: 0, dim: 1 });
  });

  it('spreads the eyes over the longer hold and has them red before the slash', () => {
    const reds = every(0, total - 1, 5).map((ms) => pose(ms).red);
    expect(reds.every((r, i) => i === 0 || r >= reds[i - 1]!)).toBe(true);
    const mid = pose((CUT_IN.dimMs + slashStart) / 2).red;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
    expect(pose(slashStart - 100).red).toBe(1);
  });

  it('ends with the same slash and flash as the silent one, and at rest', () => {
    for (const ms of every(0, CUT_IN.slashMs - 1)) expect(pose(slashStart + ms)).toEqual(cutInPose(CUT_IN.dimMs + CUT_IN.bandMs + ms));
    expect(pose(slashStart).slash).toBe(0);
    const last = pose(total - 1);
    expect(last.slide).toBeGreaterThan(0.95);
    expect(last.flash).toBe(0);
    expect(last.dim).toBeLessThan(0.01);
  });
});
