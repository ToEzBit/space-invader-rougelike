import { beat, octaveUp } from './score';

export type TrackId = 'normal' | 'boss1' | 'boss2';
export type Voice = 'pulse25' | 'pulse12' | 'triangle' | 'kick' | 'snare' | 'hat';
export type Channel = { name: string; voice: Voice; gain: number; bars: readonly string[] };
// Every channel of a track has the same number of bars; that count is the loop.
export type Track = { title: string; bpm: number; stepsPerBeat: number; beatsPerBar: number; channels: readonly Channel[] };

type Chord = { root: string; triad: readonly [string, string, string] };

const pump = (rhythm: string, chords: readonly Chord[]) => chords.map(({ root }) => beat(rhythm, { L: root, H: octaveUp(root) }));
const stab = (rhythm: string, chords: readonly Chord[]) => chords.map(({ triad }) => beat(rhythm, { x: triad.join('+') }));
const arp = (rhythm: string, chords: readonly Chord[]) =>
  chords.map(({ triad: [a, b, c] }) => beat(rhythm, { a, b, c, d: octaveUp(a) }));
// Drums repeat one bar and swap in a fill on every eighth bar.
const drums = (bars: number, bar: string, fill = bar) => Array.from({ length: bars }, (_, i) => ((i + 1) % 8 === 0 ? fill : bar));

const chord = (root: string, ...triad: [string, string, string]): Chord => ({ root, triad });

// Normal: A minor, a bright running lead over off-beat stabs.
const N = {
  Am: chord('A2', 'A3', 'C4', 'E4'),
  F: chord('F2', 'F3', 'A3', 'C4'),
  C: chord('C3', 'G3', 'C4', 'E4'),
  G: chord('G2', 'G3', 'B3', 'D4'),
  E: chord('E2', 'G#3', 'B3', 'E4'),
  Em: chord('E2', 'G3', 'B3', 'E4'),
  Dm: chord('D3', 'F3', 'A3', 'D4'),
};
const NORMAL_CHORDS = [N.Am, N.F, N.C, N.G, N.Am, N.F, N.G, N.E, N.F, N.G, N.Em, N.Am, N.Dm, N.G, N.C, N.E];

const NORMAL: Track = {
  title: 'Starlane Patrol',
  bpm: 138,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  channels: [
    {
      name: 'lead',
      voice: 'pulse25',
      gain: 0.32,
      bars: [
        'A4 - C5 - E5 - - D5 C5 - B4 - A4 - E4 -',
        'F4 - A4 - C5 - - A4 F5 - - E5 D5 - C5 -',
        'E5 - - - G5 - E5 - C5 - D5 - E5 - G4 -',
        'D5 - - - B4 - G4 - D5 - E5 - D5 - B4 -',
        'A4 - C5 - E5 - - D5 C5 - B4 - A4 - C5 -',
        'F5 - - - E5 - D5 - C5 - - A4 C5 - D5 -',
        'B4 - - - D5 - G5 - F5 - E5 - D5 - B4 -',
        'G#4 - - - B4 - E5 - - - . . E4 . G#4 .',
        'C5 - A4 - C5 - F5 - - - E5 - F5 - A5 -',
        'G5 - - - F5 - E5 - D5 - - - B4 - D5 -',
        'E5 - - - G5 - - B5 - - G5 - E5 - B4 -',
        'C5 - - - - - B4 - A4 - - - E4 - A4 -',
        'D5 - F5 - A5 - - G5 F5 - E5 - D5 - A4 -',
        'B4 - D5 - G5 - - F5 E5 - D5 - B4 - G4 -',
        'C5 - E5 - G5 - C6 - - - B5 - G5 - E5 -',
        'E5 - - - D5 - B4 - G#4 - - - B4 . E5 .',
      ],
    },
    { name: 'stabs', voice: 'pulse12', gain: 0.07, bars: stab('. . x . . . x . . . x . . . x .', NORMAL_CHORDS) },
    { name: 'bass', voice: 'triangle', gain: 0.36, bars: pump('L . H . L L H . L . H . L L H .', NORMAL_CHORDS) },
    { name: 'kick', voice: 'kick', gain: 0.45, bars: drums(16, 'x . . . . . . . x . x . . . . .') },
    { name: 'snare', voice: 'snare', gain: 0.4, bars: drums(16, '. . . . x . . . . . . . x . . .', '. . . . x . . . x . x . x x x x') },
    { name: 'hat', voice: 'hat', gain: 0.16, bars: drums(16, 'x . x . x . x . x . x . x . X .') },
  ],
};

// Boss, first form: E minor. The hook falls G-F#-E on a 3+3+2 syncopation, then climbs back up.
const B = {
  Em: chord('E2', 'G3', 'B3', 'E4'),
  C: chord('C3', 'G3', 'C4', 'E4'),
  D: chord('D3', 'F#3', 'A3', 'D4'),
  B: chord('B2', 'F#3', 'B3', 'D#4'),
  Am: chord('A2', 'A3', 'C4', 'E4'),
};
const BOSS1_CHORDS = [B.Em, B.Em, B.C, B.D, B.Em, B.Em, B.C, B.B, B.Am, B.B, B.Em, B.C, B.Am, B.D, B.B, B.B];
const BOSS1_HOOK = 'G5 - . F#5 - . E5 - B4 - E5 F#5 G5 - A5 B5';

