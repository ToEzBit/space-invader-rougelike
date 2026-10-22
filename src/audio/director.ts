import type { BossId, FormIndex } from '../core/stages';
import type { BossFight } from '../game/boss';
import type { FileId, ScoreId } from './tracks';

export type Cue = ScoreId | { file: FileId; fallback: ScoreId };
export type BossView = Pick<BossFight, 'id' | 'form' | 'stanceKind'>;
export type ReadyFile = { status: 'ready'; url: string; buffer: AudioBuffer; gain: number };
export type FileLoad = { status: 'idle' | 'loading' } | ReadyFile | { status: 'failed'; tried: readonly string[] };
export type Source = { kind: 'score'; id: ScoreId } | { kind: 'file'; id: FileId; file: ReadyFile } | { kind: 'silence' } | { kind: 'holdWhileLoading' };

const BOSS_MUSIC: Record<BossId, Record<FormIndex, Cue>> = {
  crimsonSeraph: ['boss1', 'boss2'],
  voidEmpress: [
    { file: 'empress', fallback: 'boss1' },
    { file: 'empress', fallback: 'boss2' },
  ],
};

export function cueFor(boss: BossView | null): Cue | null {
  if (!boss) return 'normal';
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
    case 'idle':
    case 'loading':
      return { kind: 'holdWhileLoading' };
  }
}

function secondFormStarted(boss: BossView): boolean {
  return boss.form === 1 || boss.stanceKind === 'transforming';
}
