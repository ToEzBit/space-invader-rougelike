import { fillRhythm, octaveDown, octaveUp, TOKEN } from './score';

export type ScoreId = 'normal' | 'act1' | 'act2' | 'act3' | 'act4' | 'shop' | 'boss1' | 'boss2';
export type FileId = 'empress';
export type TrackId = ScoreId | FileId;
export type Voice = 'pulse50' | 'vibrato' | 'pulse25' | 'pulse12' | 'triangle' | 'kick' | 'snare' | 'hat';
export type Channel = { name: string; voice: Voice; gain: number; bars: readonly string[] };
export type FileTrack = { title: string; urls: readonly string[] };
export type Chord = { root: string; triad: readonly [string, string, string] };
export type Mode = 'major' | 'minor' | 'dorian' | 'phrygian' | 'mixolydian';
// Borrowed chords may bring notes from outside the mode, but only in the bars they harmonize.
export type Key = { tonic: string; mode: Mode; borrowed: readonly Chord[] };
// chords holds the harmony one chord per bar. A track that does not loop is a jingle: it plays once and ends.
export type Track = {
  title: string;
  bpm: number;
  stepsPerBeat: number;
  beatsPerBar: number;
  key: Key;
  chords: readonly Chord[];
  loop: boolean;
  channels: readonly Channel[];
};

const pump = (rhythm: string, chords: readonly Chord[]) => chords.map(({ root }) => fillRhythm(rhythm, { L: root, H: octaveUp(root) }));
const stab = (rhythm: string, chords: readonly Chord[]) => chords.map(({ triad }) => fillRhythm(rhythm, { x: triad.join('+') }));
const arp = (rhythm: string, chords: readonly Chord[]) =>
  chords.map(({ triad: [a, b, c] }) => fillRhythm(rhythm, { a, b, c, d: octaveUp(a) }));
const FILL_EVERY_BARS = 8;
const drums = (bars: number, bar: string, fill = bar) => Array.from({ length: bars }, (_, i) => ((i + 1) % FILL_EVERY_BARS === 0 ? fill : bar));
const times = (bars: number, bar: string) => Array.from({ length: bars }, () => bar);
const silence = (bars: number) => times(bars, Array(16).fill(TOKEN.rest).join(' '));
const lower = (bars: readonly string[]) => bars.map((bar) => bar.trim().split(/\s+/).map((t) => (t === TOKEN.rest || t === TOKEN.hold ? t : octaveDown(t))).join(' '));
// The same line a few steps later, wrapping round the loop, as a quieter channel it reads as an echo.
const echo = (bars: readonly string[], steps: number) => {
  const tokens = bars.flatMap((bar) => bar.trim().split(/\s+/));
  const shifted = [...tokens.slice(-steps), ...tokens.slice(0, -steps)];
  for (let i = 0; shifted[i] === TOKEN.hold; i++) shifted[i] = TOKEN.rest;
  const perBar = tokens.length / bars.length;
  return bars.map((_, b) => shifted.slice(b * perBar, (b + 1) * perBar).join(' '));
};

const chord = (root: string, ...triad: [string, string, string]): Chord => ({ root, triad });

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
  key: { tonic: 'A', mode: 'minor', borrowed: [N.E] },
  chords: NORMAL_CHORDS,
  loop: true,
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
  key: { tonic: 'E', mode: 'minor', borrowed: [B.B] },
  chords: BOSS1_CHORDS,
  loop: true,
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
  key: { tonic: 'F', mode: 'minor', borrowed: [F.C] },
  chords: BOSS2_CHORDS,
  loop: true,
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

const D = {
  D: chord('D3', 'F#4', 'A4', 'D5'),
  A: chord('A2', 'E4', 'A4', 'C#5'),
  Bm: chord('B2', 'F#4', 'B4', 'D5'),
  G: chord('G2', 'G4', 'B4', 'D5'),
  Em: chord('E2', 'E4', 'G4', 'B4'),
  Fsm: chord('F#2', 'F#4', 'A4', 'C#5'),
};
// A, A', B, a breakdown, then a turnaround that climbs back to the top.
const ACT1_CHORDS = [
  ...[D.D, D.A, D.Bm, D.G, D.D, D.A, D.G, D.A],
  ...[D.D, D.A, D.Bm, D.G, D.Em, D.Fsm, D.G, D.A],
  ...[D.Bm, D.G, D.D, D.A, D.Bm, D.G, D.Em, D.A],
  ...[D.G, D.A, D.Fsm, D.Bm],
  ...[D.Em, D.Fsm, D.G, D.A],
];
const ACT1_HOOK = ['A4 - D5 - F#5 - A5 - - - F#5 - A5 - D6 -', 'C#6 - - - B5 - A5 - E5 - - - A5 B5 C#6 -', 'D6 - - - C#6 - B5 - F#5 - - - B5 - D6 -'];

