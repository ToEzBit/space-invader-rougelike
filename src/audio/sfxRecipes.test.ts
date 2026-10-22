import { describe, expect, it } from 'vitest';
import { withBuffs } from '../core/items';
import { deriveStats, OVERDRIVE_CALM_MS, PERKS } from '../core/perks';
import { BOSSES, type BossPattern } from '../core/stages';
import { MOTIONS } from '../game/bossMotion';
import { PATTERNS } from '../game/patterns';
import { fireInterval } from '../game/volley';
import { CAST_SOUND, recipeMs, shotPitch, SOUNDS, type Sound } from './sfxRecipes';

const BEFORE_LAYERS: Partial<Record<Sound, [OscillatorType, number, number, number, number, number]>> = {
  pop: ['square', 520, 90, 90, 0.05, 45],
  boom: ['sawtooth', 160, 30, 500, 0.12, 120],
  hurt: ['sawtooth', 300, 60, 260, 0.12, 100],
  buy: ['triangle', 660, 1320, 160, 0.1, 60],
  deny: ['square', 140, 110, 140, 0.07, 100],
  dash: ['sawtooth', 200, 900, 220, 0.07, 100],
  phase: ['square', 90, 400, 600, 0.08, 300],
  transAm: ['sawtooth', 120, 1600, 700, 0.1, 300],
  powerDown: ['triangle', 600, 70, 650, 0.1, 300],
};

const ALL_PATTERNS = Object.keys(PATTERNS) as BossPattern[];
const castPatterns = ALL_PATTERNS.filter((p) => PATTERNS[p].cast);
const shortestGapMs = Math.min(...Object.values(BOSSES).flatMap((b) => b.forms.flatMap((f) => f.phases.map((p) => p.patternGapMs))));

describe('sfx recipes', () => {
  it('keep the sounds the music is levelled against exactly as they were', () => {
    for (const [name, [wave, from, to, ms, gain, minGapMs]] of Object.entries(BEFORE_LAYERS)) {
      const r = SOUNDS[name as Sound];
      expect(r.minGapMs, name).toBe(minGapMs);
      expect(r.layers, name).toEqual([{ kind: 'tone', wave, hz: { from, to }, ms, gain }]);
    }
  });

  it('end within a second, after any attack, at an audible level', () => {
    for (const [name, r] of Object.entries(SOUNDS)) {
      expect(recipeMs(r), name).toBeLessThanOrEqual(1000);
      for (const l of r.layers) {
        expect(l.gain, name).toBeGreaterThan(0);
        expect(l.attackMs ?? 0, name).toBeLessThan(l.ms);
        expect(Math.min(l.hz.from, l.hz.to), name).toBeGreaterThan(20);
        expect(Math.max(l.hz.from, l.hz.to), name).toBeLessThan(20000);
      }
    }
  });

  it('let the gun sound every volley at the fastest fire rate outside TRANS-AM', () => {
    const maxed = deriveStats({ hairTrigger: PERKS.hairTrigger.maxLevel, overdrive: PERKS.overdrive.maxLevel });
    const fastestMs = fireInterval(withBuffs(maxed, ['overclock']), OVERDRIVE_CALM_MS);
    expect(fastestMs).toBeLessThan(60);
    expect(SOUNDS.shot.minGapMs).toBeLessThan(fastestMs);
    expect(recipeMs(SOUNDS.shot)).toBeLessThan(fastestMs * 1.5);
  });

  it('nudge the pitch of consecutive volleys by less than a semitone, never drifting', () => {
    const pitches = Array.from({ length: 1000 }, (_, i) => shotPitch(i));
    for (let i = 1; i < pitches.length; i++) expect(pitches[i]).not.toBe(pitches[i - 1]);
    for (const p of pitches) expect(Math.abs(Math.log2(p) * 12)).toBeLessThan(1);
  });

  it('give each boss move the cast sound of its tier, with an ultimate sized to its charge', () => {
    for (const p of castPatterns) expect(MOTIONS[p].tier, p).toBe('ultimate');
    expect(recipeMs(SOUNDS[CAST_SOUND.ultimate])).toBeLessThanOrEqual(Math.min(...castPatterns.map((p) => PATTERNS[p].cast!.chargeMs)));
    expect(recipeMs(SOUNDS[CAST_SOUND.light])).toBeLessThan(recipeMs(SOUNDS[CAST_SOUND.heavy]));
    expect(recipeMs(SOUNDS[CAST_SOUND.heavy])).toBeLessThan(recipeMs(SOUNDS[CAST_SOUND.ultimate]));
    expect(recipeMs(SOUNDS[CAST_SOUND.heavy])).toBeLessThan(shortestGapMs);
  });
});
