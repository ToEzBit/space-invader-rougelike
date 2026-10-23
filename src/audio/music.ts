import { onAudio } from './context';
import { sourceFor, type Cue, type Source } from './director';
import { attemptDue, attemptFailed, type FileLoad, type LoadingFile, type ReadyFile } from './fileLoad';
import { gainToMatch } from './loudness';
import { compile, playStep, type Song } from './synth';
import { FILE_TRACKS, type FileId, type JingleId, type ScoreId, type TrackId } from './tracks';

export const MUSIC_VOLUME = 0.038;
// Boss fights play louder than the rest of the game, on top of the bus volume.
const BOSS_LEVEL = 2;
export const TRACK_LEVEL: Record<TrackId, number> = {
  normal: 1,
  act1: 1,
  act2: 1,
  act3: 1,
  act4: 1,
  shop: 1,
  clear: 1,
  victory: 1,
  defeat: 1,
  boss1: BOSS_LEVEL,
  boss2: BOSS_LEVEL,
  empress: BOSS_LEVEL,
};
const FADE_SEC = 0.8;
// A jingle cuts in over a quick duck rather than the crossfade, so its first notes land on a clear bus.
const DUCK_SEC = 0.12;
// How long a jingle's last drum hits and releases sound past its final step.
const RING_SEC = 0.2;
const MUTE_SEC = 0.08;
const LOOKAHEAD_SEC = 0.2;
const TICK_MS = 25;
const MUTED_KEY = 'space-invader.musicMuted';

type Playing =
  // endsAt is when a jingle has rung out; a looping score never ends.
  | { kind: 'score'; id: ScoreId; song: Song; gain: GainNode; t0: number; next: number; until: number; endsAt: number }
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
const jingles: Record<JingleId, number> = { clear: 0, victory: 0, defeat: 0 };

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
  const source = sourceFor(wanted, fileLoad);
  return {
    track: file ?? wanted,
    source: sourceLabel(source),
    fellBack: file !== null && source.kind === 'score',
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
    jingles: { ...jingles },
    ringing: bus ? ([current, ...fading].find((p) => p && ringing(p, bus!.context.currentTime))?.id ?? null) : null,
    fadingGain: fading.filter((p) => p.kind === 'file' || p.song.loop).reduce((sum, p) => sum + p.gain.gain.value, 0),
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
  // Every song starts loading with the first gesture, minutes before its fight, and retries on the wall clock.
  for (const id of Object.keys(files) as FileId[]) {
    const attempt = attemptDue(files[id], performance.now());
    if (attempt) void load(ctx, id, attempt);
  }
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

// A jingle is never cut short: it rings out, and whatever is wanted next starts once it has.
function crossfade(ctx: AudioContext, now: number, target: Exclude<Source, { kind: 'holdWhileLoading' }>): void {
  const jingle = target.kind === 'score' && isJingle(target.id);
  if (current) {
    if (ringing(current, now)) current.until = current.endsAt;
    else fadeOut(current, now, jingle ? DUCK_SEC : FADE_SEC);
    fading.push(current);
    current = null;
  }
  if (jingle) {
    for (const p of fading) if (!ringing(p, now)) fadeOut(p, now, DUCK_SEC);
    lowpassMusic(null, DUCK_SEC);
  }
  if (target.kind === 'silence' || !bus) return;
  const at = Math.max(now, ...fading.filter((p) => ringing(p, now)).map((p) => p.endsAt));
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(bus);
  current = target.kind === 'file' ? startFile(ctx, at, target.id, target.file, gain) : startScore(at, target.id, gain);
  plays++;
  if (target.kind === 'score' && isJingle(target.id)) jingles[target.id]++;
}

function isJingle(id: ScoreId): id is JingleId {
  return id in jingles;
}

function ringing(p: Playing, now: number): p is Extract<Playing, { kind: 'score' }> {
  return p.kind === 'score' && p.endsAt !== Infinity && p.endsAt > now;
}

function fadeOut(p: Playing, now: number, sec: number): void {
  const g = p.gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(0, now + sec);
  p.until = Math.min(p.until, now + sec);
  if (p.kind === 'file') p.source.stop(p.until);
}

function startScore(at: number, id: ScoreId, gain: GainNode): Playing {
  let song = songs.get(id);
  if (!song) songs.set(id, (song = compile(id)));
  const t0 = at + 0.05;
  if (song.loop) fadeIn(gain, at, TRACK_LEVEL[id]);
  else gain.gain.setValueAtTime(TRACK_LEVEL[id], at);
  return { kind: 'score', id, song, gain, t0, next: 0, until: Infinity, endsAt: song.loop ? Infinity : t0 + song.steps * song.stepSec + RING_SEC };
}

function startFile(ctx: AudioContext, at: number, id: FileId, file: ReadyFile, gain: GainNode): Playing {
  const source = ctx.createBufferSource();
  source.buffer = file.buffer;
  source.loop = true;
  source.connect(gain);
  source.start(at);
  fadeIn(gain, at, file.gain * TRACK_LEVEL[id]);
  return { kind: 'file', id, url: file.url, source, gain, until: Infinity };
}

function fadeIn(gain: GainNode, at: number, level: number): void {
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + FADE_SEC);
}

async function load(ctx: AudioContext, id: FileId, attempt: LoadingFile): Promise<void> {
  files[id] = attempt;
  const tried: string[] = [];
  for (const url of playableUrls(id)) {
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
  files[id] = attemptFailed(attempt, tried, performance.now());
  if (attempt.attempt === 1) console.warn(`music: no playable audio at ${tried.join(' or ')}, so the ${FILE_TRACKS[id].title} fight plays the synth boss tracks until a retry loads it`);
}

const playable = new Map<FileId, readonly string[]>();

// Safari may not decode Ogg Vorbis, so a format the browser says it cannot play is never downloaded.
function playableUrls(id: FileId): readonly string[] {
  let urls = playable.get(id);
  if (!urls) {
    const probe = document.createElement('audio');
    playable.set(id, (urls = FILE_TRACKS[id].sources.filter((s) => probe.canPlayType(s.type) !== '').map((s) => s.url)));
  }
  return urls;
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
  const last = p.song.loop ? Infinity : p.song.steps;
  p.next = Math.max(p.next, Math.ceil((now - p.t0) / stepSec));
  for (let at = p.t0 + p.next * stepSec; at < horizon && p.next < last; at = p.t0 + ++p.next * stepSec) playStep(ctx, p.gain, p.song, p.next, at);
}
