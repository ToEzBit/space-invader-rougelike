import { onAudio } from './context';
import { compile, playStep, type Song } from './synth';
import type { TrackId } from './tracks';

// The music bus sits under the sfx, which go straight to the destination.
export const MUSIC_VOLUME = 0.065;
const FADE_SEC = 0.8;
const MUTE_SEC = 0.08;
// Notes go to the audio clock this far ahead, from a timer rather than the frame loop, so the music keeps time
// through frame hitches and through anything that pauses a scene's clock, such as the TRANS-AM cut-in.
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
  setInterval(() => tick(ctx), TICK_MS);
});

// Idempotent, so a scene can call it every frame: only a different track crossfades.
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

function tick(ctx: AudioContext): void {
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
  const horizon = Math.min(now + LOOKAHEAD_SEC, p.until);
  for (let at = p.t0 + p.next * p.song.stepSec; at < horizon; at = p.t0 + ++p.next * p.song.stepSec) {
    // After a long stall the timer wakes up behind the audio clock; drop the missed steps rather than bunch them.
    if (at >= now) playStep(ctx, p.gain, p.song, p.next, at);
  }
}
