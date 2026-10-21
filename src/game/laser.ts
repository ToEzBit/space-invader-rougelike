import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { COLORS } from '../art/palette';
import { VIEW } from '../view';
import { distanceToSegment, rayEnd, type Point } from './geometry';
import { DEPTH } from './layout';
import { densestColumn } from './targeting';
import type { World } from './world';

const SIDE_BEAM_STEP_DEG = 20;
const SIDE_BEAM_DPS_SCALE = 0.5;
const BEAM_LENGTH = 900;
const ORBITAL_AIM_MS = 550;
const ORBITAL_HALF_WIDTH = 22;
const ORBITAL_COLUMN = 36;

// A zero cooldown in ShipStats means the mechanic was never unlocked.
type LaserState =
  | { kind: 'locked' }
  | { kind: 'ready' }
  | { kind: 'firing'; msLeft: number; refundMs: number }
  | { kind: 'charging'; msLeft: number };

type OrbitalState = { kind: 'locked' } | { kind: 'charging'; msLeft: number } | { kind: 'aiming'; msLeft: number; x: number };

export type Beam = { from: Point; to: Point; width: number; dpsScale: number };

export type Meter = { ratio: number; ready: boolean; active: boolean };

export class Laser {
  private state: LaserState;
  private orbital: OrbitalState;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private flickerMs = 0;

  constructor(private readonly world: World) {
    const { stats } = world;
    this.state = stats.laserCooldownMs > 0 ? { kind: 'ready' } : { kind: 'locked' };
    this.orbital = stats.orbitalCooldownMs > 0 ? { kind: 'charging', msLeft: stats.orbitalCooldownMs / 2 } : { kind: 'locked' };
    this.gfx = world.scene.add.graphics().setDepth(DEPTH.beam).setBlendMode(Phaser.BlendModes.ADD);
    world.onKill.laser = () => this.refund(stats.laserKillRefundMs);
  }

  get firing(): boolean {
    return this.state.kind === 'firing';
  }

  meter(): Meter | null {
    const { stats } = this.world;
    const s = this.state;
    switch (s.kind) {
      case 'locked':
        return null;
      case 'ready':
        return { ratio: 1, ready: true, active: false };
      case 'firing':
        return { ratio: s.msLeft / stats.laserDurationMs, ready: false, active: true };
      case 'charging':
        return { ratio: 1 - s.msLeft / stats.laserCooldownMs, ready: false, active: false };
    }
  }

  beams(): Beam[] {
    const { stats, player } = this.world;
    const from = { x: player.x, y: player.y - player.sprite.displayHeight / 2 + 4 };
    const beams: Beam[] = [{ from, to: { x: from.x, y: -20 }, width: stats.laserWidth, dpsScale: 1 }];
    for (let i = 1; i <= stats.laserSideBeams; i++)
      for (const side of [-1, 1])
        beams.push({ from, to: rayEnd(from, side * SIDE_BEAM_STEP_DEG * i, BEAM_LENGTH), width: stats.laserWidth * 0.7, dpsScale: SIDE_BEAM_DPS_SCALE });
    return beams;
  }

  update(dtMs: number, firing: boolean): void {
    const { stats } = this.world;
    const s = this.state;
    this.gfx.clear();
    switch (s.kind) {
      case 'locked':
        break;
      case 'ready':
        if (!firing) break;
        this.state = { kind: 'firing', msLeft: stats.laserDurationMs, refundMs: 0 };
        sfx('laser');
        break;
      case 'firing':
        this.burn(dtMs);
        if ((s.msLeft -= dtMs) <= 0) this.state = { kind: 'charging', msLeft: Math.max(0, stats.laserCooldownMs - s.refundMs) };
        break;
      case 'charging':
        if ((s.msLeft -= dtMs) <= 0) this.state = { kind: 'ready' };
        break;
    }
    this.updateOrbital(dtMs);
  }

  private refund(ms: number): void {
    const s = this.state;
    if (s.kind === 'firing') s.refundMs += ms;
    if (s.kind === 'charging') s.msLeft = Math.max(0, s.msLeft - ms);
  }