const ACT1: Track = {
  title: 'Azure Horizon',
  bpm: 128,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  key: { tonic: 'D', mode: 'major', borrowed: [] },
  chords: ACT1_CHORDS,
  loop: true,
  channels: [
    {
      name: 'lead',
      voice: 'pulse12',
      gain: 0.4,
      bars: [
        ...ACT1_HOOK,
        'B5 - - - A5 - G5 - D5 - - - E5 F#5 G5 A5',
        'A5 - - - F#5 - D5 - A5 - - - D6 - - -',
        'C#6 - - - E6 - C#6 - A5 - - - E5 - - -',
        'D6 - - - B5 - G5 - B5 - - - D6 - C#6 -',
        'C#6 - - - - - - - E5 - F#5 - G5 - A5 -',
        ...ACT1_HOOK,
        'B5 - - - D6 - G5 - B5 - A5 - G5 - F#5 -',
        'E5 - G5 - B5 - - - G5 - - - E5 - G5 -',
        'F#5 - A5 - C#6 - - - A5 - - - F#5 - A5 -',
        'G5 - B5 - D6 - - - B5 - G5 - B5 - D6 -',
        'E6 - - - C#6 - - - A5 - - - E5 - - -',
        'F#5 - - - - - D5 - B4 - - - D5 - F#5 -',
        'G5 - - - - - D5 - B4 - - - D5 - G5 -',
        'A5 - - - - - F#5 - D5 - - - F#5 - A5 -',
        'E5 - - - - - - - C#5 - D5 - E5 - - -',
        'B5 - - - A5 - F#5 - D5 - - - F#5 - B5 -',
        'D6 - - - B5 - G5 - D5 - - - G5 - B5 -',
        'E6 - - - D6 - B5 - G5 - - - B5 - E6 -',
        'C#6 - - - - - - - A5 - - - E5 - - -',
        'D5 - - - . . . . . . . . G5 - - -',
        'E5 - - - . . . . . . . . A5 - - -',
        'F#5 - - - . . . . . . . . C#6 - - -',
        'B5 - - - . . . . D6 - - - - - - -',
        'E5 F#5 G5 - B5 - G5 - E5 F#5 G5 - B5 - E6 -',
        'F#5 G5 A5 - C#6 - A5 - F#5 G5 A5 - C#6 - F#6 -',
        'G5 A5 B5 - D6 - B5 - G5 A5 B5 - D6 - G6 -',
        'E6 - - - C#6 - A5 - E5 - - - C#5 - E5 -',
      ],
    },
    {
      name: 'arp',
      voice: 'pulse50',
      gain: 0.07,
      bars: [
        ...arp('a . b . c . b . a . b . c . d .', ACT1_CHORDS.slice(0, 24)),
        ...arp('a b c d c b a b c d c b a b c d', ACT1_CHORDS.slice(24, 28)),
        ...arp('a . b . c . b . a . b . c . d .', ACT1_CHORDS.slice(28)),
      ],
    },
    {
      name: 'bass',
      voice: 'triangle',
      gain: 0.36,
      bars: [
        ...pump('L . H . L . H . L . H . L . H .', ACT1_CHORDS.slice(0, 24)),
        ...pump('L - - - - - - - L - - - H - - -', ACT1_CHORDS.slice(24, 28)),
        ...pump('L . H . L . H . L . H . L H L H', ACT1_CHORDS.slice(28)),
      ],
    },
    {
      name: 'kick',
      voice: 'kick',
      gain: 0.45,
      bars: [...times(24, 'x . . . x . . . x . . . x . . .'), ...times(4, 'x . . . . . . . . . . . . . . .'), ...times(4, 'x . . . x . . . x . . . x . . .')],
    },
    {
      name: 'snare',
      voice: 'snare',
      gain: 0.4,
      bars: [
        ...drums(24, '. . . . x . . . . . . . x . . .', '. . . . x . . . x . x x x x x x'),
        ...silence(4),
        '. . . . x . . . . . . . x . . .',
        '. . . . x . . . x . . . x . x .',
        'x . x . x . x . x . x . x . x .',
        'x x x x x x x x X x X x X X X X',
      ],
    },
    {
      name: 'hat',
      voice: 'hat',
      gain: 0.14,
      bars: [...times(24, '. . X . . . X . . . X . . . X .'), ...times(4, 'x . x . x . x . x . x . x . x .'), ...times(4, '. . X . . . X . . . X . . . X .')],
    },
  ],
};

