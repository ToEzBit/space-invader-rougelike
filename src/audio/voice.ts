import transAm1 from '../assets/voice/transam-1.mp3';
import transAm2 from '../assets/voice/transam-2.mp3';
import { audioContext, fetchAudio, onAudio } from './context';
import { pickLine, speechSegments, voiceGain, voiceTimeline, type Segment, type Slice } from './voiceLine';

export const VOICE_URLS = [transAm1, transAm2];
const DECLICK_FADE_SEC = 0.005;

export type VoiceLine = { buffer: AudioBuffer; segments: Segment[]; slices: Slice[]; shoutAtMs: number; gain: number };
type LineLoad = { status: 'loading' } | { status: 'ready'; line: VoiceLine } | { status: 'failed'; why: string };
export type Speech = { shoutAfterPressMs: number; audioMsSincePress: () => number };

const loads: LineLoad[] = VOICE_URLS.map(() => ({ status: 'loading' }));
let last: number | null = null;
let spoken = 0;

onAudio((ctx) => void loadAll(ctx));

export function speak(speechLeadMs: number, minShoutAfterPressMs: number): Speech | null {
  const ctx = audioContext();
  if (ctx?.state !== 'running') return null;
  const ready = loads.flatMap((l, i) => (l.status === 'ready' ? [{ i, line: l.line }] : []));
  const pick = pickLine(ready.map((r) => r.i), last, unseededRandom());
  const line = ready.find((r) => r.i === pick)?.line;
  if (pick === null || !line) return null;
  const t0 = ctx.currentTime;
  const shoutAfterPressMs = Math.max(minShoutAfterPressMs, speechLeadMs + line.shoutAtMs);
  playLine(ctx, ctx.destination, line, t0 + (shoutAfterPressMs - line.shoutAtMs) / 1000);
  last = pick;
  spoken++;
  return { shoutAfterPressMs, audioMsSincePress: () => (ctx.currentTime - t0) * 1000 };
}

function unseededRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
}

export function playLine(ctx: BaseAudioContext, out: AudioNode, line: VoiceLine, when: number): void {
  for (const s of line.slices) {
    const at = when + s.lineAtSec;
    const len = s.toSec - s.fromSec;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = line.buffer;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(line.gain, at + DECLICK_FADE_SEC);
    gain.gain.setValueAtTime(line.gain, at + len - DECLICK_FADE_SEC);
    gain.gain.linearRampToValueAtTime(0, at + len);
    source.connect(gain).connect(out);
    source.onended = () => gain.disconnect();
    source.start(at, s.fromSec, len);
  }
}

export async function decodeLine(ctx: BaseAudioContext, url: string): Promise<VoiceLine | string> {
  const buffer = await fetchAudio(ctx, url);
  if (typeof buffer === 'string') return buffer;
  const samples = buffer.getChannelData(0);
  const segments = speechSegments(samples, buffer.sampleRate);
  const timeline = voiceTimeline(segments, buffer.duration);
  const gain = timeline && voiceGain(samples, buffer.sampleRate, timeline.slices);
  if (!timeline || !gain) return 'silent';
  return { buffer, segments, slices: timeline.slices, shoutAtMs: timeline.shoutAtSec * 1000, gain };
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
