import transAm1 from '../assets/voice/transam-1.mp3';
import transAm2 from '../assets/voice/transam-2.mp3';
import { audioContext, onAudio } from './context';
import { pickLine, speechSegments, voiceGain, voiceTimeline, type Segment, type Slice } from './voiceLine';

// The pilot's TRANS-AM lines, generated with MiniMax TTS. Every one ends on the shout.
export const VOICE_URLS = [transAm1, transAm2];
// Each slice fades in and out over this, so cutting the file between words never clicks.
const EDGE_SEC = 0.005;

export type VoiceLine = { buffer: AudioBuffer; segments: Segment[]; slices: Slice[]; shoutAtMs: number; gain: number };
type LineLoad = { status: 'loading' } | { status: 'ready'; line: VoiceLine } | { status: 'failed'; why: string };
// shoutAtMs is when the shout lands, counted from the press on the audio clock the line plays on.
export type Speech = { shoutAtMs: number; elapsedMs: () => number };

const loads: LineLoad[] = VOICE_URLS.map(() => ({ status: 'loading' }));
let last: number | null = null;
let spoken = 0;

onAudio((ctx) => void loadAll(ctx));

// Starts a line now so its speech begins leadMs from now, later if that would put the shout before atLeastMs.
// Null, and the cut-in plays silent, while the audio is not running or no line has loaded.
export function speak(leadMs: number, atLeastMs: number): Speech | null {
  const ctx = audioContext();
  if (ctx?.state !== 'running') return null;
  const ready = loads.flatMap((l, i) => (l.status === 'ready' ? [{ i, line: l.line }] : []));
  // Not Math.random, which a seeded boss replay owns.
  const pick = pickLine(ready.map((r) => r.i), last, crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32);
  const line = ready.find((r) => r.i === pick)?.line;
  if (pick === null || !line) return null;
  const t0 = ctx.currentTime;
  const shoutAtMs = Math.max(atLeastMs, leadMs + line.shoutAtMs);
  playLine(ctx, ctx.destination, line, t0 + (shoutAtMs - line.shoutAtMs) / 1000);
  last = pick;
  spoken++;
  return { shoutAtMs, elapsedMs: () => (ctx.currentTime - t0) * 1000 };
}

export function playLine(ctx: BaseAudioContext, out: AudioNode, line: VoiceLine, when: number): void {
  for (const s of line.slices) {
    const at = when + s.at;
    const len = s.to - s.from;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = line.buffer;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(line.gain, at + EDGE_SEC);
    gain.gain.setValueAtTime(line.gain, at + len - EDGE_SEC);
    gain.gain.linearRampToValueAtTime(0, at + len);
    source.connect(gain).connect(out);
    source.onended = () => gain.disconnect();
    source.start(at, s.from, len);
  }
}

export async function decodeLine(ctx: BaseAudioContext, url: string): Promise<VoiceLine | string> {
  let buffer: AudioBuffer;
  try {
    const res = await fetch(url);
    if (!res.ok) return `HTTP ${res.status}`;
    buffer = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (e) {
    return e instanceof Error ? e.name : String(e);
  }
  const samples = buffer.getChannelData(0);
  const segments = speechSegments(samples, buffer.sampleRate);
  const timeline = voiceTimeline(segments, buffer.duration);
  const gain = timeline && voiceGain(samples, buffer.sampleRate, timeline.slices);
  if (!timeline || !gain) return 'silent';
  return { buffer, segments, slices: timeline.slices, shoutAtMs: timeline.shoutAt * 1000, gain };
}

export function voiceState(): Record<string, unknown> {
  return {
    lines: loads.map((l, i) => {
      const url = VOICE_URLS[i];
      if (l.status !== 'ready') return { url, ...l };
      const { segments, slices, shoutAtMs, gain } = l.line;
      return { url, status: l.status, segments, slices, shoutAtMs, gain };
    }),
    last,
    spoken,
  };
}

async function loadAll(ctx: AudioContext): Promise<void> {
  const got = await Promise.all(VOICE_URLS.map((url) => decodeLine(ctx, url)));
  got.forEach((g, i) => (loads[i] = typeof g === 'string' ? { status: 'failed', why: g } : { status: 'ready', line: g }));
  const failed = got.flatMap((g, i) => (typeof g === 'string' ? [`${VOICE_URLS[i]} (${g})`] : []));
  if (failed.length === 0) return;
  const rest = failed.length < got.length ? 'only the others play' : 'the TRANS-AM cut-in plays silent';
  console.warn(`voice: could not load ${failed.join(' or ')}, so ${rest}`);
}
