// A score is written one bar per string, one whitespace-separated token per step:
//   `A4`, `C#5`, `Bb3`  a note        `E4+G4+B4`  a chord        `x` / `X`  a drum hit / an accented one
//   `.`  a rest                      `-`  holds the previous note or hit one more step
export type NoteEvent = { step: number; steps: number; midis: readonly number[]; accent: boolean };

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b)?(-?\d)$/;

export function midiOf(name: string): number {
  const m = NOTE.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const [, letter, accidental, octave] = m;
  return 12 * (Number(octave) + 1) + PITCH[letter!]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
}

export function freqOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function octaveUp(name: string): string {
  const m = NOTE.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  return `${m[1]}${m[2] ?? ''}${Number(m[3]) + 1}`;
}

// Writes a bar from a rhythm whose symbols stand for notes, so one rhythm serves every chord of a progression.
export function beat(rhythm: string, notes: Record<string, string>): string {
  return rhythm
    .trim()
    .split(/\s+/)
    .map((t) => notes[t] ?? t)
    .join(' ');
}

export function parseBars(bars: readonly string[], stepsPerBar: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  let last: NoteEvent | null = null;
  bars.forEach((bar, b) => {
    const tokens = bar.trim().split(/\s+/);
    if (tokens.length !== stepsPerBar) throw new Error(`bar ${b + 1} has ${tokens.length} steps, not ${stepsPerBar}: ${bar}`);
    tokens.forEach((token, i) => {
      const step = b * stepsPerBar + i;
      if (token === '-') {
        if (!last) throw new Error(`bar ${b + 1} step ${i + 1} holds nothing`);
        last.steps++;
        return;
      }
      if (token === '.') {
        last = null;
        return;
      }
      const hit = token === 'x' || token === 'X';
      last = { step, steps: 1, midis: hit ? [] : token.split('+').map(midiOf), accent: token === 'X' };
      events.push(last);
    });
  });
  return events;
}
