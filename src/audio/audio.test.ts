import { describe, expect, it } from 'vitest';
import { STAGES } from '../core/stages';
import { cueFor, sourceFor, WAVE_MUSIC, type BossView, type FileLoad, type StageMoment } from './director';
import { BOSS1_PRE_BUS_LOUD95, gainToMatch } from './loudness';
import { fillRhythm, freqOf, midiOf, octaveUp, parseBars } from './score';
import { TRACKS, type ScoreId, type Track } from './tracks';

const barsOf = (t: Track) => t.channels[0]!.bars.length;
const stepsPerBar = (t: Track) => t.stepsPerBeat * t.beatsPerBar;
const events = (t: Track, name: string) => parseBars(t.channels.find((c) => c.name === name)!.bars, stepsPerBar(t));
const DRUMS = new Set(['kick', 'snare', 'hat']);
const ACTS = ['act1', 'act2', 'act3', 'act4'] as const;
const JINGLES: readonly ScoreId[] = ['clear', 'victory', 'defeat'];
const loopSec = (t: Track) => (barsOf(t) * stepsPerBar(t) * 60) / t.bpm / t.stepsPerBeat;
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
    expect(fillRhythm('L . H x', { L: 'E2', H: 'E3' })).toBe('E2 . E3 x');
  });
});

describe('tracks', () => {
  const ids = Object.keys(TRACKS) as ScoreId[];

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
    for (const id of ACTS) expect(barsOf(TRACKS[id]), id).toBeGreaterThanOrEqual(32);
    expect(barsOf(TRACKS.shop)).toBeGreaterThanOrEqual(24);
  });

  it('loop everywhere but the jingles, which each fit before the next scene takes over', () => {
    for (const id of ids) expect(TRACKS[id].loop, id).toBe(!JINGLES.includes(id));
    for (const id of ['clear', 'defeat'] as const) expect(loopSec(TRACKS[id]), id).toBeLessThanOrEqual(2);
    expect(loopSec(TRACKS.clear)).toBeGreaterThanOrEqual(1.2);
    expect(loopSec(TRACKS.defeat)).toBeGreaterThanOrEqual(1.5);
    expect(loopSec(TRACKS.victory)).toBeGreaterThan(loopSec(TRACKS.clear));
  });

  it('give each act its own tempo and key, apart from each other and from Starlane Patrol', () => {
    const feel = (id: ScoreId) => `${TRACKS[id].bpm} ${TRACKS[id].key.tonic} ${TRACKS[id].key.mode}`;
    const acts = ['normal', ...ACTS] as const;
    expect(new Set(acts.map((id) => TRACKS[id].bpm)).size).toBe(acts.length);
    expect(new Set(acts.map((id) => `${TRACKS[id].key.tonic} ${TRACKS[id].key.mode}`)).size, acts.map(feel).join(', ')).toBe(acts.length);
    expect(new Set(acts.map((id) => TRACKS[id].channels.find((c) => c.name === 'lead')!.voice)).size).toBeGreaterThanOrEqual(4);
  });

  it('slow the shop down below every stage track', () => {
    for (const id of ['normal', ...ACTS] as const) expect(TRACKS.shop.bpm, id).toBeLessThan(TRACKS[id].bpm);
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

  it('push the boss music harder: the boss outpaces every stage, and the second form outpaces the first', () => {
    for (const id of ['normal', ...ACTS] as const) expect(TRACKS.boss1.bpm, id).toBeGreaterThan(TRACKS[id].bpm);
    expect(TRACKS.boss2.bpm).toBeGreaterThan(TRACKS.boss1.bpm);
    expect(events(TRACKS.boss2, 'lead').length).toBeGreaterThan(events(TRACKS.boss1, 'lead').length);
    expect(drumHitsPerBar(TRACKS.boss2)).toBeGreaterThanOrEqual(1.5 * drumHitsPerBar(TRACKS.boss1));
  });
});

