import { onAudio } from './context';
import { compile, playStep, type Song } from './synth';
import type { TrackId } from './tracks';

export const MUSIC_VOLUME = 0.038;
const FADE_SEC = 0.8;
const MUTE_SEC = 0.08;
const LOOKAHEAD_SEC = 0.2;
const TICK_MS = 25;
const MUTED_KEY = 'space-invader.musicMuted';

type Playing = { song: Song; gain: GainNode; t0: number; next: number; until: number };

const songs = new Map<TrackId, Song>();
let wanted: TrackId | null = null;
let current: Playing | null = null;
let fading: Playing[] = [];
let bus: GainNode | null = null;
let muted = loadMuted();
let plays = 0;

onAudio((ctx) => {
  bus = ctx.createGain();
  bus.gain.value = muted ? 0 : MUSIC_VOLUME;
  bus.connect(ctx.destination);
  setInterval(() => scheduleAheadOfAudioClock(ctx), TICK_MS);
});

export function want(id: TrackId | null): void {
  wanted = id;
}

export function toggleMute(): void {
  muted = !muted;
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Storage can be blocked; the toggle still holds for this session.
  }
  if (!bus) return;
  const now = bus.context.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setValueAtTime(bus.gain.value, now);
  bus.gain.linearRampToValueAtTime(muted ? 0 : MUSIC_VOLUME, now + MUTE_SEC);
}

export function isMuted(): boolean {
  return muted;
}

export function musicState(): Record<string, unknown> {
  return {
    track: wanted,
    playing: current?.song.id ?? null,
    muted,
    ctx: bus?.context.state ?? null,
    busGain: bus?.gain.value ?? null,
    step: current?.next ?? null,
    plays,
  };
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function scheduleAheadOfAudioClock(ctx: AudioContext): void {
  const now = ctx.currentTime;
  if ((current?.song.id ?? null) !== wanted) crossfade(ctx, now);
  for (const p of current ? [current, ...fading] : fading) schedule(ctx, p, now);
  fading = fading.filter((p) => {
    if (p.until > now) return true;
    p.gain.disconnect();
    return false;
  });
}

function crossfade(ctx: AudioContext, now: number): void {
  if (current) {
    const g = current.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE_SEC);
    current.until = now + FADE_SEC;
    fading.push(current);
    current = null;
  }
  if (!wanted || !bus) return;
  let song = songs.get(wanted);
  if (!song) songs.set(wanted, (song = compile(wanted)));
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_SEC);
  gain.connect(bus);
  current = { song, gain, t0: now + 0.05, next: 0, until: Infinity };
  plays++;
}

function schedule(ctx: AudioContext, p: Playing, now: number): void {
  const { stepSec } = p.song;
  const horizon = Math.min(now + LOOKAHEAD_SEC, p.until);
  p.next = Math.max(p.next, Math.ceil((now - p.t0) / stepSec));
  for (let at = p.t0 + p.next * stepSec; at < horizon; at = p.t0 + ++p.next * stepSec) playStep(ctx, p.gain, p.song, p.next, at);
}
