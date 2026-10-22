import { midiOf, parseBars, type NoteEvent } from './score';
import type { Chord, Mode, Track, Voice } from './tracks';

const SCALE: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const DRUMS: ReadonlySet<Voice> = new Set(['kick', 'snare', 'hat']);

// MIDI ranges per channel role: a bass small speakers still carry, and nothing shrill above G6.
export const RANGE: Readonly<Record<string, readonly [number, number]>> = {
  lead: [55, 91],
  counter: [52, 91],
  echo: [52, 91],
  stabs: [52, 91],
  arp: [52, 91],
  bass: [40, 64],
};

// The share of lead notes struck on beats 1 and 3 that must be tones of the bar's chord.
// Starlane Patrol scores 0.93, Crimson Verdict 0.78 and Crimson Verdict II 0.84, so 0.75 leaves room for a passing
// tone or a suspension a bar while catching a melody written against the wrong chords.
export const STRONG_BEAT_CHORD_TONES = 0.75;

export type Lint = {
  outOfKey: string[];
  strongBeatChordTones: number;
  strongBeatMisses: string[];
  outOfRange: string[];
  // A loop must still sound in its last beat, so it rolls into bar 1 instead of stopping dead.
  soundsInLastBeat: boolean;
  leadEndsOnTonic: boolean;
};

export function lint(t: Track): Lint {
  const spb = t.stepsPerBeat * t.beatsPerBar;
  const pitched = t.channels.filter((c) => !DRUMS.has(c.voice)).map((c) => ({ name: c.name, events: parseBars(c.bars, spb) }));
  const lead = pitched.find((c) => c.name === 'lead')?.events ?? [];
  const barOf = (e: NoteEvent) => Math.floor(e.step / spb);
  const where = (e: NoteEvent) => `bar ${barOf(e) + 1} step ${(e.step % spb) + 1}`;
  const chordOf = (e: NoteEvent) => t.chords[barOf(e)]!;
  const tonic = pc(midiOf(`${t.key.tonic}4`));
  const scale = new Set(SCALE[t.key.mode].map((i) => (tonic + i) % 12));
  const borrowedIn = (chord: Chord) => (t.key.borrowed.some((b) => sameChord(b, chord)) ? pcsOf(chord) : new Set<number>());

  const outOfKey = pitched.flatMap(({ name, events }) =>
    events.flatMap((e) => e.midis.filter((m) => !scale.has(pc(m)) && !borrowedIn(chordOf(e)).has(pc(m))).map((m) => `${name} ${where(e)}: midi ${m}`)),
  );
  const strong = new Set([0, (t.beatsPerBar / 2) * t.stepsPerBeat]);
  const onStrong = lead.filter((e) => strong.has(e.step % spb));
  const misses = onStrong.filter((e) => !e.midis.every((m) => pcsOf(chordOf(e)).has(pc(m))));
  const outOfRange = pitched.flatMap(({ name, events }) => {
    const range = RANGE[name];
    if (!range) return [`${name} has no range`];
    return events.flatMap((e) => e.midis.filter((m) => m < range[0] || m > range[1]).map((m) => `${name} ${where(e)}: midi ${m}`));
  });
  const lastBeat = t.chords.length * spb - t.stepsPerBeat;
  return {
    outOfKey,
    strongBeatChordTones: +(1 - misses.length / onStrong.length).toFixed(3),
    strongBeatMisses: misses.map(where),
    outOfRange,
    soundsInLastBeat: pitched.some(({ events }) => events.some((e) => e.step + e.steps > lastBeat)),
    leadEndsOnTonic: lead.at(-1)?.midis.some((m) => pc(m) === tonic) ?? false,
  };
}

function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function pcsOf(chord: Chord): Set<number> {
  return new Set([chord.root, ...chord.triad].map((n) => pc(midiOf(n))));
}

function sameChord(a: Chord, b: Chord): boolean {
  return [...pcsOf(a)].sort().join() === [...pcsOf(b)].sort().join();
}