  private burn(dtMs: number): void {
    const { stats, foes, enemyShots, fx } = this.world;
    const beams = this.beams();
    for (const beam of beams) {
      for (const foe of foes) {
        if (foe.dead || distanceToSegment(foe.sprite, beam.from, beam.to) > beam.width / 2 + foe.radius) continue;
        this.world.damage(foe, (stats.laserDps * beam.dpsScale * dtMs) / 1000, 'laser');
        this.world.ignite(foe, stats.laserBurnDps);
        if (Math.random() < 0.3) fx.spark(foe.sprite.x, foe.sprite.y + foe.radius, 1);
      }
      if (!stats.laserErasesBullets) continue;
      for (const b of enemyShots.list) {
        if (!b.alive || distanceToSegment(b.sprite, beam.from, beam.to) > beam.width / 2 + enemyShots.radius(b)) continue;
        b.alive = false;
        fx.spark(b.sprite.x, b.sprite.y, 3);
        if (stats.laserErasedBulletCoin > 0) {
          this.world.coins += stats.laserErasedBulletCoin;
          fx.coin(b.sprite.x, b.sprite.y);
        }
      }
    }
    this.draw(beams, dtMs);
  }

  private draw(beams: readonly Beam[], dtMs: number): void {
    this.flickerMs += dtMs;
    const wobble = 1 + Math.sin(this.flickerMs / 30) * 0.12;
    const g = this.gfx;
    for (const { from, to, width } of beams) {
      const w = width * wobble;
      g.lineStyle(w + 10, COLORS.magenta, 0.25).lineBetween(from.x, from.y, to.x, to.y);
      g.lineStyle(w + 4, COLORS.cyan, 0.55).lineBetween(from.x, from.y, to.x, to.y);
      g.lineStyle(Math.max(2, w * 0.45), COLORS.white, 0.95).lineBetween(from.x, from.y, to.x, to.y);
    }
    const origin = beams[0]!.from;
    g.fillStyle(COLORS.cyan, 0.6).fillCircle(origin.x, origin.y, 7 * wobble);
    g.fillStyle(COLORS.white, 1).fillCircle(origin.x, origin.y, 4 * wobble);
  }

  private updateOrbital(dtMs: number): void {
    const { stats, foes } = this.world;
    const o = this.orbital;
    switch (o.kind) {
      case 'locked':
        return;
      case 'charging': {
        if ((o.msLeft -= dtMs) > 0) return;
        const x = densestColumn(
          foes.filter((f) => !f.dead).map((f) => f.sprite.x),
          ORBITAL_COLUMN,
        );
        if (x !== null) this.orbital = { kind: 'aiming', msLeft: ORBITAL_AIM_MS, x };
        return;
      }
      case 'aiming': {
        const blink = Math.floor(o.msLeft / 70) % 2 === 0;
        this.gfx.lineStyle(2, COLORS.red, blink ? 0.9 : 0.4).lineBetween(o.x, 40, o.x, VIEW.h);
        this.gfx.lineStyle(2, COLORS.red, 0.9).strokeCircle(o.x, 140, 10 + o.msLeft / 40);
        if ((o.msLeft -= dtMs) > 0) return;
        for (const foe of foes) if (Math.abs(foe.sprite.x - o.x) <= ORBITAL_HALF_WIDTH + foe.radius) this.world.damage(foe, stats.orbitalDamage, 'orbital');
        this.strikeFx(o.x);
        this.orbital = { kind: 'charging', msLeft: stats.orbitalCooldownMs };
        return;
      }
    }
  }

  private strikeFx(x: number): void {
    const { scene, fx } = this.world;
    const column = scene.add.rectangle(x, VIEW.h / 2, ORBITAL_HALF_WIDTH * 2, VIEW.h, COLORS.yellow, 0.9).setDepth(DEPTH.beam).setBlendMode(Phaser.BlendModes.ADD);
    const core = scene.add.rectangle(x, VIEW.h / 2, 10, VIEW.h, COLORS.white, 1).setDepth(DEPTH.beam).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: [column, core], scaleX: 0, alpha: 0, duration: 380, ease: 'Quad.easeIn', onComplete: () => (column.destroy(), core.destroy()) });
    fx.shake(0.01, 220);
  }
}
