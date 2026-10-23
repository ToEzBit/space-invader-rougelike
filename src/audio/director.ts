import type { RunPhase } from '../core/run';
import type { BossId, FormIndex } from '../core/stages';
import type { BossFight } from '../game/boss';
import type { FileLoad, ReadyFile } from './fileLoad';
import type { FileId, JingleId, ScoreId } from './tracks';

export type Cue = ScoreId | { file: FileId; fallback: ScoreId };
export type BossView = Pick<BossFight, 'id' | 'form' | 'stanceKind'>;
// phase is where the run is heading: 'playing' while the stage is fought, then the phase its ending leads to.
export type StageMoment = { stage: number; boss: BossView | null; phase: RunPhase['kind'] };
export type Source = { kind: 'score'; id: ScoreId } | { kind: 'file'; id: FileId; file: ReadyFile } | { kind: 'silence' } | { kind: 'holdWhileLoading' };

// One track per act of the journey to the Void Empress. Boss stages fight to their boss instead.
export const WAVE_MUSIC: Readonly<Partial<Record<number, ScoreId>>> = { 1: 'act1', 2: 'act1', 3: 'act2', 4: 'act2', 6: 'act3', 7: 'act3', 8: 'act4', 9: 'act4' };

const ENDING_JINGLE: Record<RunPhase['kind'], JingleId | null> = { playing: null, shop: 'clear', victory: 'victory', defeat: 'defeat' };

const BOSS_MUSIC: Record<BossId, Record<FormIndex, Cue>> = {
  crimsonSeraph: ['boss1', 'boss2'],
  voidEmpress: [
    { file: 'empress', fallback: 'boss1' },
    { file: 'empress', fallback: 'boss2' },
  ],
};

// An ending stage asks for its jingle, which ducks whatever was playing. On a boss stage the ending comes in the
// frame she dies, so the jingle replaces the silence her death asks for.
export function cueFor({ stage, boss, phase }: StageMoment): Cue | null {
  const jingle = ENDING_JINGLE[phase];
  if (jingle) return jingle;
  if (!boss) return WAVE_MUSIC[stage] ?? 'normal';
  if (boss.stanceKind === 'dead') return null;
  return BOSS_MUSIC[boss.id][secondFormStarted(boss) ? 1 : 0];
}

export function sourceFor(cue: Cue | null, load: (id: FileId) => FileLoad): Source {
  if (cue === null) return { kind: 'silence' };
  if (typeof cue === 'string') return { kind: 'score', id: cue };
  const file = load(cue.file);
  switch (file.status) {
    case 'ready':
      return { kind: 'file', id: cue.file, file };
    case 'failed':
      return { kind: 'score', id: cue.fallback };
    // A retry follows a failed attempt, so the fallback keeps standing in until the song is ready.
    case 'loading':
      return file.attempt === 1 ? { kind: 'holdWhileLoading' } : { kind: 'score', id: cue.fallback };
    case 'idle':
      return { kind: 'holdWhileLoading' };
  }
}

function secondFormStarted(boss: BossView): boolean {
  return boss.form === 1 || boss.stanceKind === 'transforming';
}
