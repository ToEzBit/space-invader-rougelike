import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import type { Controls } from './controls';
import { DEPTH, PLAYER_Y, PLAYFIELD } from './layout';
import type { World } from './world';

const HIT_INVULN_MS = 1300;

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Image;
  private readonly shield: Phaser.GameObjects.Arc;
  // Enemy bullets only count when they reach the cockpit, as in most shmups.
  readonly coreRadius = 5;
  readonly bodyRadius = 14;
  invulnMs = 0;
  shieldMs = 0;
  private flameMs = 0;

  constructor(private readonly world: World) {
    const scene = world.scene;
    this.sprite = scene.add.image(240, PLAYER_Y, 'player').setDepth(DEPTH.player);
    this.flame = scene.add.image(240, PLAYER_Y + 28, 'flame0').setDepth(DEPTH.player - 1);
    this.shield = scene.add
      .circle(240, PLAYER_Y, 26)
      .setStrokeStyle(2, COLORS.cyan, 0.9)
      .setFillStyle(COLORS.cyan, 0.12)
      .setDepth(DEPTH.player + 1)
      .setVisible(false);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  steer(input: Controls, dtSec: number): void {
    const dir = Number(input.right) - Number(input.left);
    const half = this.sprite.displayWidth / 2;
    this.sprite.x = Phaser.Math.Clamp(this.sprite.x + dir * this.world.stats.moveSpeed * dtSec, PLAYFIELD.left + half, PLAYFIELD.right - half);
    this.sprite.setRotation(dir * 0.08);
  }

  update(dtMs: number): void {
    if (!this.sprite.active) return;
    this.invulnMs = Math.max(0, this.invulnMs - dtMs);
    this.shieldMs = Math.max(0, this.shieldMs - dtMs);
    this.sprite.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 80) % 2 === 0 ? 0.35 : 1);
    this.flameMs += dtMs;
    this.flame
      .setTexture(Math.floor(this.flameMs / 60) % 2 ? 'flame1' : 'flame0')
      .setPosition(this.sprite.x, this.sprite.y + this.sprite.displayHeight / 2 + 4)
      .setScale(this.sprite.scale);
    this.shield.setPosition(this.sprite.x, this.sprite.y).setVisible(this.shieldMs > 0).setScale(this.sprite.scale);
  }

  vanish(): void {
    for (const part of [this.sprite, this.flame, this.shield]) part.setVisible(false).setActive(false);
  }

  onHit(): void {
    this.invulnMs = HIT_INVULN_MS;
    this.world.fx.explode(this.x, this.y);
  }

  breakShield(): void {
    this.shieldMs = 0;
    this.invulnMs = 400;
    this.world.fx.spark(this.x, this.y, 16);
    this.world.fx.float(this.x, this.y - 30, 'BLOCK', COLORS.cyan);
  }
}