const G = {
  Gm: chord('G2', 'D4', 'G4', 'Bb4'),
  C: chord('C3', 'E4', 'G4', 'C5'),
  F: chord('F2', 'F4', 'A4', 'C5'),
  Bb: chord('Bb2', 'D4', 'F4', 'Bb4'),
  Eb: chord('Eb3', 'Eb4', 'G4', 'Bb4'),
  Dm: chord('D3', 'D4', 'F4', 'A4'),
};
// A shuffle: three steps a beat, so a swung eighth is the first and third step of each.
const ACT2_CHORDS = [
  ...[G.Gm, G.C, G.Gm, G.C, G.Bb, G.F, G.C, G.C],
  ...[G.Gm, G.C, G.Gm, G.C, G.Bb, G.F, G.Gm, G.Gm],
  ...[G.Eb, G.F, G.Dm, G.Gm, G.Eb, G.F, G.C, G.C],
  ...[G.Gm, G.Gm, G.C, G.C],
  ...[G.Bb, G.C, G.Eb, G.F],
];
const ACT2_BASS = new Map([
  [G.Gm, 'G2 - . . . G2 Bb2 . C3 D3 . F3'],
  [G.C, 'C3 - . . . C3 E3 . F3 G3 . E3'],
  [G.F, 'F2 - . . . F2 A2 . Bb2 C3 . A2'],
  [G.Bb, 'Bb2 - . . . Bb2 D3 . F3 G3 . F3'],
  [G.Eb, 'Eb3 - . . . Eb3 G3 . Bb3 G3 . Eb3'],
  [G.Dm, 'D3 - . . . D3 F3 . A3 C4 . A3'],
]);
const ACT2_HOOK = ['D5 - - . . Bb4 D5 - . F5 - D5', 'E5 - - . . C5 G5 - - E5 - C5', 'D5 - - . . Bb4 D5 - . G5 - F5'];

