import Phaser from 'phaser';
import { COLORS, css } from '../art/palette';
import { label } from '../ui/text';
import { DEPTH } from './layout';

export const MONEY_ANCHOR = { x: 452, y: 16 };

// One-shot visual effects. None of these touch game state.
export class Fx {
  private readonly sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly debris: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    this.sparks = scene.add
      .particles(0, 0, 'spark', {
        emitting: false,
        lifespan: { min: 200, max: 420 },
        speed: { min: 60, max: 220 },
        scale: { start: 2, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [COLORS.white, COLORS.yellow, COLORS.cyan, COLORS.pink],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(DEPTH.fx);
    this.debris = scene.add
      .particles(0, 0, 'pixel', {
        emitting: false,
        lifespan: { min: 350, max: 700 },
        speed: { min: 40, max: 160 },
        scale: { start: 1.2, end: 0.2 },
        alpha: { start: 1, end: 0 },
        gravityY: 120,
        tint: [COLORS.orange, COLORS.yellow, COLORS.red, COLORS.white],
      })
      .setDepth(DEPTH.fx);
  }

  spark(x: number, y: number, count = 4): void {
    this.sparks.explode(count, x, y);
  }

  explode(x: number, y: number, size: 'small' | 'big' = 'small'): void {
    const big = size === 'big';
    this.debris.explode(big ? 40 : 12, x, y);
    this.sparks.explode(big ? 30 : 8, x, y);
    const ring = this.scene.add.circle(x, y, big ? 14 : 6, COLORS.white, 0.9).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({ targets: ring, scale: big ? 5 : 3, alpha: 0, duration: big ? 500 : 240, onComplete: () => ring.destroy() });
  }

  coin(x: number, y: number): void {
    const coin = this.scene.add.image(x, y, 'coin0').setDepth(DEPTH.fx);
    this.scene.tweens.add({
      targets: coin,
      y: y - 18,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () =>
        this.scene.tweens.add({
          targets: coin,
          x: MONEY_ANCHOR.x,
          y: MONEY_ANCHOR.y,
          scale: 0.6,
          duration: 480,
          ease: 'Cubic.easeIn',
          onComplete: () => coin.destroy(),
        }),
    });
    this.scene.time.addEvent({ delay: 90, repeat: 6, callback: () => coin.active && coin.setTexture(coin.texture.key === 'coin0' ? 'coin1' : 'coin0') });
  }

  float(x: number, y: number, text: string, color: number = COLORS.yellow): void {
    const t = label(this.scene, x, y, text, { size: 12, bold: true, color: css(color), align: 'center', stroke: '#0d0b26' }).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  shake(intensity = 0.006, ms = 140): void {
    this.scene.cameras.main.shake(ms, intensity);
  }

  flash(ms = 120, r = 255, g = 255, b = 255): void {
    this.scene.cameras.main.flash(ms, r, g, b);
  }
}
