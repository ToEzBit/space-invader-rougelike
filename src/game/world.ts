import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { deriveStats } from '../core/perks';
import { heal, takeHit, type RunState } from '../core/run';
import type { ShipStats } from '../core/stats';
import type { SpriteKey } from '../art/sprites';
import { Bullets } from './bullets';
import { Dash } from './dash';
import { Fx } from './fx';
import { circlesOverlap } from './geometry';
import { Gun } from './gun';
import { Laser } from './laser';
import { DEPTH } from './layout';
import type { Controls } from './controls';
import { Player } from './player';

export type DamageSource = 'bullet' | 'missile' | 'laser' | 'burn' | 'orbital' | 'dash' | 'shock' | 'collision';

export type Foe = {
  sprite: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  coin: number;
  radius: number;
  size: 'small' | 'big';
  burn: { dps: number; msLeft: number } | null;
  flashMs: number;
  dead: boolean;
};

const FLASH_MS = 70;
const BURN_TINT = 0xffa070;
// Continuous damage would keep a foe flashed solid white, so only discrete hits flash.
const FLASHES: Record<DamageSource, boolean> = {
  bullet: true,
  missile: true,
  laser: false,
  burn: false,
  orbital: true,
  dash: true,
  shock: true,
  collision: true,
};
const BURN_MS = 2000;

// The live simulation of one stage: the ship's systems, every foe, and both bullet pools.
// The run is replaced only through src/core/run.ts transitions.
export class World {
  run: RunState;
  readonly stats: ShipStats;
  readonly fx: Fx;
  readonly foes: Foe[] = [];
  readonly playerShots: Bullets;
  readonly enemyShots: Bullets;
  readonly player: Player;
  readonly gun: Gun;
  readonly laser: Laser;
  readonly dash: Dash;
  // Coins earned this stage; paid out by clearStage.
  coins = 0;
  // Source-specific perks hook kills here (laser refunds, dash lifesteal).
  readonly onKill: Partial<Record<DamageSource, (foe: Foe) => void>> = {};

  constructor(
    readonly scene: Phaser.Scene,
    run: RunState,
  ) {
    this.run = run;
    this.stats = deriveStats(run.perks);
    this.fx = new Fx(scene);
    this.playerShots = new Bullets(scene, DEPTH.playerShot);
    this.enemyShots = new Bullets(scene, DEPTH.enemyShot);
    this.player = new Player(this);
    this.gun = new Gun(this);
    this.laser = new Laser(this);
    this.dash = new Dash(this);
  }

  addFoe(texture: SpriteKey, x: number, y: number, hp: number, coin: number, size: Foe['size'] = 'small'): Foe {
    const sprite = this.scene.add.image(x, y, texture).setDepth(DEPTH.foe);
    const foe: Foe = { sprite, hp, maxHp: hp, coin, radius: Math.min(sprite.width, sprite.height) * 0.45, size, burn: null, flashMs: 0, dead: false };
    this.foes.push(foe);
    return foe;
  }

  // Returns true when this hit killed the foe.
  damage(foe: Foe, amount: number, source: DamageSource): boolean {
    if (foe.dead || amount <= 0) return false;
    foe.hp -= amount;
    if (FLASHES[source] && foe.flashMs <= 0) {
      foe.flashMs = FLASH_MS;
      foe.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    }
    if (foe.hp > 0) return false;
    foe.dead = true;
    this.coins += foe.coin;
    this.fx.explode(foe.sprite.x, foe.sprite.y, foe.size);
    sfx(foe.size === 'big' ? 'boom' : 'pop');
    if (foe.coin > 0) this.fx.coin(foe.sprite.x, foe.sprite.y);
    if (foe.size === 'big') this.fx.shake(0.012, 400);
    this.onKill[source]?.(foe);
    return true;
  }

  ignite(foe: Foe, dps: number): void {
    if (dps > 0) foe.burn = { dps, msLeft: BURN_MS };
  }

  hurtPlayer(force = false): void {
    const p = this.player;
    if (this.run.phase.kind !== 'playing') return;
    if (!force && (p.invulnMs > 0 || this.dash.active)) return;
    if (!force && p.shieldMs > 0) return p.breakShield();
    this.run = takeHit(this.run, 1);
    p.onHit();
    sfx('hurt');
    this.fx.shake(0.01, 200);
    this.fx.flash(90, 255, 60, 90);
  }

  healPlayer(amount: number): void {
    const before = this.run.hp;
    this.run = heal(this.run, amount);
    if (this.run.hp > before) this.fx.float(this.player.x, this.player.y - 30, '+1 HP', 0x5dff9b);
  }

  update(dtMs: number, input: Controls): void {
    const dt = dtMs / 1000;
    if (!this.dash.active) this.player.steer(input, dt);
    this.player.update(dtMs);
    this.gun.update(dtMs, input.fire);
    this.laser.update(dtMs, input.fire);
    this.dash.update(dtMs, input.dash);
    this.playerShots.update(dt, this.foes);
    this.enemyShots.update(dt, this.foes);
    this.tickFoes(dtMs);
  }

  resolveCollisions(): void {
    for (const b of this.playerShots.list) {
      if (!b.alive) continue;
      for (const foe of this.foes) {
        if (foe.dead || b.hit.has(foe)) continue;
        if (!circlesOverlap(b.sprite, this.playerShots.radius(b), foe.sprite, foe.radius)) continue;
        this.damage(foe, b.damage, b.source);
        this.fx.spark(b.sprite.x, b.sprite.y - 4, b.kind === 'crit' ? 8 : 3);
        if (b.kind === 'crit') this.fx.float(b.sprite.x, b.sprite.y - 10, `${Math.round(b.damage)}!`);
        if (b.pierceLeft-- <= 0) {
          b.alive = false;
          break;
        }
        b.hit.add(foe);
      }
    }
    const p = this.player;
    for (const b of this.enemyShots.list) {
      if (b.alive && circlesOverlap(b.sprite, this.enemyShots.radius(b), p, p.coreRadius)) {
        b.alive = false;
        this.hurtPlayer();
      }
    }
    for (const foe of this.foes) {
      if (!foe.dead && !this.dash.active && circlesOverlap(foe.sprite, foe.radius, p, p.bodyRadius)) {
        this.hurtPlayer();
        if (foe.size === 'small') this.damage(foe, foe.hp, 'collision');
      }
    }
  }

  killAll(): void {
    for (const foe of this.foes) this.damage(foe, foe.hp, 'bullet');
  }

  private tickFoes(dtMs: number): void {
    for (const foe of this.foes) {
      if (foe.burn) {
        this.damage(foe, (foe.burn.dps * dtMs) / 1000, 'burn');
        foe.burn.msLeft -= dtMs;
        if (foe.burn.msLeft <= 0) foe.burn = null;
      }
      if (foe.flashMs > 0 && (foe.flashMs -= dtMs) > 0) continue;
      foe.flashMs = 0;
      foe.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(foe.burn ? BURN_TINT : 0xffffff);
    }
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const foe = this.foes[i]!;
      if (!foe.dead) continue;
      foe.sprite.destroy();
      this.foes.splice(i, 1);
    }
  }
}