const ACT2: Track = {
  title: 'Amber Shuffle',
  bpm: 108,
  stepsPerBeat: 3,
  beatsPerBar: 4,
  key: { tonic: 'G', mode: 'dorian', borrowed: [G.Eb] },
  chords: ACT2_CHORDS,
  loop: true,
  channels: [
    {
      name: 'lead',
      voice: 'pulse50',
      gain: 0.26,
      bars: [
        ...ACT2_HOOK,
        'E5 - - - - . . . C5 D5 . E5',
        'F5 - - . . D5 Bb4 - . D5 - F5',
        'A5 - - . . F5 C5 - . A4 - C5',
        'G5 - - . . E5 C5 - - . . .',
        'E5 - - . G5 - E5 - . D5 . C5',
        ...ACT2_HOOK,
        'G5 - - . . E5 C5 - . A4 . C5',
        'D5 - - . . F5 Bb5 - - A5 . F5',
        'C6 - - . . A5 F5 - - E5 . C5',
        'D5 - - - - . . . . . . .',
        'G4 - Bb4 . D5 . G5 - . . . .',
        'G5 - - - - - Bb5 - - G5 - -',
        'A5 - - - - - C6 - - A5 - -',
        'F5 - - - - - A5 - - F5 - D5',
        'D5 - - - - - - - . . . .',
        'Bb5 - - . . G5 Eb5 - . G5 . Bb5',
        'C6 - - . . A5 F5 - . A5 . C6',
        'G5 - - . . E5 C6 - - G5 . E5',
        'C5 - - - - - - - . . . .',
        '. . . . . . . . . D5 . F5',
        'G5 - - . . . . . . D5 . F5',
        'G5 - - . . . . . . E5 . G5',
        'C6 - - - - - . . . . . .',
        'D5 F5 Bb5 - . . D5 F5 Bb5 - . .',
        'E5 G5 C6 - . . E5 G5 C6 - . .',
        'Eb5 G5 Bb5 - . . Eb5 G5 Bb5 - . .',
        'F5 A5 C6 - - - A5 - F5 C5 - -',
      ],
    },
    { name: 'stabs', voice: 'pulse12', gain: 0.08, bars: stab('. . x . . x . . . . . x', ACT2_CHORDS) },
    { name: 'bass', voice: 'triangle', gain: 0.4, bars: ACT2_CHORDS.map((c) => ACT2_BASS.get(c)!) },
    {
      name: 'kick',
      voice: 'kick',
      gain: 0.45,
      bars: [...times(24, 'x . . . . x x . . . . .'), ...times(4, 'x . . . . . x . . . . .'), ...times(4, 'x . . . . x x . . . . .')],
    },
    {
      name: 'snare',
      voice: 'snare',
      gain: 0.36,
      bars: [...drums(24, '. . . x . . . . . x . .', 'x . x x . x x x x X X X'), ...times(4, '. . . x . . . . . x . .'), ...drums(4, '. . . x . . . . . x . .', 'x . x x . x x x x X X X')],
    },
    {
      name: 'hat',
      voice: 'hat',
      gain: 0.14,
      bars: [...times(24, 'x . x x . x x . x x . x'), ...times(4, 'x . . x . . x . . x . .'), ...times(4, 'x . x x . x x . x x . x')],
    },
  ],
};

const H = {
  Fsm: chord('F#2', 'F#4', 'A4', 'C#5'),
  G: chord('G2', 'G4', 'B4', 'D5'),
  D: chord('D3', 'F#4', 'A4', 'D5'),
  Bm: chord('B2', 'F#4', 'B4', 'D5'),
  Cs: chord('C#3', 'E#4', 'G#4', 'C#5'),
  E: chord('E2', 'E4', 'G#4', 'B4'),
};
// Two bars a chord, leaning on the half step between F# minor and the G major a semitone above it.
const ACT3_CHORDS = [
  ...[H.Fsm, H.Fsm, H.G, H.G, H.Fsm, H.Fsm, H.Cs, H.Cs],
  ...[H.Fsm, H.Fsm, H.D, H.D, H.Bm, H.Bm, H.Cs, H.Cs],
  ...[H.D, H.D, H.E, H.E, H.Bm, H.Bm, H.Cs, H.Cs],
  ...[H.Fsm, H.G, H.Fsm, H.G],
  ...[H.D, H.G, H.Cs, H.Cs],
];
const ACT3_LEAD = [
  'C#5 - - - - - - - A4 - - - - - B4 -',
  'C#5 - - - - - - - - - - - . . . .',
  'D5 - - - - - - - B4 - - - - - - -',
  'G4 - - - - - - - . . . . A4 - B4 -',
  'C#5 - - - - - - - F#5 - - - E5 - C#5 -',
  'A4 - - - - - - - - - - - . . . .',
  'G#4 - - - - - - - E#5 - - - - - - -',
  'C#5 - - - - - - - . . . . . . . .',
  'F#5 - - - - - - - C#5 - - - E5 - - -',
  'A4 - - - - - - - . . . . . . . .',
  'F#5 - - - - - - - D5 - - - E5 - F#5 -',
  'A5 - - - - - - - . . . . . . . .',
  'F#5 - - - - - - - D5 - - - C#5 - B4 -',
  'D5 - - - - - - - . . . . . . . .',
  'E#5 - - - - - - - G#5 - - - - - - -',
  'C#5 - - - - - - - . . . . . . . .',
  'A4 - B4 - C#5 - D5 - F#5 - - - - - - -',
  'A5 - - - - - - - F#5 - - - D5 - - -',
  'G#4 - A4 - B4 - C#5 - E5 - - - - - - -',
  'B5 - - - - - - - G#5 - - - E5 - - -',
  'D5 - C#5 - B4 - - - F#5 - - - - - - -',
  'B5 - - - A5 - - - F#5 - - - D5 - - -',
  'C#6 - - - - - - - G#5 - - - - - - -',
  'E#5 - - - - - - - - - - - . . . .',
  '. . . . . . . . C#6 - - - - - - -',
  '. . . . . . . . D6 - - - - - - -',
  '. . . . . . . . C#6 - - - - - - -',
  '. . . . . . . . B5 - - - - - - -',
  'F#5 - - - A5 - - - D6 - - - A5 - - -',
  'G5 - - - B5 - - - D6 - - - B5 - - -',
  'G#5 - - - E#5 - - - C#5 - - - E#5 - - -',
  'G#5 - - - - - - - G#4 - - - - - - -',
];

