import type { StageDef } from '../core/stages';
import { BossFight } from './boss';
import { Formation } from './formation';
import type { World } from './world';

// What the player is fighting this stage. The stage ends when it is cleared or breached.
export interface Encounter {
  update(dtMs: number): void;
  readonly cleared: boolean;
  readonly breached: boolean;
  readonly boss: BossFight | null;
}

export function createEncounter(world: World, def: StageDef): Encounter {
  switch (def.kind) {
    case 'wave':
      return new Formation(world, def);
    case 'boss':
      return new BossFight(world, def);
  }
}
