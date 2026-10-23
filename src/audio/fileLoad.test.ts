import { describe, expect, it } from 'vitest';
import { cueFor, openingCue, sourceFor, type Cue } from './director';
import { attemptDue, attemptFailed, decodeDue, MAX_ATTEMPTS, rearmed, type Attempt, type FileLoad, type ReadyFile } from './fileLoad';

const URL = '/music/void-empress.ogg';
const SONG: ReadyFile = { status: 'ready', url: URL, buffer: {} as AudioBuffer, gain: 0.5 };
const EMPRESS = cueFor({ stage: 10, boss: { id: 'voidEmpress', form: 0, stanceKind: 'fighting' }, phase: 'playing' });
const EMPRESS_2ND_FORM = cueFor({ stage: 10, boss: { id: 'voidEmpress', form: 1, stanceKind: 'fighting' }, phase: 'playing' });
const TICK_MS = 25;

// From atMs on, the scene wants `cue`, and names `next` as what follows it.
type Scene = { atMs: number; cue: Cue | null; next?: Cue | null };
const TITLE: Scene = { atMs: 0, cue: 'normal' };
const STAGE_10: Scene = { atMs: 0, cue: EMPRESS };

type Sim = {
  scenes: readonly Scene[];
  fetches?: (attempt: number) => boolean;
  decodes?: (attempt: number) => boolean;
  fetchMs?: number;
  decodeMs?: number;
  untilMs: number;
};

// Runs the music tick's load loop on a fake clock: a fetch takes fetchMs and a decode decodeMs, and each succeeds or
// fails per attempt. A scene that starts asking for the song rearms it, as want() does. Returns when each fetch and
// decode started and what the scene's cue resolved to on every tick.
function run({ scenes, fetches = () => true, decodes = () => true, fetchMs = 100, decodeMs = 100, untilMs }: Sim) {
  let load: FileLoad = { status: 'idle' };
  let settlesAt = Infinity;
  const fetched: number[] = [];
  const decoded: number[] = [];
  const ticks: { t: number; source: string; status: FileLoad['status'] }[] = [];
  const near = (cue: Cue | null | undefined) => cue !== null && typeof cue === 'object' && cue.file === 'empress';
  let asked = false;
  for (let t = 0; t <= untilMs; t += TICK_MS) {
    const scene = scenes.filter((s) => s.atMs <= t).at(-1)!;
    if (near(scene.cue) && !asked) load = rearmed(load, t);
    asked = near(scene.cue);
    if (t >= settlesAt && load.status === 'fetching') {
      const { attempt, firstOfRound, tried }: Attempt = load;
      load = fetches(attempt) ? { status: 'fetched', url: URL, bytes: new ArrayBuffer(8), attempt, firstOfRound, tried } : attemptFailed(load, [`${URL} (HTTP 404)`], t);
    }
    if (t >= settlesAt && load.status === 'decoding') load = decodes(load.attempt) ? SONG : attemptFailed(load, [`${URL} (EncodingError)`], t);
    const attempt = attemptDue(load, t);
    if (attempt) {
      load = { status: 'fetching', url: URL, ...attempt };
      settlesAt = t + fetchMs;
      fetched.push(t);
    }
    const bytes = decodeDue(load, near(scene.cue) || near(scene.next));
    if (bytes) {
      load = { status: 'decoding', url: URL, attempt: bytes.attempt, firstOfRound: bytes.firstOfRound, tried: bytes.tried };
      settlesAt = t + decodeMs;
      decoded.push(t);
    }
    const source = sourceFor(scene.cue, () => load);
    ticks.push({ t, source: source.kind === 'score' || source.kind === 'file' ? source.id : source.kind, status: load.status });
  }
  const tick = (t: number) => ticks.find((s) => s.t >= t)!;
  return { fetched, decoded, ticks, load, at: (t: number) => tick(t).source, status: (t: number) => tick(t).status };
}

