import Phaser from 'phaser';
import { sharpenLabels } from './ui/text';
import { VIEW } from './viewSize';

export { VIEW };

// The canvas fills the window in device pixels, and the camera zooms the world to the largest size
// that fits, so the area around it shows open space.

export type Viewport = { zoom: number; x: number; y: number; w: number; h: number };

export function viewport(scene: Phaser.Scene): Viewport {
  const { width, height } = scene.scale;
  const zoom = Math.min(width / VIEW.w, height / VIEW.h);
  const w = width / zoom;
  const h = height / zoom;
  return { zoom, x: (VIEW.w - w) / 2, y: (VIEW.h - h) / 2, w, h };
}

export function onViewport(scene: Phaser.Scene, apply: (view: Viewport) => void): void {
  const refit = () => apply(viewport(scene));
  refit();
  scene.scale.on(Phaser.Scale.Events.RESIZE, refit);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, refit));
}

export function fitCamera(scene: Phaser.Scene): void {
  onViewport(scene, ({ zoom }) => {
    scene.cameras.main.setSize(scene.scale.width, scene.scale.height).setZoom(zoom).centerOn(VIEW.w / 2, VIEW.h / 2);
    sharpenLabels(scene.children.list, zoom);
  });
}
