import { loud95 } from './loudness';

export type Segment = { fromSec: number; toSec: number };
export type Slice = { fromSec: number; toSec: number; lineAtSec: number };
export type Timeline = { segments: Segment[]; slices: Slice[]; shoutAtSec: number };

export const SPEECH = {
  hopSec: 0.01,
  silenceDbUnderLoudest: -40,
  minSpeechSec: 0.06,
  maxPauseSec: 0.2,
  padSec: 0.03,
} as const;

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
  const silence = loudest * 10 ** (SPEECH.silenceDbUnderLoudest / 20);
  const runs: Segment[] = [];
  rms.forEach((r, i) => {
    if (r < silence) return;
    const fromSec = (i * hop) / sampleRate;
    const toSec = ((i + 1) * hop) / sampleRate;
    const last = runs[runs.length - 1];
    if (last && fromSec - last.toSec <= SPEECH.maxPauseSec) last.toSec = toSec;
    else runs.push({ fromSec, toSec });
  });
  return runs.filter((s) => s.toSec - s.fromSec >= SPEECH.minSpeechSec);
}

export function voiceTimeline(segments: readonly Segment[], durationSec: number): Timeline | null {
  if (segments.length === 0) return null;
  const slices: Slice[] = [];
  let speechAt = 0;
  for (const s of segments) {
    const fromSec = Math.max(0, s.fromSec - SPEECH.padSec);
    const toSec = Math.min(durationSec, s.toSec + SPEECH.padSec);
    if (slices.length === 0) speechAt = s.fromSec - fromSec;
    slices.push({ fromSec, toSec, lineAtSec: speechAt - (s.fromSec - fromSec) });
    speechAt += s.toSec - s.fromSec + SPEECH.maxPauseSec;
  }
  const last = slices[slices.length - 1]!;
  return { segments: [...segments], slices, shoutAtSec: last.lineAtSec + (segments[segments.length - 1]!.fromSec - last.fromSec) };
}

export function voiceGain(samples: Float32Array, sampleRate: number, slices: readonly Slice[]): number | null {
  const at = (sec: number) => Math.round(sec * sampleRate);
  const end = Math.max(0, ...slices.map((s) => s.lineAtSec + s.toSec - s.fromSec));
  const played = new Float32Array(at(end));
  for (const s of slices) played.set(samples.subarray(at(s.fromSec), at(s.toSec)).subarray(0, played.length - at(s.lineAtSec)), at(s.lineAtSec));
  const loud = loud95([played], sampleRate);
  return loud > 0 ? VOICE_LOUD95 / loud : null;
}

export function pickLine(ready: readonly number[], last: number | null, random: number): number | null {
  const pool = ready.length >= 2 ? ready.filter((i) => i !== last) : ready;
  return pool[Math.floor(random * pool.length)] ?? null;
}
