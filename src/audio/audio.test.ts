import { describe, expect, it } from 'vitest';
import { trackFor } from './director';
import { beat, freqOf, midiOf, octaveUp, parseBars } from './score';
import { TRACKS, type Track, type TrackId } from './tracks';

const barsOf = (t: Track) => t.channels[0]!.bars.length;
const stepsPerBar = (t: Track) => t.stepsPerBeat * t.beatsPerBar;
const events = (t: Track, name: string) => parseBars(t.channels.find((c) => c.name === name)!.bars, stepsPerBar(t));
const DRUMS = new Set(['kick', 'snare', 'hat']);
const drumHitsPerBar = (t: Track) =>
  t.channels.filter((c) => DRUMS.has(c.voice)).reduce((n, c) => n + parseBars(c.bars, stepsPerBar(t)).length, 0) / barsOf(t);

describe('note names', () => {
  it('tune to concert pitch', () => {
    expect(freqOf(midiOf('A4'))).toBe(440);
    expect(freqOf(midiOf('C4'))).toBeCloseTo(261.63, 2);
    expect(freqOf(midiOf('A3'))).toBe(220);
  });

  it('read sharps and flats as the same key', () => {
    expect(midiOf('A#3')).toBe(midiOf('Bb3'));
    expect(midiOf('C#5') - midiOf('C5')).toBe(1);
    expect(midiOf('Cb4')).toBe(midiOf('B3'));
  });

  it('move up an octave', () => {
    expect(octaveUp('C#3')).toBe('C#4');
    expect(midiOf(octaveUp('Bb2')) - midiOf('Bb2')).toBe(12);
  });

  it('reject anything that is not a note', () => {
    expect(() => midiOf('H4')).toThrow();
    expect(() => midiOf('C')).toThrow();
  });
});

describe('bars', () => {
  it('hold notes, rest, stack chords and accent hits', () => {
    expect(parseBars(['A4 - - . E4+G4 - x X'], 8)).toEqual([
      { step: 0, steps: 3, midis: [69], accent: false },
      { step: 4, steps: 2, midis: [64, 67], accent: false },
      { step: 6, steps: 1, midis: [], accent: false },
      { step: 7, steps: 1, midis: [], accent: true },
    ]);
  });

  it('carry a hold over the bar line and count steps across bars', () => {
    expect(parseBars(['. . C4 -', '- . D4 .'], 4)).toEqual([
      { step: 2, steps: 3, midis: [60], accent: false },
      { step: 6, steps: 1, midis: [62], accent: false },
    ]);
  });

  it('refuse a bar of the wrong length and a hold after a rest', () => {
    expect(() => parseBars(['C4 . .'], 4)).toThrow(/bar 1 has 3 steps/);
    expect(() => parseBars(['C4 . - .'], 4)).toThrow(/holds nothing/);
  });

  it('fill a rhythm with the notes its symbols stand for', () => {
    expect(beat('L . H x', { L: 'E2', H: 'E3' })).toBe('E2 . E3 x');
  });
});

describe('tracks', () => {
  const ids = Object.keys(TRACKS) as TrackId[];

  it('have whole bars in every channel and one loop length per track', () => {
    for (const id of ids) {
      const t = TRACKS[id];
      for (const c of t.channels) {
        expect(c.bars.length, `${id} ${c.name}`).toBe(barsOf(t));
        expect(() => parseBars(c.bars, stepsPerBar(t)), `${id} ${c.name}`).not.toThrow();
      }
    }
  });

  it('loop long enough not to grate', () => {
    expect(barsOf(TRACKS.normal)).toBeGreaterThanOrEqual(8);
    expect(barsOf(TRACKS.normal)).toBeLessThanOrEqual(16);
    expect(barsOf(TRACKS.boss1)).toBeGreaterThanOrEqual(16);
    expect(barsOf(TRACKS.boss2)).toBeGreaterThanOrEqual(16);
  });

  it('never leave a channel silent', () => {
    for (const id of ids) for (const c of TRACKS[id].channels) expect(parseBars(c.bars, stepsPerBar(TRACKS[id])).length, `${id} ${c.name}`).toBeGreaterThan(0);
  });

  it('keep every pitch in a range small speakers can play and ears can bear', () => {
    for (const id of ids)
      for (const c of TRACKS[id].channels)
        for (const e of parseBars(c.bars, stepsPerBar(TRACKS[id])))
          for (const m of e.midis) {
            expect(freqOf(m), `${id} ${c.name}`).toBeGreaterThanOrEqual(80);
            expect(freqOf(m), `${id} ${c.name}`).toBeLessThanOrEqual(1600);
          }
  });

  it('push the boss music harder: the boss outpaces the stage, and the second form outpaces the first', () => {
    expect(TRACKS.boss1.bpm).toBeGreaterThan(TRACKS.normal.bpm);
    expect(TRACKS.boss2.bpm).toBeGreaterThan(TRACKS.boss1.bpm);
    expect(events(TRACKS.boss2, 'lead').length).toBeGreaterThan(events(TRACKS.boss1, 'lead').length);
    expect(drumHitsPerBar(TRACKS.boss2)).toBeGreaterThanOrEqual(1.5 * drumHitsPerBar(TRACKS.boss1));
  });
});

describe('the track for the moment', () => {
  it('is the normal track outside a boss fight', () => {
    expect(trackFor(null)).toBe('normal');
  });

  it("is the first boss track from the boss's entrance until she starts to transform", () => {
    for (const stanceKind of ['entering', 'fighting', 'casting'] as const) expect(trackFor({ form: 0, stanceKind })).toBe('boss1');
  });

  it('switches to the second boss track as the transformation starts, before the form flips', () => {
    expect(trackFor({ form: 0, stanceKind: 'transforming' })).toBe('boss2');
    expect(trackFor({ form: 1, stanceKind: 'transforming' })).toBe('boss2');
    for (const stanceKind of ['fighting', 'casting'] as const) expect(trackFor({ form: 1, stanceKind })).toBe('boss2');
  });

  it('falls silent once the boss is dead', () => {
    expect(trackFor({ form: 1, stanceKind: 'dead' })).toBeNull();
  });
});
