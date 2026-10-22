import { loud95 } from './loudness';

// Seconds into the source file.
export type Segment = { from: number; to: number };
// Plays the source from `from` to `to`, starting `at` seconds into the line.
export type Slice = { from: number; to: number; at: number };
// shoutAt is when the last segment's speech starts, in seconds into the line.
export type Timeline = { segments: Segment[]; slices: Slice[]; shoutAt: number };

export const SPEECH = {
  hopSec: 0.01,
  // 40 dB under the loudest window is silence, so the clip's own level does not matter. Speech tails fade to about
  // there and a TTS clip's noise floor sits near -60 dB.
  floor: 0.01,
  minSpeechSec: 0.06,
  maxPauseSec: 0.2,
  // Kept around each segment so soft onsets and tails are not cut.
  padSec: 0.03,
} as const;

// About the loudest sfx's loudest window (boom) and twice the boss music on its bus, measured by music.mjs.
export const VOICE_LOUD95 = 0.042;

export function speechSegments(samples: Float32Array, sampleRate: number): Segment[] {
  const hop = Math.round(sampleRate * SPEECH.hopSec);
  const rms: number[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + hop; j++) sum += samples[j]! * samples[j]!;
    rms.push(Math.sqrt(sum / hop));
  }
  const loudest = Math.max(0, ...rms);
  if (loudest === 0) return [];
  const runs: Segment[] = [];
  rms.forEach((r, i) => {
    if (r < loudest * SPEECH.floor) return;
    const from = (i * hop) / sampleRate;
    const to = ((i + 1) * hop) / sampleRate;
    const last = runs[runs.length - 1];
    if (last && from - last.to <= SPEECH.maxPauseSec) last.to = to;
    else runs.push({ from, to });
  });
  return runs.filter((s) => s.to - s.from >= SPEECH.minSpeechSec);
}

// Drops the silence before and after the speech and shortens every pause to maxPauseSec.
export function voiceTimeline(segments: readonly Segment[], durationSec: number): Timeline | null {
  if (segments.length === 0) return null;
  const slices: Slice[] = [];
  let speechAt = 0;
  for (const s of segments) {
    const from = Math.max(0, s.from - SPEECH.padSec);
    const to = Math.min(durationSec, s.to + SPEECH.padSec);
    if (slices.length === 0) speechAt = s.from - from;
    slices.push({ from, to, at: speechAt - (s.from - from) });
    speechAt += s.to - s.from + SPEECH.maxPauseSec;
  }
  const last = slices[slices.length - 1]!;
  return { segments: [...segments], slices, shoutAt: last.at + (segments[segments.length - 1]!.from - last.from) };
}

// The gain that brings the line as played, shortened pauses included, to VOICE_LOUD95.
export function voiceGain(samples: Float32Array, sampleRate: number, slices: readonly Slice[]): number | null {
  const at = (sec: number) => Math.round(sec * sampleRate);
  const end = Math.max(0, ...slices.map((s) => s.at + s.to - s.from));
  const played = new Float32Array(at(end));
  for (const s of slices) played.set(samples.subarray(at(s.from), at(s.to)).subarray(0, played.length - at(s.at)), at(s.at));
  const loud = loud95([played], sampleRate);
  return loud > 0 ? VOICE_LOUD95 / loud : null;
}

// Any of the ready lines but the last one spoken, so two or more never repeat back to back. random is in [0, 1).
export function pickLine(ready: readonly number[], last: number | null, random: number): number | null {
  const pool = ready.length >= 2 ? ready.filter((i) => i !== last) : ready;
  return pool[Math.floor(random * pool.length)] ?? null;
}
