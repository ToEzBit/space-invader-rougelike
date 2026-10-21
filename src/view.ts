import Phaser from 'phaser';

// Scenes work in 480x640 world units. The canvas renders at RENDER_SCALE so Thai text and
// thin lines stay sharp while pixel art is upscaled with nearest filtering.
export const VIEW = { w: 480, h: 640 } as const;
export const RENDER_SCALE = 2;

export function fitCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE).centerOn(VIEW.w / 2, VIEW.h / 2);
}
