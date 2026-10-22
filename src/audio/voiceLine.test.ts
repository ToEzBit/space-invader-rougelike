import { describe, expect, it } from 'vitest';
import { loud95 } from './loudness';
import { pickLine, speechSegments, SPEECH, VOICE_LOUD95, voiceGain, voiceTimeline, type Segment } from './voiceLine';

const RATE = 44100;

function bursts(durationSec: number, spans: readonly [number, number][], amp = 0.5): Float32Array {
  const out = new Float32Array(Math.round(durationSec * RATE));
  for (const [from, to] of spans) for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return out;
}

const LINE: [number, number][] = [
  [0.3, 1.0],
  [1.4, 2.45],
  [2.9, 3.15],
  [3.75, 4.4],
];

const near = (got: readonly Segment[], want: readonly [number, number][]) => {
  expect(got).toHaveLength(want.length);
  got.forEach((s, i) => {
    expect(Math.abs(s.fromSec - want[i]![0])).toBeLessThanOrEqual(SPEECH.hopSec);
    expect(Math.abs(s.toSec - want[i]![1])).toBeLessThanOrEqual(SPEECH.hopSec);
  });
};

describe('speech segments', () => {
  it('finds each burst of sound between the pauses', () => {
    near(speechSegments(bursts(4.78, LINE), RATE), LINE);
  });

  it('finds the same segments in a much quieter clip', () => {
    near(speechSegments(bursts(4.78, LINE, 0.04), RATE), LINE);
  });

  it('keeps a pause no longer than the pause cap inside one segment', () => {
    near(speechSegments(bursts(2, [[0.3, 0.6], [0.75, 1.2]]), RATE), [[0.3, 1.2]]);
  });

  it('ignores a click too short to be speech', () => {
    near(speechSegments(bursts(3, [[0.3, 1.0], [2.0, 2.03]]), RATE), [[0.3, 1.0]]);
  });

  it('finds nothing in silence', () => {
    expect(speechSegments(new Float32Array(RATE), RATE)).toEqual([]);
  });
});

describe('voice timeline', () => {
  const segments: Segment[] = LINE.map(([fromSec, toSec]) => ({ fromSec, toSec }));
  const t = voiceTimeline(segments, 4.78)!;

  it('starts the line with its speech, not the silence before it', () => {
    expect(t.slices[0]!.lineAtSec).toBe(0);
    expect(t.slices[0]!.fromSec).toBeCloseTo(0.3 - SPEECH.padSec);
  });

  it('plays every segment whole, with a little room around it', () => {
    t.slices.forEach((s, i) => {
      expect(s.fromSec).toBeCloseTo(LINE[i]![0] - SPEECH.padSec);
      expect(s.toSec).toBeCloseTo(LINE[i]![1] + SPEECH.padSec);
    });
  });

  it('shortens every long pause to the pause cap', () => {
    const speechStart = (i: number) => t.slices[i]!.lineAtSec + (LINE[i]![0] - t.slices[i]!.fromSec);
    for (let i = 1; i < LINE.length; i++) {
      const prevEnd = speechStart(i - 1) + LINE[i - 1]![1] - LINE[i - 1]![0];
      expect(speechStart(i) - prevEnd).toBeCloseTo(SPEECH.maxPauseSec);
    }
  });

  it('puts the shout where the last segment starts once the pauses are shortened', () => {
    const spoken = 0.7 + 1.05 + 0.25;
    expect(t.shoutAtSec).toBeCloseTo(SPEECH.padSec + spoken + 3 * SPEECH.maxPauseSec);
  });

  it('never runs a padded slice past the ends of the file', () => {
    const edge = voiceTimeline([{ fromSec: 0.01, toSec: 0.5 }, { fromSec: 1.2, toSec: 1.49 }], 1.5)!;
    expect(edge.slices[0]!.fromSec).toBe(0);
    expect(edge.slices[1]!.toSec).toBe(1.5);
    expect(edge.shoutAtSec).toBeCloseTo(0.01 + 0.49 + SPEECH.maxPauseSec);
  });

  it('has nothing to play without speech', () => {
    expect(voiceTimeline([], 2)).toBeNull();
  });
});

describe('voice gain', () => {
  it('brings the played speech to the voice loudness', () => {
    const samples = bursts(4.78, LINE, 0.3);
    const { slices } = voiceTimeline(speechSegments(samples, RATE), 4.78)!;
    const gain = voiceGain(samples, RATE, slices)!;
    expect(gain).toBeCloseTo(VOICE_LOUD95 / (0.3 / Math.SQRT2), 2);
    const played = Float32Array.from(samples.subarray(Math.round(0.3 * RATE), Math.round(1.0 * RATE)), (v) => v * gain);
    expect(loud95([played], RATE)).toBeCloseTo(VOICE_LOUD95, 3);
  });

  it('has no gain for silence', () => {
    expect(voiceGain(new Float32Array(RATE), RATE, [{ fromSec: 0, toSec: 1, lineAtSec: 0 }])).toBeNull();
  });
});

describe('picking a line', () => {
  const randoms = [0, 0.2, 0.5, 0.7, 0.99];

  it('alternates between two lines whatever the random draw', () => {
    let last: number | null = null;
    const said: number[] = [];
    for (const r of [...randoms, ...randoms]) said.push((last = pickLine([0, 1], last, r)!));
    expect(said.every((line, i) => i === 0 || line !== said[i - 1])).toBe(true);
  });

  it('never repeats among three, and can reach each other line', () => {
    for (const last of [0, 1, 2]) {
      const next = new Set(randoms.map((r) => pickLine([0, 1, 2], last, r)));
      expect(next.has(last)).toBe(false);
      expect(next.size).toBe(2);
    }
  });

  it('repeats the only line that loaded, and has none when none did', () => {
    expect(pickLine([1], 1, 0.5)).toBe(1);
    expect(pickLine([], null, 0.5)).toBeNull();
  });

  it('picks from both at random for the first line', () => {
    expect(new Set(randoms.map((r) => pickLine([0, 1], null, r)))).toEqual(new Set([0, 1]));
  });
});
