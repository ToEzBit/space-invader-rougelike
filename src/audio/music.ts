import { onAudio } from './context';
import { sourceFor, type Cue, type FileLoad, type ReadyFile, type Source } from './director';
import { gainToMatch } from './loudness';
import { compile, playStep, type Song } from './synth';
import { FILE_TRACKS, type FileId, type ScoreId, type TrackId } from './tracks';

export const MUSIC_VOLUME = 0.038;
// Boss fights play louder than the rest of the game, on top of the bus volume.
const BOSS_LEVEL = 2;
export const TRACK_LEVEL: Record<TrackId, number> = { normal: 1, act1: 1, boss1: BOSS_LEVEL, boss2: BOSS_LEVEL, empress: BOSS_LEVEL };
const FADE_SEC = 0.8;
const MUTE_SEC = 0.08;
const LOOKAHEAD_SEC = 0.2;
const TICK_MS = 25;
const MUTED_KEY = 'space-invader.musicMuted';

type Playing =
  | { kind: 'score'; id: ScoreId; song: Song; gain: GainNode; t0: number; next: number; until: number }
  | { kind: 'file'; id: FileId; url: string; source: AudioBufferSourceNode; gain: GainNode; until: number };

const songs = new Map<ScoreId, Song>();
const files: Record<FileId, FileLoad> = { empress: { status: 'idle' } };
let wanted: Cue | null = null;
let current: Playing | null = null;
let fading: Playing[] = [];
let bus: GainNode | null = null;
let lowpass: BiquadFilterNode | null = null;
let muted = loadMuted();
let plays = 0;

onAudio((ctx) => {
  bus = ctx.createGain();
  bus.gain.value = muted ? 0 : MUSIC_VOLUME;
  lowpass = openLowpass(ctx);
  bus.connect(lowpass).connect(ctx.destination);
  setInterval(() => scheduleAheadOfAudioClock(ctx), TICK_MS);
});

export function want(cue: Cue | null): void {
  wanted = cue;
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

export function openLowpass(ctx: BaseAudioContext): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.frequency.value = f.frequency.maxValue;
  return f;
}

export function lowpassMusic(hz: number | null, sec: number): void {
  if (!lowpass) return;
  const f = lowpass.frequency;
  const now = lowpass.context.currentTime;
  f.cancelScheduledValues(now);
  f.setValueAtTime(f.value, now);
  f.exponentialRampToValueAtTime(hz ?? f.maxValue, now + sec);
}

export function isMuted(): boolean {
  return muted;
}

export function musicState(): Record<string, unknown> {
  const file = fileOf(wanted);
  return {
    track: file ?? wanted,
    source: sourceLabel(sourceFor(wanted, fileLoad)),
    fellBack: file !== null && files[file].status === 'failed',
    playing: current?.id ?? null,
    url: current?.kind === 'file' ? current.url : null,
    trackGain: current?.gain.gain.value ?? null,
    files: Object.fromEntries(Object.entries(files).map(([id, f]) => [id, f.status === 'ready' ? { status: f.status, url: f.url, gain: f.gain } : f])),
    muted,
    ctx: bus?.context.state ?? null,
    busGain: bus?.gain.value ?? null,
    cutoffHz: lowpass?.frequency.value ?? null,
    step: current?.kind === 'score' ? current.next : null,
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

function fileOf(cue: Cue | null): FileId | null {
  return cue !== null && typeof cue === 'object' ? cue.file : null;
}

function fileLoad(id: FileId): FileLoad {
  return files[id];
}

function sourceLabel(source: Source): string | null {
  switch (source.kind) {
    case 'score':
    case 'file':
      return source.id;
    case 'silence':
      return null;
    case 'holdWhileLoading':
      return source.kind;
  }
}

function scheduleAheadOfAudioClock(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const file = fileOf(wanted);
  if (file && files[file].status === 'idle') void load(ctx, file);
  const target = sourceFor(wanted, fileLoad);
  if (target.kind !== 'holdWhileLoading' && (target.kind === 'silence' ? null : target.id) !== (current?.id ?? null)) crossfade(ctx, now, target);
  for (const p of current ? [current, ...fading] : fading) if (p.kind === 'score') schedule(ctx, p, now);
  fading = fading.filter((p) => {
    if (p.until > now) return true;
    if (p.kind === 'file') p.source.disconnect();
    p.gain.disconnect();
    return false;
  });
}

function crossfade(ctx: AudioContext, now: number, target: Exclude<Source, { kind: 'holdWhileLoading' }>): void {
  if (current) {
    const g = current.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE_SEC);
    current.until = now + FADE_SEC;
    if (current.kind === 'file') current.source.stop(current.until);
    fading.push(current);
    current = null;
  }
  if (target.kind === 'silence' || !bus) return;
  const gain = ctx.createGain();
  gain.connect(bus);
  current = target.kind === 'file' ? startFile(ctx, now, target.id, target.file, gain) : startScore(now, target.id, gain);
  plays++;
}

function startScore(now: number, id: ScoreId, gain: GainNode): Playing {
  let song = songs.get(id);
  if (!song) songs.set(id, (song = compile(id)));
  fadeIn(gain, now, TRACK_LEVEL[id]);
  return { kind: 'score', id, song, gain, t0: now + 0.05, next: 0, until: Infinity };
}

function startFile(ctx: AudioContext, now: number, id: FileId, file: ReadyFile, gain: GainNode): Playing {
  const source = ctx.createBufferSource();
  source.buffer = file.buffer;
  source.loop = true;
  source.connect(gain);
  source.start(now);
  fadeIn(gain, now, file.gain * TRACK_LEVEL[id]);
  return { kind: 'file', id, url: file.url, source, gain, until: Infinity };
}

function fadeIn(gain: GainNode, now: number, level: number): void {
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(level, now + FADE_SEC);
}

async function load(ctx: AudioContext, id: FileId): Promise<void> {
  files[id] = { status: 'loading' };
  const { title, urls } = FILE_TRACKS[id];
  const tried: string[] = [];
  for (const url of urls) {
    const got = await decoded(ctx, url);
    if (typeof got === 'string') {
      tried.push(`${url} (${got})`);
      continue;
    }
    const gain = gainToMatch(Array.from({ length: got.numberOfChannels }, (_, i) => got.getChannelData(i)), got.sampleRate);
    if (gain !== null) {
      files[id] = { status: 'ready', url, buffer: got, gain };
      return;
    }
    tried.push(`${url} (silent)`);
  }
  files[id] = { status: 'failed', tried };
  console.warn(`music: no playable audio at ${tried.join(' or ')}, so the ${title} fight plays the synth boss tracks instead`);
}

async function decoded(ctx: AudioContext, url: string): Promise<AudioBuffer | string> {
  try {
    const res = await fetch(url);
    return res.ok ? await ctx.decodeAudioData(await res.arrayBuffer()) : `HTTP ${res.status}`;
  } catch (e) {
    return e instanceof Error ? e.name : String(e);
  }
}

function schedule(ctx: AudioContext, p: Extract<Playing, { kind: 'score' }>, now: number): void {
  const { stepSec } = p.song;
  const horizon = Math.min(now + LOOKAHEAD_SEC, p.until);
  p.next = Math.max(p.next, Math.ceil((now - p.t0) / stepSec));
  for (let at = p.t0 + p.next * stepSec; at < horizon; at = p.t0 + ++p.next * stepSec) playStep(ctx, p.gain, p.song, p.next, at);
}
