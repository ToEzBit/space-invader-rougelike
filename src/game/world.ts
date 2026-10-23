import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { deriveStats } from '../core/perks';
import { godMode } from '../godMode';
import { ITEMS, withBuffs, type BuffId, type ItemEffect, type ItemId } from '../core/items';
import { carryTransAm, heal, takeHit, useItem, type RunState } from '../core/run';
import type { ShipStats } from '../core/stats';
import { activate, carriedGauge, charging, enemyTimeScale, gain, loseOnHit, releaseProgress, tick, TRANS_AM, withTransAm, type TransAm } from '../core/transAm';
import type { CharacterKey } from '../art/characters';
import { BULLETS, Bullets, type Bullet } from './bullets';
import { Dash } from './dash';
import { Fx } from './fx';
import { circlesOverlap, type Point } from './geometry';
import { Graze } from './graze';
import { Gun } from './gun';
import { HIDDEN, hitBar, hpRatio, tickBar, type HpBar } from './hpBar';
import { Laser } from './laser';
import { DEPTH } from './layout';
import type { Controls } from './controls';
import { Player } from './player';
import { READY, transAmMeter, type SkillMeter } from './skills';
import { Summons } from './summons';
import { TransAmLook } from './transAmLook';

export type DamageSource = 'bullet' | 'missile' | 'laser' | 'burn' | 'orbital' | 'dash' | 'shock' | 'collision' | 'spark' | 'blast' | 'wisp' | 'spirit';

export type Foe = {
  sprite: Phaser.GameObjects.Image;
  hp: number;
  maxHp: number;
  coin: number;
  readonly radius: number;
  size: 'small' | 'big';
  burn: { dps: number; msLeft: number } | null;
  // Haunt's time left; until it runs out every hit on this foe lands harder.
  hauntMs: number;
  // Counts down a white hit flash, then on below zero through the gap before the next one may start.
  flashMs: number;
  hpBar: HpBar;
  dead: boolean;
  // Absorbs a hit when it returns true, before any HP is lost. A boss wards itself while it transforms.
  ward?: (source: DamageSource) => boolean;
};

const FLASH_MS = 70;
// A foe under steady fire, such as a boss holding still to cast, would otherwise stay solid white.
const FLASH_GAP_MS = 110;
const BURN_TINT = 0xffa070;
const HAUNT_TINT = 0x9db4ff;
// Continuous damage lands every frame: flashing on it would keep a foe solid white and would pin the HP bar's
// chip in place, so only discrete hits flash and hold the chip.
const DISCRETE: Record<DamageSource, boolean> = {
  bullet: true,
  missile: true,
  laser: false,
  burn: false,
  orbital: true,
  dash: true,
  shock: true,
  collision: true,
  spark: true,
  blast: true,
  wisp: true,
  spirit: true,
};
const BURN_MS = 2000;
const SLOWED_SHOT_TINT = 0x6fa8ff;

// fullMs is the duration the HUD sweep counts down from; re-using an active buff resets it to the new total.
export type ActiveBuff = { buff: BuffId; msLeft: number; fullMs: number };

// The live simulation of one stage: the ship's systems, every foe, and both bullet pools.
// The run is replaced only through src/core/run.ts transitions.
export class World {
  run: RunState;
  private readonly baseStats: ShipStats;
  private effectiveStats: ShipStats;
  // Buffs last for this stage only; World is rebuilt each stage.
  private buffs: ActiveBuff[] = [];
  // The run carries only the gauge between stages; the live phase lives here.
  private trans: TransAm;
  private readonly look: TransAmLook;
  readonly fx: Fx;
  readonly foes: Foe[] = [];
  readonly playerShots: Bullets;
  readonly enemyShots: Bullets;
  readonly player: Player;
  readonly gun: Gun;
  readonly laser: Laser;
  readonly dash: Dash;
  readonly graze: Graze;
  readonly summons: Summons;
  // Coins earned this stage; paid out by clearStage.
  coins = 0;
  // Source-specific perks hook kills here (laser refunds, dash lifesteal).
  readonly onKill: Partial<Record<DamageSource, (foe: Foe) => void>> = {};
  // Dev-only measurement. God mode skips only the HP loss, so `hits` still counts what a real ship would take.
  god = false;
  readonly tally = { fired: 0, dealt: {} as Partial<Record<DamageSource, number>>, bossDealt: 0, kills: 0, hits: 0, contacts: 0, grazes: 0 };
  // A contact is a run of consecutive frames with any damaging touch, so a beam held on the ship counts once.
  private touchedLastFrame = false;
  private touchedThisFrame = false;

