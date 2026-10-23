import flashUrl from '../assets/sfx/newtype-flash.mp3';
import { audioContext, fetchAudio, onAudio } from './context';
import { gainToMatch } from './loudness';

export const FLASH_URL = flashUrl;
export const FLASH_LOUD95 = 0.042;
const DECLICK_FADE_SEC = 0.005;

export type Flash = { buffer: AudioBuffer; gain: number };
type FlashLoad = { status: 'loading' } | ({ status: 'ready' } & Flash) | { status: 'failed'; why: string };

let load: FlashLoad = { status: 'loading' };
let played = 0;

onAudio((ctx) => void loadFlash(ctx));

export function newtypeFlash(): void {
  const ctx = audioContext();
  if (ctx?.state !== 'running' || load.status !== 'ready') return;
  playFlash(ctx, ctx.destination, load, ctx.currentTime);
  played++;
}

export function playFlash(ctx: BaseAudioContext, out: AudioNode, { buffer, gain }: Flash, when: number): void {
  const source = ctx.createBufferSource();
  const env = ctx.createGain();
  source.buffer = buffer;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + DECLICK_FADE_SEC);
  env.gain.setValueAtTime(gain, when + buffer.duration - DECLICK_FADE_SEC);
  env.gain.linearRampToValueAtTime(0, when + buffer.duration);
  source.connect(env).connect(out);
  source.onended = () => env.disconnect();
  source.start(when);
}

export async function decodeFlash(ctx: BaseAudioContext, url: string): Promise<Flash | string> {
  const buffer = await fetchAudio(ctx, url);
  if (typeof buffer === 'string') return buffer;
  const gain = gainToMatch(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)), buffer.sampleRate, FLASH_LOUD95);
  return gain === null ? 'silent' : { buffer, gain };
}

export function newtypeFlashState(): Record<string, unknown> {
  if (load.status !== 'ready') return { ...load, played };
  return { status: load.status, gain: load.gain, played };
}

async function loadFlash(ctx: AudioContext): Promise<void> {
  const got = await decodeFlash(ctx, FLASH_URL);
  if (typeof got !== 'string') {
    load = { status: 'ready', ...got };
    return;
  }
  load = { status: 'failed', why: got };
  console.warn(`newtypeFlash: could not load ${FLASH_URL} (${got}), so the TRANS-AM press plays without it`);
}
