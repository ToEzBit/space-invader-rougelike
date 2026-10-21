import Phaser from 'phaser';
import { deriveStats, type OwnedPerks } from './core/perks';
import { newRun, type RunState } from './core/run';
import { sceneFor } from './scenes/flow';

// Dev-only handles that let verification jump straight to any stage, shop, or ending.
export type DebugHooks = {
  run: () => RunState | null;
  info?: () => Record<string, unknown>;
  kill?: () => void;
  hurt?: () => void;
  bossHp?: (ratio: number) => void;
};

type DebugApi = {
  start(stage: number, perks?: OwnedPerks, money?: number): void;
  state(): Record<string, unknown>;
  kill(): void;
  hurt(): void;
  bossHp(ratio: number): void;
  pause(): void;
  resume(): void;
};

declare global {
  interface Window {
    __game?: DebugApi;
  }
}

let hooks: { scene: Phaser.Scene; hooks: DebugHooks } | null = null;

export function setDebugHooks(scene: Phaser.Scene, next: DebugHooks): void {
  if (import.meta.env.DEV) hooks = { scene, hooks: next };
}

export function installDebug(game: Phaser.Game): void {
  if (!import.meta.env.DEV) return;
  const active = () => game.scene.getScenes(true).map((s) => s.scene.key);
  window.__game = {
    start(stage, perks = {}, money = 0) {
      const base = newRun(Date.now());
      const run: RunState = { ...base, stage, perks, money, hp: deriveStats(perks).maxHp };
      for (const key of active()) game.scene.stop(key);
      game.scene.start(sceneFor(run), { run });
    },
    state: () => ({ scenes: active(), run: hooks?.hooks.run() ?? null, ...hooks?.hooks.info?.() }),
    kill: () => hooks?.hooks.kill?.(),
    hurt: () => hooks?.hooks.hurt?.(),
    bossHp: (ratio) => hooks?.hooks.bossHp?.(ratio),
    pause: () => hooks?.scene.scene.pause(),
    resume: () => hooks?.scene.scene.resume(),
  };
}
