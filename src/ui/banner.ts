import Phaser from 'phaser';
import { DEPTH } from '../game/layout';
import { VIEW } from '../view';
import { label } from './text';

export function banner(scene: Phaser.Scene, title: string, subtitle: string, color: string, holdMs = 1100): void {
  const box = scene.add.container(VIEW.w / 2, VIEW.h / 2 - 40).setDepth(DEPTH.banner);
  const strip = scene.add.rectangle(0, 18, VIEW.w, 84, 0x0d0b26, 0.78);
  box.add([
    strip,
    label(scene, 0, -12, title, { size: 34, bold: true, color, align: 'center', stroke: '#0d0b26' }),
    label(scene, 0, 34, subtitle, { size: 15, color: '#ffffff', align: 'center' }),
  ]);
  box.setScale(1.6, 0).setAlpha(0);
  scene.tweens.add({ targets: box, scaleX: 1, scaleY: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: box, alpha: 0, delay: 220 + holdMs, duration: 260, onComplete: () => box.destroy() });
}