const ACT3: Track = {
  title: 'Hollow Signal',
  bpm: 120,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  key: { tonic: 'F#', mode: 'minor', borrowed: [H.G, H.Cs] },
  chords: ACT3_CHORDS,
  loop: true,
  channels: [
    { name: 'lead', voice: 'vibrato', gain: 0.24, bars: ACT3_LEAD },
    { name: 'echo', voice: 'pulse12', gain: 0.16, bars: echo(ACT3_LEAD, 3) },
    { name: 'stabs', voice: 'pulse25', gain: 0.05, bars: stab('x - - - - - - - . . . . . . . .', ACT3_CHORDS) },
    {
      name: 'bass',
      voice: 'triangle',
      gain: 0.4,
      bars: [
        ...pump('L - - - - - . L L - - - - - . .', ACT3_CHORDS.slice(0, 24)),
        ...pump('L - - - - - - - - - - - - - - -', ACT3_CHORDS.slice(24, 28)),
        ...pump('L - - - - - . L L - - - H - . .', ACT3_CHORDS.slice(28)),
      ],
    },
    {
      name: 'kick',
      voice: 'kick',
      gain: 0.45,
      bars: [...times(24, 'x . . . . . . . . . x . . . . .'), ...times(4, 'x . . . . . . . . . . . . . . .'), ...times(4, 'x . . . . . . . . . x . . . . .')],
    },
    {
      name: 'snare',
      voice: 'snare',
      gain: 0.36,
      bars: [...drums(24, '. . . . . . . . x . . . . . . .'), ...silence(4), ...drums(4, '. . . . . . . . x . . . . . . .', 'x . . x . . x . x . x . x x x x')],
    },
    {
      name: 'hat',
      voice: 'hat',
      gain: 0.12,
      bars: [...times(24, 'x . . x . . x . x . . x . . x .'), ...times(4, '. . . . x . . . . . . . x . . .'), ...times(4, 'x . . x . . x . x . . x . . x .')],
    },
  ],
};

