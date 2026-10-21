import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { COLORS } from '../art/palette';
import { rechargeTick, type Charges } from './charges';
import { circlesOverlap } from './geometry';
import { DASH_APEX_Y, DEPTH, PLAYER_Y } from './layout';
import { chargesMeter, type SkillMeter } from './skills';
import type { Foe, World } from './world';

const SHOCK_DAMAGE_SCALE = 0.5;
const GHOST_EVERY_MS = 28;

// The ship flies straight up through the formation and back down; each foe is hit once per dash.
type DashState = { kind: 'locked' } | { kind: 'idle' } | { kind: 'active'; leg: 'up' | 'down'; hit: Set<Foe>; ghostMs: number };

export class Dash {
  private state: DashState;
  private charges: Charges;
  private kills = 0;

  constructor(private readonly world: World) {
    const { stats } = world;
    this.state = stats.dashCooldownMs > 0 ? { kind: 'idle' } : { kind: 'locked' };
    this.charges = { count: stats.dashCharges, msToNext: stats.dashCooldownMs };
    world.onKill.dash = () => this.onKill();
  }

  get active(): boolean {
    return this.state.kind === 'active';
  }

  meter(): SkillMeter | null {
    if (this.state.kind === 'locked') return null;
    const { dashCharges, dashCooldownMs } = this.world.stats;
    return chargesMeter(this.charges, dashCharges, dashCooldownMs);
  }

  update(dtMs: number, pressed: boolean): void {
    const { stats } = this.world;
    const s = this.state;
    if (s.kind === 'locked') return;
    this.charges = rechargeTick(this.charges, dtMs, stats.dashCharges, stats.dashCooldownMs);
    if (s.kind === 'idle') {
      if (pressed && this.charges.count > 0) this.launch();
      return;
    }
    this.fly(s, dtMs);
  }

  private launch(): void {
    const { player, stats, fx } = this.world;
    this.charges = { ...this.charges, count: this.charges.count - 1 };
    this.state = { kind: 'active', leg: 'up', hit: new Set(), ghostMs: 0 };
    player.sprite.setScale(stats.dashSizeMultiplier).setRotation(0);
    fx.spark(player.x, player.y + 20, 12);
    fx.shake(0.004, 100);
    sfx('dash');
  }

  private fly(s: Extract<DashState, { kind: 'active' }>, dtMs: number): void {
    const { player, stats } = this.world;
    const sprite = player.sprite;
    const step = (stats.dashSpeed * dtMs) / 1000;
    sprite.y += s.leg === 'up' ? -step : step;
    this.ram(s.hit);
    this.ghost(s, dtMs);
    if (s.leg === 'up' && sprite.y <= DASH_APEX_Y) {
      sprite.y = DASH_APEX_Y;
      s.leg = 'down';
    } else if (s.leg === 'down' && sprite.y >= PLAYER_Y) {
      sprite.y = PLAYER_Y;
      sprite.setScale(1);
      this.state = { kind: 'idle' };
      if (stats.dashShieldMs > 0) player.shieldMs = stats.dashShieldMs;
    }
  }

  private ram(hit: Set<Foe>): void {
    const { player, stats, foes, fx } = this.world;
    const radius = player.bodyRadius * stats.dashSizeMultiplier;
    const damage = stats.dashDamage * stats.dashDamageMultiplier;
    for (const foe of foes) {
      if (foe.dead || hit.has(foe) || !circlesOverlap(player, radius, foe.sprite, foe.radius)) continue;
      hit.add(foe);
      const { x, y } = foe.sprite;
      this.world.damage(foe, damage, 'dash');
      fx.spark(x, y, 10);
      fx.shake(0.003, 60);
      if (stats.dashShockRadius > 0) this.shockwave(x, y, damage * SHOCK_DAMAGE_SCALE, foe);
    }
  }

  private shockwave(x: number, y: number, damage: number, source: Foe): void {
    const { scene, foes, stats } = this.world;
    for (const foe of foes) {
      if (foe !== source && !foe.dead && circlesOverlap({ x, y }, stats.dashShockRadius, foe.sprite, foe.radius)) this.world.damage(foe, damage, 'shock');
    }
    const ring = scene.add.circle(x, y, stats.dashShockRadius, COLORS.orange, 0.2).setStrokeStyle(3, COLORS.yellow, 0.9).setDepth(DEPTH.fx);
    ring.setScale(0.3);
    scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  private ghost(s: Extract<DashState, { kind: 'active' }>, dtMs: number): void {
    if ((s.ghostMs -= dtMs) > 0) return;
    s.ghostMs = GHOST_EVERY_MS;
    const { scene, player } = this.world;
    const ghost = scene.add
      .image(player.x, player.y, 'player')
      .setScale(player.sprite.scale)
      .setTint(COLORS.pink)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player - 2);
    scene.tweens.add({ targets: ghost, alpha: 0, scale: ghost.scale * 0.8, duration: 260, onComplete: () => ghost.destroy() });
  }

  private onKill(): void {
    const every = this.world.stats.dashHealEveryKills;
    this.kills++;
    if (every > 0 && this.kills % every === 0) this.world.healPlayer(1);
  }
}