describe('the track for the moment', () => {
  const FIRST_FORM = ['entering', 'fighting', 'casting'] as const;
  const SECOND_FORM: Pick<BossView, 'form' | 'stanceKind'>[] = [
    { form: 0, stanceKind: 'transforming' },
    { form: 1, stanceKind: 'transforming' },
    { form: 1, stanceKind: 'fighting' },
    { form: 1, stanceKind: 'casting' },
  ];
  const LOADS: Record<FileLoad['status'], FileLoad> = {
    idle: { status: 'idle' },
    loading: { status: 'loading' },
    ready: { status: 'ready', url: '/music/void-empress.ogg', buffer: {} as AudioBuffer, gain: 0.5 },
    failed: { status: 'failed', tried: [] },
  };
  const at = (boss: BossView | null, empress: FileLoad['status'] = 'ready', moment: Partial<StageMoment> = {}) => {
    const source = sourceFor(cueFor({ stage: boss?.id === 'voidEmpress' ? 10 : boss ? 5 : 1, boss, phase: 'playing', ...moment }), () => LOADS[empress]);
    return source.kind === 'score' || source.kind === 'file' ? source.id : source.kind;
  };
  const playing = (boss: BossView | null, empress: FileLoad['status'] = 'ready') => at(boss, empress);
  const DEAD = [
    { id: 'crimsonSeraph', form: 1, stanceKind: 'dead' },
    { id: 'voidEmpress', form: 1, stanceKind: 'dead' },
  ] as const;

  it('gives every wave stage a track and leaves every boss stage to its boss', () => {
    STAGES.forEach((def, i) => expect(WAVE_MUSIC[i + 1] !== undefined, `stage ${i + 1}`).toBe(def.kind === 'wave'));
  });

  it('plays one track per act: stages 1-2, 3-4, 6-7 and 8-9', () => {
    const byStage = [1, 2, 3, 4, 6, 7, 8, 9].map((stage) => at(null, 'ready', { stage }));
    expect(byStage).toEqual(['act1', 'act1', 'act2', 'act2', 'act3', 'act3', 'act4', 'act4']);
  });

  it('ends a stage on the clear jingle into the shop, the fanfare into victory and the lament into defeat', () => {
    for (const stage of [1, 4, 9]) {
      expect(at(null, 'ready', { stage, phase: 'shop' })).toBe('clear');
      expect(at(null, 'ready', { stage, phase: 'defeat' })).toBe('defeat');
    }
    expect(at({ id: 'crimsonSeraph', form: 1, stanceKind: 'fighting' }, 'ready', { phase: 'defeat' })).toBe('defeat');
    expect(at(DEAD[1], 'ready', { phase: 'defeat' })).toBe('defeat');
  });

  it("plays the boss's ending jingle in place of the silence her death asks for", () => {
    expect(at(DEAD[0], 'ready', { phase: 'shop' })).toBe('clear');
    expect(at(DEAD[1], 'failed', { phase: 'victory' })).toBe('victory');
  });

  it("plays Crimson Verdict from the Seraph's entrance until she starts to transform", () => {
    for (const stanceKind of FIRST_FORM) expect(playing({ id: 'crimsonSeraph', form: 0, stanceKind })).toBe('boss1');
  });

  it('switches the Seraph to Crimson Verdict II as the transformation starts, before the form flips', () => {
    for (const view of SECOND_FORM) expect(playing({ id: 'crimsonSeraph', ...view }), JSON.stringify(view)).toBe('boss2');
  });

  it("plays the Empress's recording through both forms, transformation included", () => {
    for (const stanceKind of FIRST_FORM) expect(playing({ id: 'voidEmpress', form: 0, stanceKind })).toBe('empress');
    for (const view of SECOND_FORM) expect(playing({ id: 'voidEmpress', ...view }), JSON.stringify(view)).toBe('empress');
  });

  it('gives the Empress the Seraph tracks, form by form, when her recording cannot load', () => {
    for (const stanceKind of FIRST_FORM) expect(playing({ id: 'voidEmpress', form: 0, stanceKind }, 'failed')).toBe('boss1');
    for (const view of SECOND_FORM) expect(playing({ id: 'voidEmpress', ...view }, 'failed'), JSON.stringify(view)).toBe('boss2');
  });

  it('keeps whatever is playing while her recording is still loading', () => {
    for (const status of ['idle', 'loading'] as const) expect(playing({ id: 'voidEmpress', form: 0, stanceKind: 'entering' }, status)).toBe('holdWhileLoading');
  });

  it('never waits on a recording for the Seraph or between fights', () => {
    expect(playing({ id: 'crimsonSeraph', form: 0, stanceKind: 'entering' }, 'loading')).toBe('boss1');
    expect(playing(null, 'loading')).toBe('act1');
  });

  it('falls silent once either boss is dead, until the stage ends', () => {
    expect(playing(DEAD[0])).toBe('silence');
    expect(playing(DEAD[1], 'failed')).toBe('silence');
  });
});

describe('the gain that matches a recording to the boss track', () => {
  const sine = (amp: number, sec: number, rate: number, hz = 220) => Float32Array.from({ length: Math.round(sec * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

  it("scales a steady tone's RMS to Crimson Verdict's loudness", () => {
    expect(gainToMatch([sine(0.9, 2, 48000)], 48000)).toBeCloseTo(BOSS1_PRE_BUS_LOUD95 / (0.9 / Math.SQRT2), 3);
    expect(gainToMatch([sine(0.1, 2, 48000)], 48000, 0.2)).toBeCloseTo(0.2 / (0.1 / Math.SQRT2), 3);
  });

  it('reads the same loudness at any sample rate', () => {
    expect(gainToMatch([sine(0.5, 2, 44100)], 44100)).toBeCloseTo(gainToMatch([sine(0.5, 2, 48000)], 48000)!, 3);
  });

  it('hears identical stereo channels as the mono signal, and a silent side as half the power', () => {
    const tone = sine(0.6, 2, 44100);
    expect(gainToMatch([tone, tone], 44100)).toBeCloseTo(gainToMatch([tone], 44100)!, 6);
    expect(gainToMatch([tone, new Float32Array(tone.length)], 44100)).toBeCloseTo(gainToMatch([tone], 44100)! * Math.SQRT2, 3);
  });

  it('follows the body of the song, not a brief peak', () => {
    const rate = 44100;
    const song = sine(0.2, 10, rate);
    song.set(sine(1, 0.2, rate), rate);
    expect(gainToMatch([song], rate)).toBeCloseTo(BOSS1_PRE_BUS_LOUD95 / (0.2 / Math.SQRT2), 3);
  });

  it('gives no gain for a silent recording', () => {
    expect(gainToMatch([new Float32Array(44100)], 44100)).toBeNull();
  });
});