const U = {
  Cm: chord('C3', 'G4', 'C5', 'Eb5'),
  Ab: chord('Ab2', 'Ab4', 'C5', 'Eb5'),
  Bb: chord('Bb2', 'F4', 'Bb4', 'D5'),
  Fm: chord('F2', 'F4', 'Ab4', 'C5'),
  G: chord('G2', 'G4', 'B4', 'D5'),
  Eb: chord('Eb3', 'G4', 'Bb4', 'Eb5'),
};
const ACT4_CHORDS = [
  ...[U.Cm, U.Cm, U.Ab, U.Bb, U.Cm, U.Cm, U.Ab, U.G],
  ...[U.Cm, U.Cm, U.Ab, U.Bb, U.Fm, U.Fm, U.G, U.G],
  ...[U.Fm, U.Bb, U.Eb, U.Ab, U.Fm, U.G, U.Cm, U.G],
  ...[U.Cm, U.Cm, U.Ab, U.Ab],
  ...[U.Fm, U.Fm, U.G, U.G],
];
const ACT4_HOOK = ['G5 - - - - - Eb5 - C5 - - - Eb5 - G5 -', 'C6 - - - Bb5 - G5 - - - Eb5 - F5 - G5 -', 'Ab5 - - - G5 - F5 - Eb5 - - - C5 - Eb5 -'];
const ACT4_LEAD = [
  ...ACT4_HOOK,
  'F5 - - - - - D5 - Bb4 - - - D5 - F5 -',
  ACT4_HOOK[0]!,
  'C6 - - - D6 - Eb6 - - - D6 - C6 - Bb5 -',
  'Ab5 - - - - - C6 - Eb6 - - - C6 - Ab5 -',
  'G5 - - - - - - - B5 - - - D6 - - -',
  ...ACT4_HOOK,
  'D6 - - - - - Bb5 - F5 - - - Bb5 - D6 -',
  'C6 - - - Ab5 - F5 - C6 - - - Ab5 - F5 -',
  'Ab5 - G5 - F5 - Eb5 - F5 - - - - - - -',
  'G5 - - - B5 - D6 - - - B5 - G5 - - -',
  'D6 - - - - - - - B5 - - - G5 - - -',
  'F5 - - - Ab5 - - - C6 - - - - - - -',
  'D6 - - - - - - - Bb5 - - - F5 - - -',
  'Eb6 - - - - - - - G5 - - - Bb5 - - -',
  'C6 - - - - - - - Ab5 - - - Eb5 - - -',
  'F5 - - - Ab5 - - - C6 - - - F6 - - -',
  'D6 - - - - - - - B5 - - - G5 - - -',
  'Eb6 - - - D6 - C6 - G5 - - - - - - -',
  'B5 - - - - - - - D6 - - - - - - -',
  ...times(2, 'C5 . C5 . Eb5 . C5 . G5 . C5 . Eb5 . C5 .'),
  ...times(2, 'C5 . C5 . Eb5 . C5 . Ab5 . C5 . Eb5 . C5 .'),
  'F5 G5 Ab5 Bb5 C6 - - - F5 G5 Ab5 Bb5 C6 - - -',
  'Ab5 Bb5 C6 D6 Eb6 - - - C6 - Ab5 - F5 - Ab5 -',
  'G5 - B5 - D6 - B5 - G5 - B5 - D6 - G6 -',
  'G6 - - - D6 - B5 - G5 - - - B5 - D6 -',
];

const ACT4: Track = {
  title: 'Umbral Drive',
  bpm: 146,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  key: { tonic: 'C', mode: 'minor', borrowed: [U.G] },
  chords: ACT4_CHORDS,
  loop: true,
  channels: [
    { name: 'lead', voice: 'pulse25', gain: 0.3, bars: ACT4_LEAD },
    { name: 'counter', voice: 'pulse50', gain: 0.1, bars: [...silence(16), ...lower(ACT4_LEAD.slice(16, 24)), ...silence(4), ...lower(ACT4_LEAD.slice(28))] },
    { name: 'stabs', voice: 'pulse12', gain: 0.07, bars: stab('. . x . . . x . . . x . . . x .', ACT4_CHORDS) },
    {
      name: 'bass',
      voice: 'triangle',
      gain: 0.36,
      bars: [...pump('L . L L H . L L L . L L H . L L', ACT4_CHORDS.slice(0, 28)), ...pump('L L L L L L L L H H H H H H H H', ACT4_CHORDS.slice(28))],
    },
    {
      name: 'kick',
      voice: 'kick',
      gain: 0.45,
      bars: [...times(24, 'x . . x . . x . x . . x . . x .'), ...times(4, 'x . . . x . . . x . . . x . . .'), ...times(4, 'x . . x . . x . x . . x . . x .')],
    },
    {
      name: 'snare',
      voice: 'snare',
      gain: 0.4,
      bars: [
        ...drums(24, '. . . . x . . . . . . . x . . .', '. . . . x . . . x . x x X x X X'),
        ...silence(4),
        '. . . . x . . . . . . . x . . .',
        'x . . . x . . . x . . . x . . .',
        'x . x . x . x . x . x . x . x .',
        'x x x x x x x x X X X X X X X X',
      ],
    },
    {
      name: 'hat',
      voice: 'hat',
      gain: 0.1,
      bars: [...times(24, 'x x x x x x x x x x x x x x x x'), ...times(4, 'x . x . x . x . x . x . x . x .'), ...times(4, 'x x x x x x x x x x x x x x x x')],
    },
  ],
};