  constructor(
    readonly scene: Phaser.Scene,
    run: RunState,
  ) {
    this.run = run;
    this.baseStats = deriveStats(run.perks);
    this.effectiveStats = this.baseStats;
    this.fx = new Fx(scene);
    this.playerShots = new Bullets(scene, DEPTH.playerShot);
    this.enemyShots = new Bullets(scene, DEPTH.enemyShot);
    this.player = new Player(this);
    this.gun = new Gun(this);
    this.laser = new Laser(this);
    this.dash = new Dash(this);
    this.graze = new Graze(this);
    this.summons = new Summons(this);
    this.trans = charging(run.transAmGauge);
    this.look = new TransAmLook(this);
  }

  // Perk stats with every active buff folded in. Systems read this each frame, so buffs apply live.
  get stats(): ShipStats {
    return this.effectiveStats;
  }

  get activeBuffs(): readonly ActiveBuff[] {
    return this.buffs;
  }

  get transAm(): TransAm {
    return this.trans;
  }

  // Enemy bullets, boss beams and the well's pull on bullets run on this clock; everything else keeps real time.
  get enemyTimeScale(): number {
    return enemyTimeScale(this.trans) * this.graze.enemyTimeScale;
  }

  transAmMeter(): SkillMeter {
    return transAmMeter(this.trans);
  }

  // False when the gauge is not full.
  activateTransAm(): boolean {
    const next = activate(this.trans);
    if (!next) return false;
    this.setTransAm(next);
    this.laser.hush();
    return true;
  }

  // Dev-only precondition.
  setTransAmGauge(gauge: number): void {
    this.setTransAm(charging(gauge));
  }

  private gainTransAm(points: number): void {
    this.setTransAm(gain(this.trans, points));
  }

  private setTransAm(next: TransAm): void {
    const prev = this.trans;
    if (next === prev) return;
    this.trans = next;
    this.run = carryTransAm(this.run, carriedGauge(next));
    if (next.kind === prev.kind) return;
    this.restat();
    this.look.enter(next.kind);
  }

  // StageScene calls this as the stage ends, so the laser's buzz stops here too.
  silenceTransAm(): void {
    this.look.endStage();
    this.laser.endStage();
  }

  // Re-folds the stats and recolors enemy shots to match the enemy clock, after the TRANS-AM phase or a graze timer changes.
  restat(): void {
    this.recomputeStats();
    if (this.enemyTimeScale < 1) this.enemyShots.tintAll(SLOWED_SHOT_TINT, Phaser.TintModes.SCREEN);
    else this.enemyShots.tintAll(0xffffff);
  }

  // Item buffs first, then Adrenaline, then the TRANS-AM phase.
  private recomputeStats(): void {
    const stats = withBuffs(this.baseStats, this.buffs.map((b) => b.buff));
    if (this.graze.rushing) stats.fireIntervalMs *= stats.adrenalineIntervalScale;
    this.effectiveStats = withTransAm(stats, this.trans);
  }

  // False when the run refuses the use (none held, or a heal at full HP).
  useItem(id: ItemId): boolean {
    const used = useItem(this.run, id);
    if (!used) return false;
    this.run = used.run;
    this.applyEffect(used.effect);
    sfx('buy');
    return true;
  }

  itemMeter(id: ItemId): SkillMeter {
    const { effect } = ITEMS[id];
    const left =
      effect.kind === 'buff'
        ? this.buffs.find((b) => b.buff === effect.buff)
        : effect.kind === 'shield'
          ? { msLeft: this.player.shieldMs, fullMs: this.player.shieldFullMs }
          : undefined;
    return left && left.msLeft > 0 ? { kind: 'active', ratioLeft: left.msLeft / left.fullMs } : READY;
  }

  private applyEffect(effect: ItemEffect): void {
    const p = this.player;
    switch (effect.kind) {
      case 'heal':
        this.fx.float(p.x, p.y - 30, `+${effect.hp} HP`, 0x5dff9b);
        return;
      case 'buff': {
        const active = this.buffs.find((b) => b.buff === effect.buff);
        if (active) {
          active.msLeft += effect.durationMs;
          active.fullMs = active.msLeft;
          return;
        }
        this.buffs.push({ buff: effect.buff, msLeft: effect.durationMs, fullMs: effect.durationMs });
        this.recomputeStats();
        return;
      }
      case 'shield':
        p.shieldFor(p.shieldMs + effect.durationMs);
        return;
    }
  }

