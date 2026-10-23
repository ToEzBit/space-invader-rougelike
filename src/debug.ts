import Phaser from 'phaser';
import type { OwnedItems } from './core/items';
import type { BossPattern } from './core/stages';
import { deriveStats, type OwnedPerks } from './core/perks';
import { musicState } from './audio/music';
import { newtypeFlashState } from './audio/newtypeFlash';
import { laserSoundState } from './audio/laserSound';
import { sfxState } from './audio/sfx';
import { transAmSoundState } from './audio/transAmSound';
import { voiceState } from './audio/voice';
import { newRun, type RunState } from './core/run';
import { INPUT_MODE } from './input';
import { sceneFor } from './scenes/flow';

// Dev-only handles that let verification jump straight to any stage, shop, or ending.
export type DebugHooks = {
  run: () => RunState | null;
  info?: () => Record<string, unknown>;
  kill?: () => void;
  hurt?: () => void;
  hit?: () => void;
  bossHp?: (ratio: number) => void;
  bossPattern?: (pattern: BossPattern | null) => void;
  god?: (on: boolean) => void;
  transAmGauge?: (value: number) => void;
  shots?: () => { id: number; kind: string; x: number; y: number }[];
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
  // The boss plays this pattern after a short gap, then holds her cycle until the next call; null just holds it.
  bossPattern(pattern: BossPattern | null): void;
  // For measurement only: the ship keeps its i-frames and shields but never loses HP. Resets with each stage.
  god(on: boolean): void;
  // Sets the TRANS-AM gauge and puts it back to charging.
  transAmGauge(value: number): void;
  // Live enemy bullets with ids that stay put for the stage, so a journey can time one across frames.
  shots(): { id: number; kind: string; x: number; y: number }[];
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
    state: () => ({ scenes: active(), input: INPUT_MODE, run: hooks?.hooks.run() ?? null, view: view(), music: musicState(), voice: voiceState(), newtypeFlash: newtypeFlashState(), transAmSound: transAmSoundState(), sfx: { played: sfxState(), beam: laserSoundState() }, ...hooks?.hooks.info?.() }),
    kill: () => hooks?.hooks.kill?.(),
    hurt: () => hooks?.hooks.hurt?.(),
    hit: () => hooks?.hooks.hit?.(),
    bossHp: (ratio) => hooks?.hooks.bossHp?.(ratio),
    bossPattern: (pattern) => hooks?.hooks.bossPattern?.(pattern),
    god: (on) => hooks?.hooks.god?.(on),
    transAmGauge: (value) => hooks?.hooks.transAmGauge?.(value),
    shots: () => hooks?.hooks.shots?.() ?? [],
    // Systems applies these at once, where ScenePlugin would queue them for the next step and drop a key pressed
    // in between. Braces keep Systems out of the return value, which Playwright would serialize whole.
    pause: () => {
      hooks?.scene.sys.pause();
    },
    resume: () => {
      hooks?.scene.sys.resume();
    },
  };
}
