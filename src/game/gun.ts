import Phaser from 'phaser';
import { OVERDRIVE_CALM_MS } from '../core/perks';
import { rayEnd } from './geometry';
import { DEPTH } from './layout';
import { fireInterval, volley, type Barrel } from './volley';
import type { World } from './world';

const MISSILE_SPEED = 320;
const DRONE_OFFSETS = [-36, 36] as const;

export class Gun {
  private cooldownMs = 0;
  private shots = 0;
  private bobMs = 0;
  private readonly barrels: Barrel[];
  readonly drones: Phaser.GameObjects.Image[];

  constructor(private readonly world: World) {
    this.barrels = volley(world.stats);
    this.drones = DRONE_OFFSETS.slice(0, world.stats.drones).map((dx) =>
      world.scene.add.image(world.player.x + dx, world.player.y, 'optionDrone').setDepth(DEPTH.player),
    );
  }

  get volleys(): number {
    return this.shots;
  }

  get overdriven(): boolean {
    return this.world.stats.overdriveMultiplier < 1 && this.world.player.msSinceHit >= OVERDRIVE_CALM_MS;
  }

  update(dtMs: number, firing: boolean): void {
    const { player } = this.world;
    this.cooldownMs = Math.max(this.cooldownMs - dtMs, firing ? -dtMs : 0);
    if (firing && this.cooldownMs <= 0) {
      this.fire();
      this.cooldownMs += fireInterval(this.world.stats, player.msSinceHit);
    }
    this.bobMs += dtMs;
    this.drones.forEach((d, i) => {
      const tx = player.x + DRONE_OFFSETS[i]!;
      const ty = player.y + 8 + Math.sin(this.bobMs / 260 + i * Math.PI) * 4;
      d.setPosition(Phaser.Math.Linear(d.x, tx, 0.25), Phaser.Math.Linear(d.y, ty, 0.25));
    });
  }

  private fire(): void {
    const { stats, player, playerShots } = this.world;
    const noseY = player.y - player.sprite.displayHeight / 2;
    const { tally } = this.world;
    for (const barrel of this.barrels) {
      const crit = Math.random() < stats.critChance;
      const dir = rayEnd({ x: 0, y: 0 }, barrel.angle, stats.bulletSpeed);
      tally.fired += stats.bulletDamage * (crit ? stats.critMultiplier : 1);
      playerShots.spawn({
        kind: crit ? 'crit' : 'shot',
        x: player.x + barrel.dx,
        y: noseY,
        vx: dir.x,
        vy: dir.y,
        damage: stats.bulletDamage * (crit ? stats.critMultiplier : 1),
        pierce: stats.pierce,
      });
    }
    tally.fired += this.drones.length * stats.bulletDamage;
    for (const d of this.drones)
      playerShots.spawn({ kind: 'droneShot', x: d.x, y: d.y - 8, vx: 0, vy: -stats.bulletSpeed, damage: stats.bulletDamage, pierce: stats.pierce });
    this.shots++;
    if (stats.homingEveryShots > 0 && this.shots % stats.homingEveryShots === 0) {
      const side = this.shots % (2 * stats.homingEveryShots) === 0 ? 1 : -1;
      tally.fired += stats.homingDamage;
      playerShots.spawn({ kind: 'missile', x: player.x + side * 14, y: player.y, vx: side * 140, vy: -MISSILE_SPEED, damage: stats.homingDamage, source: 'missile' });
    }
  }
}
