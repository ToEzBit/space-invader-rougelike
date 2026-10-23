import { COLORS } from '../art/palette';
import { DEPTH } from './layout';
import { GRAZE } from '../core/perks';
import { TRANS_AM } from '../core/transAm';
import type { Bullet } from './bullets';
import type { Point } from './geometry';
import type { World } from './world';

const SPARK_SPEED = 380;
const SPARK_FAN_DEG = 20;

// The graze branch. World reports each counted graze and each landed hit; every effect reads its ShipStats field
// and stays off at zero, so a ship without the branch never reaches the fx (and their Math.random) below.
export class Graze {
  private grazes = 0;
  private streak = 0;
  private rushMs = 0;
  private slowMs = 0;
  private pulses = 0;
  private grazed: Bullet | null = null;
  private pulse: { at: Point; erased: { bullet: Bullet; at: Point }[] } | null = null;

  constructor(private readonly world: World) {}

  get ringPx(): number {
    return TRANS_AM.grazePadPx + this.world.stats.grazeHaloPx;
  }

  get gaugeGain(): number {
    return TRANS_AM.gain.graze * (1 + this.world.stats.grazeGainBonus);
  }

  get rushing(): boolean {
    return this.rushMs > 0;
  }

  get enemyTimeScale(): number {
    return this.slowMs > 0 ? GRAZE.bulletTimeScale : 1;
  }

  // Dev-only.
  get debug() {
    return { grazes: this.grazes, streak: this.streak, rushMs: this.rushMs, slowMs: this.slowMs, pulses: this.pulses };
  }

  // Dev-only.
  get last() {
    return { grazed: this.grazed, pulse: this.pulse };
  }

  onGraze(b: Bullet): void {
    const { stats } = this.world;
    this.grazes++;
    this.streak++;
    this.grazed = b;
    const at = { x: (this.world.player.x + b.sprite.x) / 2, y: (this.world.player.y + b.sprite.y) / 2 };
    if (stats.grazeSparkDamage > 0) this.launchSparks(at, this.grazes % GRAZE.flashpointEvery === 0 ? stats.flashpointRadius : 0);
    if (stats.staticSkinEvery > 0 && this.grazes % stats.staticSkinEvery === 0) this.staticPulse();
    if (stats.phaseSkinEvery > 0 && this.streak % stats.phaseSkinEvery === 0) this.phaseShield();
    const on = this.timersOn;
    if (stats.adrenalineIntervalScale > 0) this.rushMs = GRAZE.adrenalineMs;
    if (stats.bulletTimeMs > 0) this.slowMs = stats.bulletTimeMs;
    if (this.timersOn !== on) this.world.restat();
  }

  onHit(): void {
    this.streak = 0;
  }

  update(dtMs: number): void {
    const on = this.timersOn;
    if (!on) return;
    this.rushMs = Math.max(0, this.rushMs - dtMs);
    this.slowMs = Math.max(0, this.slowMs - dtMs);
    if (this.timersOn !== on) this.world.restat();
  }

  // Adrenaline and Bullet Time change the ship's stats and the enemy clock, so World re-folds both whenever either
  // starts or runs out.
  private get timersOn(): number {
    return (this.rushMs > 0 ? 1 : 0) | (this.slowMs > 0 ? 2 : 0);
  }

  private launchSparks(at: Point, blast: number): void {
    const { stats, run, playerShots, tally } = this.world;
    const target = this.world.nearestFoe(at);
    const aim = target ? Math.atan2(target.sprite.y - at.y, target.sprite.x - at.x) : -Math.PI / 2;
    const damage = stats.grazeSparkDamage * (stats.lastStandDamageScale > 0 && run.hp === 1 ? stats.lastStandDamageScale : 1);
    for (let i = 0; i <= stats.grazeExtraSparks; i++) {
      const angle = aim + (((i % 2 ? 1 : -1) * Math.ceil(i / 2) * SPARK_FAN_DEG) * Math.PI) / 180;
      tally.fired += damage;
      playerShots.spawn({ kind: 'spark', x: at.x, y: at.y, vx: Math.cos(angle) * SPARK_SPEED, vy: Math.sin(angle) * SPARK_SPEED, damage, source: 'spark', blast });
    }
  }

  // No particles, so the pulse draws nothing from Math.random.
  private staticPulse(): void {
    const { player, enemyShots, scene } = this.world;
    const at = { x: player.x, y: player.y };
    const erased = enemyShots.list.filter((b) => b.alive && (b.sprite.x - at.x) ** 2 + (b.sprite.y - at.y) ** 2 <= GRAZE.staticPulsePx ** 2);
    for (const b of erased) enemyShots.kill(b);
    this.pulses++;
    this.pulse = { at, erased: erased.map((bullet) => ({ bullet, at: { x: bullet.sprite.x, y: bullet.sprite.y } })) };
    const ring = scene.add.circle(at.x, at.y, GRAZE.staticPulsePx, COLORS.lime, 0.16).setStrokeStyle(3, COLORS.lime, 0.95).setDepth(DEPTH.fx);
    ring.setScale(0.4);
    scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
  }

  private phaseShield(): void {
    const { player, fx } = this.world;
    if (GRAZE.phaseShieldMs > player.shieldMs) player.shieldFor(GRAZE.phaseShieldMs);
    fx.float(player.x, player.y - 30, 'PHASE', COLORS.lime);
  }
}
