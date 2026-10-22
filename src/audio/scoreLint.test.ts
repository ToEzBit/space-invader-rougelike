import { describe, expect, it } from 'vitest';
import { lint, STRONG_BEAT_CHORD_TONES } from './scoreLint';
import { TRACKS, type ScoreId, type Track } from './tracks';

const ids = Object.keys(TRACKS) as ScoreId[];
const loops = ids.filter((id) => TRACKS[id].loop);
const jingles = ids.filter((id) => !TRACKS[id].loop);

describe('every score', () => {
  it('has one chord per bar', () => {
    for (const id of ids) for (const c of TRACKS[id].channels) expect(c.bars.length, `${id} ${c.name}`).toBe(TRACKS[id].chords.length);
  });

  it('keeps every pitched note in its key, or in a borrowed chord in a bar that chord harmonizes', () => {
    for (const id of ids) expect(lint(TRACKS[id]).outOfKey, id).toEqual([]);
  });

  it(`lands at least ${STRONG_BEAT_CHORD_TONES * 100}% of the lead's notes on beats 1 and 3 on tones of the bar's chord`, () => {
    for (const id of ids) {
      const { strongBeatChordTones, strongBeatMisses } = lint(TRACKS[id]);
      expect(strongBeatChordTones, `${id} misses ${strongBeatMisses.join(', ')}`).toBeGreaterThanOrEqual(STRONG_BEAT_CHORD_TONES);
    }
  });

  it("keeps each pitched channel inside its role's range", () => {
    for (const id of ids) expect(lint(TRACKS[id]).outOfRange, id).toEqual([]);
  });
});

describe('a looping track', () => {
  it('sounds through its last beat, so it rolls into bar 1 without a dead stop', () => {
    for (const id of loops) expect(lint(TRACKS[id]).soundsInLastBeat, id).toBe(true);
  });
});

describe('a jingle', () => {
  it('ends its lead on the tonic', () => {
    for (const id of jingles) expect(lint(TRACKS[id]).leadEndsOnTonic, id).toBe(true);
  });
});

describe('the lint', () => {
  const Am = { root: 'A2', triad: ['A3', 'C4', 'E4'] } as const;
  const E = { root: 'E2', triad: ['G#3', 'B3', 'E4'] } as const;
  const tune = (lead: string[], loop = true): Track => ({
    title: 'test',
    bpm: 120,
    stepsPerBeat: 2,
    beatsPerBar: 4,
    key: { tonic: 'A', mode: 'minor', borrowed: [E] },
    chords: [Am, E],
    loop,
    channels: [{ name: 'lead', voice: 'pulse25', gain: 1, bars: lead }],
  });

  it('flags a note from outside the key, and a borrowed note outside its chord', () => {
    expect(lint(tune(['A4 - C#5 - E5 - - -', 'G#4 - - - B4 - E5 -'])).outOfKey).toEqual(['lead bar 1 step 3: midi 73']);
    expect(lint(tune(['A4 - G#4 - E5 - - -', 'G#4 - - - B4 - E5 -'])).outOfKey).toEqual(['lead bar 1 step 3: midi 68']);
  });

  it("scores strong beats against the bar's chord", () => {
    expect(lint(tune(['A4 - - - D5 - - -', 'F5 - - - B4 - E5 -'])).strongBeatChordTones).toBe(0.5);
  });

  it('flags a note out of range, a loop that stops dead and a jingle that ends off the tonic', () => {
    expect(lint(tune(['A2 - - - E5 - - -', 'B4 - - - E5 - E5 -'])).outOfRange).toEqual(['lead bar 1 step 1: midi 45']);
    expect(lint(tune(['A4 - - - E5 - - -', 'B4 - - - E5 - . .'])).soundsInLastBeat).toBe(false);
    expect(lint(tune(['A4 - - - E5 - - -', 'B4 - - - E5 - . .'], false)).leadEndsOnTonic).toBe(false);
  });
});