  private tickBuffs(dtMs: number): void {
    for (const b of this.buffs) b.msLeft -= dtMs;
    const left = this.buffs.filter((b) => b.msLeft > 0);
    if (left.length === this.buffs.length) return;
    this.buffs = left;
    this.recomputeStats();
  }

  addFoe(texture: CharacterKey, x: number, y: number, hp: number, coin: number, radius: number, size: Foe['size'] = 'small'): Foe {
    const sprite = this.scene.add.image(x, y, texture).setDepth(DEPTH.foe);
    const foe: Foe = { sprite, hp, maxHp: hp, coin, radius, size, burn: null, hauntMs: 0, flashMs: -FLASH_GAP_MS, hpBar: HIDDEN, dead: false };
    this.foes.push(foe);
    return foe;
  }

  // Returns true when this hit killed the foe.
  damage(foe: Foe, amount: number, source: DamageSource): boolean {
    if (foe.dead || amount <= 0 || foe.ward?.(source)) return false;
    if (foe.hauntMs > 0) amount *= 1 + this.stats.hauntBonus;
    const ratioBefore = hpRatio(foe);
    const removed = Math.min(amount, foe.hp);
    foe.hp -= amount;
    this.tally.dealt[source] = (this.tally.dealt[source] ?? 0) + amount;
    if (foe.size === 'big') {
      this.tally.bossDealt += removed;
      this.gainTransAm((TRANS_AM.gain.bossHpPercent * 100 * removed) / foe.maxHp);
    }
    if (DISCRETE[source] && foe.flashMs <= -FLASH_GAP_MS) {
      foe.flashMs = FLASH_MS;
      foe.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    }
    if (foe.hp > 0) {
      foe.hpBar = hitBar(foe.hpBar, ratioBefore, DISCRETE[source]);
      return false;
    }
    foe.dead = true;
    this.tally.kills++;
    this.gainTransAm(TRANS_AM.gain.kill);
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
    if (!this.touchedLastFrame && !this.touchedThisFrame) this.tally.contacts++;
    this.touchedThisFrame = true;
    if (!force && (p.invulnMs > 0 || this.dash.active)) return;
    if (!force && p.shieldMs > 0) return p.breakShield();
    // Like a shield block, a hit a familiar takes is no landed hit: no HP, gauge or streak lost.
    if (!force && this.summons.sacrifice()) return p.brace();
    this.tally.hits++;
    this.graze.onHit();
    this.setTransAm(loseOnHit(this.trans));
    if (this.god || godMode()) return p.onHit();
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

  update(dtMs: number, input: Controls, firing: boolean): void {
    const dt = dtMs / 1000;
    this.touchedLastFrame = this.touchedThisFrame;
    this.touchedThisFrame = false;
    this.tickBuffs(dtMs);
    this.graze.update(dtMs);
    // No tick has touched an active time activated during the frozen cut-in, so its release starts on this frame.
    if (releaseProgress(this.trans) === 0) this.look.release();
    this.setTransAm(tick(this.trans, dtMs));
    if (!this.dash.active) this.player.steer(input, dt);
    this.player.update(dtMs);
    this.gun.update(dtMs, firing);
    this.summons.update(dtMs, firing);
    this.laser.update(dtMs, firing);
    this.dash.update(dtMs, input.dash);
    this.playerShots.update(dt, this.foes);
    this.enemyShots.update(dt * this.enemyTimeScale, this.foes);
    const release = releaseProgress(this.trans);
    const shockRadius = release === null ? null : TRANS_AM.clearRadiusPx * Phaser.Math.Easing.Quadratic.Out(release);
    if (shockRadius !== null) this.clearShotsWithin(shockRadius);
    this.look.update(dtMs, this.trans, shockRadius, this.gun.overdriven);
    this.tickFoes(dtMs);
  }

  private clearShotsWithin(radius: number): void {
    const p = this.player;
    for (const b of this.enemyShots.list) {
      if (!b.alive || (b.sprite.x - p.x) ** 2 + (b.sprite.y - p.y) ** 2 > radius * radius) continue;
      this.enemyShots.kill(b);
      this.fx.spark(b.sprite.x, b.sprite.y, 2);
    }
  }

  // Dashing through bullets is not a near miss, so a dash never starts a graze.
  private trackGraze(b: Bullet, near: boolean): void {
    if (near && b.graze === 'far' && !this.dash.active) b.graze = 'near';
    if (near || b.graze !== 'near') return;
    b.graze = 'counted';
    this.tally.grazes++;
    this.gainTransAm(this.graze.gaugeGain);
    const p = this.player;
    this.fx.spark((p.x + b.sprite.x) / 2, (p.y + b.sprite.y) / 2, 3);
    this.graze.onGraze(b);
  }

  resolveCollisions(): void {
    for (const b of this.playerShots.list) {
      if (!b.alive) continue;
      for (const foe of this.foes) {
        if (foe.dead || b.hit.has(foe) || (b.crowdOnly && foe.size === 'big')) continue;
        if (!circlesOverlap(b.sprite, this.playerShots.radius(b), foe.sprite, foe.radius)) continue;
        this.damage(foe, b.damage, b.source);
        if (b.blast > 0) this.burst(b, foe);
        if (b.kind === 'wisp') this.summons.onWispHit(foe);
        if (BULLETS[b.kind].crowd) b.crowdOnly = true;
        this.fx.spark(b.sprite.x, b.sprite.y - 4, b.kind === 'crit' ? 8 : 3);
        if (b.kind === 'crit') this.fx.float(b.sprite.x, b.sprite.y - 10, `${Math.round(b.damage)}!`);
        if (b.pierceLeft-- <= 0) {
          b.alive = false;
          break;
        }
        b.hit.add(foe);
      }
    }
    this.summons.guard();
    const p = this.player;
    const grazeRadius = p.coreRadius + this.graze.ringPx;
    for (const b of this.enemyShots.list) {
      if (!b.alive) continue;
      const r = this.enemyShots.radius(b);
      if (circlesOverlap(b.sprite, r, p, p.coreRadius)) {
        b.alive = false;
        this.hurtPlayer();
        continue;
      }
      this.trackGraze(b, circlesOverlap(b.sprite, r, p, grazeRadius));
    }
    for (const foe of this.foes) {
      if (!foe.dead && !this.dash.active && circlesOverlap(foe.sprite, foe.radius, p, p.bodyRadius)) {
        this.hurtPlayer();
        if (foe.size === 'small') this.damage(foe, foe.hp, 'collision');
      }
    }
  }

  nearestFoe(at: Point, smallOnly = false): Foe | null {
    let best: Foe | null = null;
    let bestD = Infinity;
    for (const f of this.foes) {
      const d = (f.sprite.x - at.x) ** 2 + (f.sprite.y - at.y) ** 2;
      if (!f.dead && !(smallOnly && f.size === 'big') && d < bestD) [best, bestD] = [f, d];
    }
    return best;
  }

  // A bursting round's hit also lands, at its kind's share of the damage, on every other foe within its blast radius.
  private burst(b: Bullet, struck: Foe): void {
    const look = BULLETS[b.kind].burst;
    if (!look) return;
    const at = b.sprite;
    for (const foe of this.foes) {
      if (foe !== struck && !foe.dead && !(b.crowdOnly && foe.size === 'big') && circlesOverlap(at, b.blast, foe.sprite, foe.radius)) this.damage(foe, b.damage * look.share, 'blast');
    }
    const ring = this.scene.add.circle(at.x, at.y, b.blast, look.color, 0.18).setStrokeStyle(3, look.color, 0.9).setDepth(DEPTH.fx);
    ring.setScale(0.3);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  killAll(): void {
    for (const foe of this.foes) this.damage(foe, foe.hp, 'bullet');
  }

  private tickFoes(dtMs: number): void {
    for (const foe of this.foes) {
      foe.hpBar = tickBar(foe.hpBar, hpRatio(foe), dtMs);
      if (foe.burn) {
        this.damage(foe, (foe.burn.dps * dtMs) / 1000, 'burn');
        foe.burn.msLeft -= dtMs;
        if (foe.burn.msLeft <= 0) foe.burn = null;
      }
      if (foe.hauntMs > 0) foe.hauntMs = Math.max(0, foe.hauntMs - dtMs);
      if (foe.flashMs > -FLASH_GAP_MS) foe.flashMs -= dtMs;
      if (foe.flashMs > 0) continue;
      foe.sprite.setTintMode(Phaser.TintModes.MULTIPLY).setTint(foe.burn ? BURN_TINT : foe.hauntMs > 0 ? HAUNT_TINT : 0xffffff);
    }
    for (let i = this.foes.length - 1; i >= 0; i--) {
      const foe = this.foes[i]!;
      if (!foe.dead) continue;
      foe.sprite.destroy();
      this.foes.splice(i, 1);
    }
  }
}