const S = {
  F: chord('F2', 'A4', 'C5', 'F5'),
  Dm: chord('D3', 'A4', 'D5', 'F5'),
  Gm: chord('G2', 'Bb4', 'D5', 'G5'),
  C: chord('C3', 'G4', 'C5', 'E5'),
  Bb: chord('Bb2', 'Bb4', 'D5', 'F5'),
  Am: chord('A2', 'A4', 'C5', 'E5'),
};
const SHOP_CHORDS = [
  ...[S.F, S.Dm, S.Gm, S.C, S.F, S.Dm, S.Gm, S.C],
  ...[S.F, S.Dm, S.Gm, S.C, S.Bb, S.C, S.F, S.F],
  ...[S.Bb, S.C, S.Am, S.Dm, S.Gm, S.Am, S.Bb, S.C],
  ...[S.F, S.Dm, S.Gm, S.C, S.Bb, S.C, S.F, S.C],
];
const SHOP_HOOK = ['A5 - - - G5 - F5 - C5 - - - - - . .', 'D5 - - - F5 - A5 - - - - - G5 - F5 -', 'G5 - - - - - Bb5 - D5 - - - . . . .', 'E5 - - - F5 - G5 - - - - - . . . .'];
const SHOP_TURN = ['D5 - - - F5 - Bb5 - - - A5 - G5 - F5 -', 'E5 - - - G5 - C6 - - - Bb5 - A5 - G5 -'];

const SHOP: Track = {
  title: 'Hangar Lounge',
  bpm: 96,
  stepsPerBeat: 4,
  beatsPerBar: 4,
  key: { tonic: 'F', mode: 'major', borrowed: [] },
  chords: SHOP_CHORDS,
  loop: true,
  channels: [
    {
      name: 'lead',
      voice: 'triangle',
      gain: 0.34,
      bars: [
        ...SHOP_HOOK,
        'A5 - - - C6 - A5 - F5 - - - . . . .',
        'F5 - - - E5 - D5 - A4 - - - . . D5 -',
        'Bb4 - - - D5 - F5 - G5 - - - F5 - D5 -',
        'E5 - - - - - - - C5 - - - . . . .',
        ...SHOP_HOOK,
        ...SHOP_TURN,
        'A5 - - - - - - - F5 - - - . . . .',
        'C5 - - - - - - - . . . . . . . .',
        'F5 - - - D5 - F5 - Bb5 - - - A5 - - -',
        'G5 - - - E5 - G5 - C6 - - - - - - -',
        'C6 - - - A5 - E5 - A5 - - - G5 - - -',
        'F5 - - - - - D5 - A5 - - - - - - -',
        'Bb5 - - - A5 - G5 - D5 - - - - - - -',
        'C6 - - - Bb5 - A5 - E5 - - - - - - -',
        'D6 - - - C6 - Bb5 - F5 - - - G5 - A5 -',
        'G5 - - - - - - - E5 - - - . . . .',
        ...SHOP_HOOK,
        ...SHOP_TURN,
        'F5 - - - - - - - . . . . . . . .',
        '. . . . . . . . G5 - - - - - - -',
      ],
    },
    { name: 'stabs', voice: 'pulse12', gain: 0.07, bars: stab('. . . . . . x - . . . . . . x -', SHOP_CHORDS) },
    { name: 'bass', voice: 'triangle', gain: 0.34, bars: pump('L - - - - - . . H - - - L - - -', SHOP_CHORDS) },
    { name: 'kick', voice: 'kick', gain: 0.26, bars: times(32, 'x . . . . . x . . . . . . . . .') },
    { name: 'snare', voice: 'snare', gain: 0.18, bars: times(32, '. . . . . . . . . . . . x . . .') },
    { name: 'hat', voice: 'hat', gain: 0.08, bars: drums(32, 'x . x . x . x . x . x . x . x .', 'x . x . x . x . x . x . x . X .') },
  ],
};

export const TRACKS: Record<ScoreId, Track> = { normal: NORMAL, act1: ACT1, act2: ACT2, act3: ACT3, act4: ACT4, shop: SHOP, boss1: BOSS1, boss2: BOSS2 };

const MUSIC_DIR = `${import.meta.env.BASE_URL}music/`;

export const FILE_TRACKS: Record<FileId, FileTrack> = {
  empress: { title: 'Void Empress', urls: [`${MUSIC_DIR}void-empress.ogg`, `${MUSIC_DIR}void-empress.mp3`] },
};
