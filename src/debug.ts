import Phaser from 'phaser';
import type { OwnedItems } from './core/items';
import { deriveStats, type OwnedPerks } from './core/perks';
import { newRun, type RunState } from './core/run';
import { sceneFor } from './scenes/flow';

// Dev-only handles that let verification jump straight to any stage, shop, or ending.
export type DebugHooks = {
  run: () => RunState | null;
  info?: () => Record<string, unknown>;
  kill?: () => void;
  hurt?: () => void;
  hit?: () => void;
  bossHp?: (ratio: number) => void;
};

type DebugApi = {
  start(stage: number, perks?: OwnedPerks, money?: number, items?: OwnedItems): void;
  state(): Record<string, unknown>;
  kill(): void;
  // Forced past i-frames and shields.
  hurt(): void;
  // One hit through the normal damage path, so i-frames and shields still apply.
  hit(): void;
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
  const view = () => {
    const camera = hooks?.scene.cameras.main;
    const { x, y, width, height } = camera?.worldView ?? {};
    return { canvas: { width: game.scale.width, height: game.scale.height }, zoom: camera?.zoom, world: { x, y, width, height } };
  };
  window.__game = {
    start(stage, perks = {}, money = 0, items = {}) {
      const base = newRun(Date.now());
      const run: RunState = { ...base, stage, perks, money, items, hp: deriveStats(perks).maxHp };
      for (const key of active()) game.scene.stop(key);
      game.scene.start(sceneFor(run), { run });
    },
    state: () => ({ scenes: active(), run: hooks?.hooks.run() ?? null, view: view(), ...hooks?.hooks.info?.() }),
    kill: () => hooks?.hooks.kill?.(),
    hurt: () => hooks?.hooks.hurt?.(),
    hit: () => hooks?.hooks.hit?.(),
    bossHp: (ratio) => hooks?.hooks.bossHp?.(ratio),
    pause: () => hooks?.scene.scene.pause(),
    resume: () => hooks?.scene.scene.resume(),
  };
}
