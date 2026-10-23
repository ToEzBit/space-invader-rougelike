import { describe, expect, it } from 'vitest';
import { cueFor, sourceFor } from './director';
import { attemptDue, attemptFailed, MAX_ATTEMPTS, type FileLoad, type ReadyFile } from './fileLoad';

const SONG: ReadyFile = { status: 'ready', url: '/music/void-empress.ogg', buffer: {} as AudioBuffer, gain: 0.5 };
const EMPRESS = cueFor({ stage: 10, boss: { id: 'voidEmpress', form: 0, stanceKind: 'fighting' }, phase: 'playing' });
const TICK_MS = 25;

// Runs the music tick's load loop on a fake clock: each attempt takes loadMs, then fails or succeeds as `succeeds`
// says. Returns when each attempt started and what the Empress's cue resolved to on every tick.
function run(succeeds: (attempt: number) => boolean, loadMs: number, untilMs: number) {
  let load: FileLoad = { status: 'idle' };
  let settlesAt = Infinity;
  const starts: number[] = [];
  const sources: { t: number; source: string }[] = [];
  for (let t = 0; t <= untilMs; t += TICK_MS) {
    if (load.status === 'loading' && t >= settlesAt) load = succeeds(load.attempt) ? SONG : attemptFailed(load, ['/music/void-empress.ogg (HTTP 404)'], t);
    const attempt = attemptDue(load, t);
    if (attempt) {
      load = attempt;
      settlesAt = t + loadMs;
      starts.push(t);
    }
    const source = sourceFor(EMPRESS, () => load);
    sources.push({ t, source: source.kind === 'score' || source.kind === 'file' ? source.id : source.kind });
  }
  return { starts, sources, load, at: (t: number) => sources.find((s) => s.t >= t)!.source };
}

describe("loading the Empress's song", () => {
  it('starts on the first tick and holds the previous track until the first attempt settles', () => {
    const { starts, at } = run(() => true, 3000, 5000);
    expect(starts).toEqual([0]);
    expect(at(0)).toBe('holdWhileLoading');
    expect(at(2975)).toBe('holdWhileLoading');
    expect(at(3000)).toBe('empress');
  });

  it('plays the fallback once an attempt fails, keeps it through the retries, and switches to the song when one loads', () => {
    const { starts, at } = run((attempt) => attempt === 3, 500, 20_000);
    expect(starts).toEqual([0, 2500, 7000]);
    expect(at(400)).toBe('holdWhileLoading');
    expect(at(500)).toBe('boss1');
    expect(at(2600)).toBe('boss1');
    expect(at(7400)).toBe('boss1');
    expect(at(7500)).toBe('empress');
    expect(at(20_000)).toBe('empress');
  });

  it('waits 2, 4, 8, 16 and 32 s after each failure, then 60 s, and stops after the last attempt', () => {
    const { starts, load, sources } = run(() => false, 100, 30 * 60_000);
    const waits = starts.slice(1).map((t, i) => t - starts[i]! - 100);
    expect(waits).toEqual([2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000, 60_000]);
    expect(starts).toHaveLength(MAX_ATTEMPTS);
    expect(load).toMatchObject({ status: 'failed', attempt: MAX_ATTEMPTS, retryAt: null });
    expect(sources.filter((s) => s.t >= 100).every((s) => s.source === 'boss1')).toBe(true);
  });

  it('never starts an attempt while one is in flight or once the song is ready', () => {
    expect(attemptDue({ status: 'loading', attempt: 1 }, 1e9)).toBeNull();
    expect(attemptDue(SONG, 1e9)).toBeNull();
    const { starts } = run(() => true, 60_000, 120_000);
    expect(starts).toEqual([0]);
  });
});
