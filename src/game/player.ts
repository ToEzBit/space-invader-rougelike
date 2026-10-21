import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import type { Controls } from './controls';
import { stepWithin } from './geometry';
import { PLAYER_RADIUS } from './hitbox';
import { DEPTH, PLAYER_Y, PLAYER_ZONE, PLAYFIELD } from './layout';
import type { World } from './world';

const HIT_INVULN_MS = 1300;

export class Player {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Image;
  private readonly shield: Phaser.GameObjects.Arc;
  readonly coreRadius = PLAYER_RADIUS.core;
  readonly bodyRadius = PLAYER_RADIUS.body;
  invulnMs = 0;
  shieldMs = 0;
  // What shieldMs started from, so the HUD can sweep the time left.
  shieldFullMs = 0;
  msSinceHit = 0;
  private flameMs = 0;
  // 1 while flying forward, -1 while backing off; stretches the exhaust.
  private thrust = 0;

  constructor(private readonly world: World) {
    const scene = world.scene;
    this.sprite = scene.add.image(240, PLAYER_Y, 'player').setDepth(DEPTH.player);
    this.flame = scene.add.image(240, PLAYER_Y + this.sprite.displayHeight / 2, 'flame0').setOrigin(0.5, 0).setDepth(DEPTH.player - 1);
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
    const dir = { x: Number(input.right) - Number(input.left), y: Number(input.down) - Number(input.up) };
    const half = this.sprite.displayWidth / 2;
    const box = { left: PLAYFIELD.left + half, right: PLAYFIELD.right - half, ...PLAYER_ZONE };
    const to = stepWithin(this.sprite, dir, this.world.stats.moveSpeed * dtSec, box);
    this.sprite.setPosition(to.x, to.y).setRotation(dir.x * 0.08);
    this.thrust = -dir.y;
  }

  update(dtMs: number): void {
    if (!this.sprite.active) return;
    this.msSinceHit += dtMs;
    this.invulnMs = Math.max(0, this.invulnMs - dtMs);
    this.shieldMs = Math.max(0, this.shieldMs - dtMs);
    this.sprite.setAlpha(this.invulnMs > 0 && Math.floor(this.invulnMs / 80) % 2 === 0 ? 0.35 : 1);
    this.flameMs += dtMs;
    this.flame
      .setTexture(Math.floor(this.flameMs / 60) % 2 ? 'flame1' : 'flame0')
      .setPosition(this.sprite.x, this.sprite.y + this.sprite.displayHeight / 2)
      .setScale(this.sprite.scale, this.sprite.scale * (1 + this.thrust * 0.4));
    this.shield.setPosition(this.sprite.x, this.sprite.y).setVisible(this.shieldMs > 0).setScale(this.sprite.scale);
  }

  vanish(): void {
    for (const part of [this.sprite, this.flame, this.shield]) part.setVisible(false).setActive(false);
  }

  onHit(): void {
    this.invulnMs = HIT_INVULN_MS;
    this.msSinceHit = 0;
    this.world.fx.explode(this.x, this.y);
  }

  shieldFor(ms: number): void {
    this.shieldMs = ms;
    this.shieldFullMs = ms;
  }

  breakShield(): void {
    this.shieldMs = 0;
    this.invulnMs = 400;
    this.world.fx.spark(this.x, this.y, 16);
    this.world.fx.float(this.x, this.y - 30, 'BLOCK', COLORS.cyan);
  }
}
