import type { StageDef } from '../core/stages';
import { Formation } from './formation';
import type { World } from './world';

// What the player is fighting this stage. The stage ends when it is cleared or breached.
export interface Encounter {
  update(dtMs: number): void;
  readonly cleared: boolean;
  readonly breached: boolean;
}

export function createEncounter(world: World, def: StageDef): Encounter {
  switch (def.kind) {
    case 'wave':
      return new Formation(world, def);
    case 'boss':
      throw new Error('Boss stages are not implemented yet');
  }
}