const BOSS1: Track = {
  title: 'Crimson Verdict',
  bpm: 150,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  channels: [
    {
      name: 'lead',
      voice: 'pulse25',
      gain: 0.32,
      bars: [
        BOSS1_HOOK,
        'C6 - . B5 - . G5 - E5 - - . D5 E5 F#5 D5',
        'G5 - . F#5 - . E5 - C5 - E5 G5 C6 - B5 G5',
        'A5 - . F#5 - . D5 - A4 - D5 E5 F#5 - A5 F#5',
        BOSS1_HOOK,
        'C6 - . B5 - . G5 - B5 - D6 - B5 . G5 A5',
        'G5 - E5 - C5 - E5 - G5 - C6 - B5 - A5 -',
        'B5 - - - - - A5 - G5 - F#5 - D#5 - - -',
        'C6 - . B5 - . A5 - E5 - A5 B5 C6 - D6 E6',
        'D#6 - . C6 - . B5 - F#5 - - . A5 G5 F#5 D#5',
        'E5 - - - B5 - - - G5 - - E5 F#5 - G5 -',
        'A5 - - G5 . E5 . G5 A5 - B5 - C6 - - -',
        'C6 - B5 - A5 - E5 - C5 - E5 - A5 - B5 -',
        'C6 - - B5 . A5 . F#5 D5 - F#5 - A5 - C6 -',
        'B5 - - - - - - - D#6 - - - C6 - B5 -',
        'A5 - - - F#5 - - - D#5 - - - B4 . B4 .',
      ],
    },
    { name: 'stabs', voice: 'pulse12', gain: 0.07, bars: stab('. . x - . . x - . . x . x - . .', BOSS1_CHORDS) },
    { name: 'bass', voice: 'triangle', gain: 0.36, bars: pump('L . H L . L H . L . H L . L H L', BOSS1_CHORDS) },
    { name: 'kick', voice: 'kick', gain: 0.45, bars: drums(16, 'x . . . x . . x . . x . x . . .') },
    { name: 'snare', voice: 'snare', gain: 0.4, bars: drums(16, '. . . . x . . . . . . . x . . .', '. . . . x . . . x . x x X x X X') },
    { name: 'hat', voice: 'hat', gain: 0.16, bars: drums(16, 'x . x x x . x . x . x x x . x .') },
  ],
};

// Boss, second form: the first form's harmony a semitone up in F minor, faster, with a 16th-note lead,
// a rolling arpeggio in place of the stabs, nonstop octave bass and doubled drums.
const F = {
  Fm: chord('F2', 'F4', 'Ab4', 'C5'),
  Db: chord('Db3', 'F4', 'Ab4', 'Db5'),
  Eb: chord('Eb3', 'G4', 'Bb4', 'Eb5'),
  C: chord('C3', 'G4', 'C5', 'E5'),
  Bbm: chord('Bb2', 'F4', 'Bb4', 'Db5'),
};
const BOSS2_CHORDS = [F.Fm, F.Fm, F.Db, F.Eb, F.Fm, F.Fm, F.Db, F.C, F.Bbm, F.C, F.Fm, F.Db, F.Bbm, F.Eb, F.C, F.C];
const BOSS2_HOOK = 'Ab5 - C6 G5 - C6 F5 - C5 - F5 G5 Ab5 - Bb5 C6';

const BOSS2: Track = {
  title: 'Crimson Verdict II',
  bpm: 172,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  channels: [
    {
      name: 'lead',
      voice: 'pulse25',
      gain: 0.32,
      bars: [
        BOSS2_HOOK,
        'Db6 - F6 C6 - F6 Ab5 - F5 - Eb5 F5 G5 Ab5 G5 Eb5',
        'Ab5 - Db6 G5 - Db6 F5 - Db5 - F5 Ab5 Db6 - C6 Ab5',
        'Bb5 - Eb6 G5 - Eb6 Eb5 - Bb4 - Eb5 F5 G5 - Bb5 G5',
        BOSS2_HOOK,
        'Db6 - F6 C6 - F6 Ab5 - C6 - Eb6 - C6 Ab5 F5 G5',
        'Ab5 F5 Db5 F5 Ab5 Db6 Ab5 Db6 F6 - Db6 - C6 - Bb5 -',
        'C6 - - - - - Bb5 - Ab5 - G5 - E5 - - -',
        'Db6 - F6 C6 - F6 Bb5 - F5 - Bb5 C6 Db6 - Eb6 F6',
        'E6 - G6 Db6 - G6 C6 - G5 - - - Bb5 Ab5 G5 E5',
        'F5 - C6 - Ab5 - F5 - C6 - Eb6 - Db6 C6 Bb5 Ab5',
        'Bb5 - Ab5 - F5 - Db5 - F5 Ab5 Db6 F6 - Eb6 Db6 C6',
        'Db6 - - C6 Bb5 - F5 - Db5 F5 Bb5 Db6 F6 - Eb6 Db6',
        'Eb6 - - Db6 C6 - Bb5 - G5 Bb5 Eb6 G6 - F6 Eb6 Db6',
        'C6 - - - - - E6 - G6 - - - E6 - C6 -',
        'Bb5 - G5 - E5 - C5 - G5 E5 C5 G4 . C5 . C5',
      ],
    },
    { name: 'arp', voice: 'pulse12', gain: 0.08, bars: arp('a c d c b c d c a c d c b c d c', BOSS2_CHORDS) },
    { name: 'bass', voice: 'triangle', gain: 0.36, bars: pump('L L H L L H L L H L L H L H L H', BOSS2_CHORDS) },
    { name: 'kick', voice: 'kick', gain: 0.45, bars: drums(16, 'x . x . x . x . x . x . x . x x') },
    { name: 'snare', voice: 'snare', gain: 0.4, bars: drums(16, '. . . . x . . x . . . . x . x .', 'x . x . x . x x x x x x X X X X') },
    { name: 'hat', voice: 'hat', gain: 0.16, bars: drums(16, 'x x X x x x X x x x X x x x X x') },
  ],
};

export const TRACKS: Record<TrackId, Track> = { normal: NORMAL, boss1: BOSS1, boss2: BOSS2 };
