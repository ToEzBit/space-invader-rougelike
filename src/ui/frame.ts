import Phaser from 'phaser';
import { UI_FRAMES, type FrameKey } from '../art/ui';

// Centered like any image. Keep x, y, w and h whole so the frame's pixels land on the world grid.
export function frame(scene: Phaser.Scene, key: FrameKey, x: number, y: number, w: number, h: number): Phaser.GameObjects.NineSlice {
  const { left, right, top, bottom } = UI_FRAMES[key].insets;
  return scene.add.nineslice(x, y, key, undefined, w, h, left, right, top, bottom);
}
