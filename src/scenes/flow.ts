import Phaser from 'phaser';
import type { RunPhase, RunState } from '../core/run';

export type SceneKey = 'Boot' | 'Title' | 'Stage' | 'Shop' | 'End';

export type RunData = { run: RunState };

const SCENE_FOR_PHASE: Record<RunPhase['kind'], SceneKey> = {
  playing: 'Stage',
  shop: 'Shop',
  victory: 'End',
  defeat: 'End',
};

export function sceneFor(run: RunState): SceneKey {
  return SCENE_FOR_PHASE[run.phase.kind];
}

// Every scene change in a run goes through here, so the phase alone decides where the player lands.
export function goTo(scene: Phaser.Scene, run: RunState, fadeMs = 220): void {
  const camera = scene.cameras.main;
  const start = () => {
    scene.scene.start(sceneFor(run), { run } satisfies RunData);
  };
  if (fadeMs <= 0) return start();
  camera.fadeOut(fadeMs, 7, 6, 26);
  camera.once('camerafadeoutcomplete', start);
}