describe("loading the Empress's song", () => {
  it('fetches on the first tick, decodes in the shop after stage 9, and plays the song from her entrance', () => {
    const scenes = [TITLE, { atMs: 5000, cue: 'act4' }, { atMs: 60_000, cue: 'shop', next: openingCue(10) }, { atMs: 90_000, cue: EMPRESS }] as const;
    const { fetched, decoded, at, status } = run({ scenes, fetchMs: 3000, decodeMs: 800, untilMs: 100_000 });
    expect(fetched).toEqual([0]);
    expect(status(3000)).toBe('fetched');
    expect(status(59_975)).toBe('fetched');
    expect(decoded).toEqual([60_000]);
    expect(status(60_800)).toBe('ready');
    expect(at(90_000)).toBe('empress');
  });

  it('decodes when stage 10 asks for the song if no shop came first, holding the previous track meanwhile', () => {
    const { decoded, at } = run({ scenes: [TITLE, { atMs: 5000, cue: EMPRESS }], fetchMs: 1000, decodeMs: 800, untilMs: 10_000 });
    expect(decoded).toEqual([5000]);
    expect(at(5000)).toBe('holdWhileLoading');
    expect(at(5775)).toBe('holdWhileLoading');
    expect(at(5800)).toBe('empress');
  });

  it('holds the previous track until the first attempt settles when stage 10 is already up', () => {
    const { fetched, at } = run({ scenes: [STAGE_10], fetchMs: 2000, decodeMs: 1000, untilMs: 5000 });
    expect(fetched).toEqual([0]);
    expect(at(0)).toBe('holdWhileLoading');
    expect(at(2975)).toBe('holdWhileLoading');
    expect(at(3000)).toBe('empress');
  });

  it('counts a failed decode as a failed attempt: the fallback plays until a retry fetches and decodes the song', () => {
    const { fetched, decoded, at } = run({ scenes: [TITLE, { atMs: 5000, cue: EMPRESS }], decodes: (attempt) => attempt === 2, untilMs: 10_000 });
    expect(fetched).toEqual([0, 7100]);
    expect(decoded).toEqual([5000, 7200]);
    expect(at(5100)).toBe('boss1');
    expect(at(7275)).toBe('boss1');
    expect(at(7300)).toBe('empress');
  });

  it('plays the fallback once an attempt fails, keeps it through the retries, and switches to the song when one loads', () => {
    const { fetched, at } = run({ scenes: [STAGE_10], fetches: (attempt) => attempt === 3, fetchMs: 500, decodeMs: 0, untilMs: 20_000 });
    expect(fetched).toEqual([0, 2500, 7000]);
    expect(at(400)).toBe('holdWhileLoading');
    expect(at(500)).toBe('boss1');
    expect(at(2600)).toBe('boss1');
    expect(at(7500)).toBe('boss1');
    expect(at(7525)).toBe('empress');
    expect(at(20_000)).toBe('empress');
  });

  it('waits 2, 4, 8, 16 and 32 s after each failure, then 60 s, and stops after the last attempt', () => {
    const { fetched, load, ticks } = run({ scenes: [STAGE_10], fetches: () => false, untilMs: 30 * 60_000 });
    const waits = fetched.slice(1).map((t, i) => t - fetched[i]! - 100);
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000, 60_000]);
    expect(fetched).toHaveLength(MAX_ATTEMPTS);
    expect(load).toMatchObject({ status: 'failed', attempt: MAX_ATTEMPTS, retryAt: null });
    expect(ticks.filter((s) => s.t >= 100).every((s) => s.source === 'boss1')).toBe(true);
  });

  it('starts a fresh round when stage 10 asks for a song that has given up, on the fallback, and plays the song once it loads', () => {
    const scenes = [TITLE, { atMs: 400_000, cue: EMPRESS }];
    const { fetched, at } = run({ scenes, fetches: (attempt) => attempt === MAX_ATTEMPTS + 2, untilMs: 410_000 });
    expect(fetched.slice(MAX_ATTEMPTS)).toEqual([400_000, 402_100]);
    expect(at(399_975)).toBe('normal');
    expect(at(400_000)).toBe('boss1');
    expect(at(402_275)).toBe('boss1');
    expect(at(402_300)).toBe('empress');
  });

  it('rearms once each time the song starts being asked for, not while it stays asked for or across her transformation', () => {
    const scenes: Scene[] = [TITLE, { atMs: 400_000, cue: EMPRESS }, { atMs: 1_000_000, cue: EMPRESS_2ND_FORM }, { atMs: 1_100_000, cue: 'victory' }, { atMs: 1_200_000, cue: EMPRESS }];
    const { fetched, load, ticks } = run({ scenes, fetches: () => false, untilMs: 1_200_050 });
    expect(fetched).toHaveLength(2 * MAX_ATTEMPTS + 1);
    expect(fetched[MAX_ATTEMPTS]).toBe(400_000);
    expect(fetched.filter((t) => t > 800_000 && t < 1_200_000)).toEqual([]);
    expect(fetched.at(-1)).toBe(1_200_000);
    expect(load).toMatchObject({ status: 'fetching', attempt: 2 * MAX_ATTEMPTS + 1, firstOfRound: 2 * MAX_ATTEMPTS + 1 });
    expect(ticks.filter((s) => s.t >= 400_000 && s.t < 1_000_000).every((s) => s.source === 'boss1')).toBe(true);
  });

  it('never rearms a load that still has retries left, is in flight or is ready', () => {
    const failed = attemptFailed({ attempt: 3, firstOfRound: 1, tried: [] }, [], 0);
    expect(rearmed(failed, 5)).toBe(failed);
    expect(rearmed(SONG, 5)).toBe(SONG);
    const fetching: FileLoad = { status: 'fetching', url: URL, attempt: 1, firstOfRound: 1, tried: [] };
    expect(rearmed(fetching, 5)).toBe(fetching);
  });

  it('never starts an attempt or a decode while one is in flight, and never again once the song is ready', () => {
    expect(attemptDue({ status: 'fetching', url: URL, attempt: 1, firstOfRound: 1, tried: [] }, 1e9)).toBeNull();
    expect(attemptDue({ status: 'decoding', url: URL, attempt: 1, firstOfRound: 1, tried: [] }, 1e9)).toBeNull();
    expect(decodeDue({ status: 'decoding', url: URL, attempt: 1, firstOfRound: 1, tried: [] }, true)).toBeNull();
    expect(attemptDue(SONG, 1e9)).toBeNull();
    const { fetched, decoded } = run({ scenes: [STAGE_10], fetchMs: 60_000, decodeMs: 60_000, untilMs: 240_000 });
    expect(fetched).toEqual([0]);
    expect(decoded).toEqual([60_000]);
  });
});
