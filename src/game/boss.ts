import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { BOSSES, ENEMIES, bossPhaseAt, healedHp, transformDue, type BossDef, type BossForm, type BossPattern, type BossStage, type BossTexture, type EnemyKind, type FormIndex } from '../core/stages';
import { COLORS, css } from '../art/palette';
import { banner } from '../ui/banner';
import { VIEW } from '../view';
import type { BulletKind, BulletSpawn } from './bullets';
import type { Encounter } from './encounter';
import { enemyFire } from './formation';
import { distanceToSegment, rayEnd, type Point } from './geometry';
import { PATTERNS, WELL } from './patterns';
import { BOSS_RADIUS, FOE_RADIUS } from './hitbox';
import { hpRatio } from './hpBar';
import { beatAt, hop } from './idle';
import { DEPTH } from './layout';
import { label } from '../ui/text';
import type { Foe, World } from './world';

const HOME_Y = 138;
const ENTER_SPEED = 70;
export const MAX_MINIONS = 6;
const MINION_HP_SCALE = 2;
const BEAM = { width: 18, length: 900 } as const;
const CAST = { pulse: 0.07, convergeEveryMs: 35, releaseShake: 0.01 } as const;
// Callouts stay below the HUD's boss name and HP bar.
const CALLOUT_MIN_Y = 98;

// Fractions of the transformation's duration, except shockMs.
const TRANSFORM = { peak: 0.45, healFrom: 0.3, healTo: 0.9, shockMs: 900, shockReach: 820, crossfadeMs: 380 } as const;
const IMMUNE_FLOAT_GAP_MS = 260;

type Look = { orb: BulletKind; beam: number; glow: number; subtitle: string };

const FORM_LOOK: Record<BossTexture, Look> = {
  crimsonSeraph: { orb: 'orb', beam: COLORS.red, glow: COLORS.pink, subtitle: '' },
  crimsonSeraphAscended: { orb: 'orb', beam: COLORS.orange, glow: COLORS.gold, subtitle: 'ปีกเพลิงตื่นขึ้นแล้ว!' },
  voidEmpress: { orb: 'voidOrb', beam: COLORS.violet, glow: COLORS.cyan, subtitle: '' },
  voidEmpressEclipse: { orb: 'voidOrb', beam: COLORS.violet, glow: COLORS.violet, subtitle: 'สุริยุปราคากลืนกินท้องฟ้า!' },
};

// A beam sweeps its down-angle (0 straight down, positive leaning right) from fromDeg to toDeg after blinking
// for telegraphMs. A 'muzzle' origin follows the boss; a fixed origin was set when its cast was aimed.
export type BeamSpec = { origin: 'muzzle' | Point; fromDeg: number; toDeg: number; telegraphMs: number; sweepMs: number };
type Beam = BeamSpec & { t: number };

type Well = { at: Point; msLeft: number; fullMs: number; spin: number };

type Minion = { foe: Foe; kind: EnemyKind; tx: number; ty: number; t: number; fireCd: number };

// Drift and pattern gaps only run while fighting, so the boss resumes where it stopped.
// Casting charges a special for msLeft with the aim its telegraph shows. While transforming the boss is immune and
// climbs from fromHp back up by its heal.
type Stance =
  | { kind: 'entering' }
  | { kind: 'fighting'; gapMs: number }
  | { kind: 'casting'; pattern: BossPattern; msLeft: number; aim: unknown; callout: Phaser.GameObjects.Text; convergeMs: number }
  | { kind: 'transforming'; msLeft: number; fromHp: number }
  | { kind: 'dead' };

export class BossFight implements Encounter {
  readonly boss = this;
  readonly def: BossDef;
  readonly foe: Foe;
  readonly breached = false;
  form: FormIndex = 0;
  phase = 0;
  // Hits the transformation's immunity absorbed.
  deflected = 0;
  private lastImmuneFloatAt = -Infinity;
  private stance: Stance = { kind: 'entering' };
  private patternIndex = 0;
  private driftMs = 0;
  private beams: Beam[] = [];
  private well: Well | null = null;
  private minions: Minion[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly halo: Phaser.GameObjects.Image;

  constructor(
    readonly world: World,
    stage: BossStage,
  ) {
    this.def = BOSSES[stage.boss];
    const { texture } = this.def.forms[0];
    this.foe = world.addFoe(texture, VIEW.w / 2, -70, this.def.hp, 0, BOSS_RADIUS, 'big');
    this.foe.hpBar = { kind: 'hud' };
    this.foe.ward = () => this.stance.kind === 'transforming' && this.deflect();
    this.halo = world.scene.add
      .image(VIEW.w / 2, -70, texture)
      .setTint(FORM_LOOK[texture].glow)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.25)
      .setScale(1.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.foe - 1);
    this.gfx = world.scene.add.graphics().setDepth(DEPTH.beam);
  }

  get current(): BossForm {
    return this.def.forms[this.form];
  }

  get look(): Look {
    return FORM_LOOK[this.current.texture];
  }

  get name(): string {
    return this.current.name;
  }

  get stanceKind(): Stance['kind'] {
    return this.stance.kind;
  }

  // What a special shows while it charges, for debug state.
  get casting(): { pattern: BossPattern; castMsLeft: number; callout: string } | null {
    const s = this.stance;
    return s.kind === 'casting' ? { pattern: s.pattern, castMsLeft: s.msLeft, callout: s.callout.text } : null;
  }

  get minionCount(): number {
    return this.minions.length;
  }

  get hpRatio(): number {
    return hpRatio(this.foe);
  }

  get cleared(): boolean {
    return this.foe.dead;
  }

  get muzzle(): Point {
    const s = this.foe.sprite;
    return { x: s.x, y: s.y + s.displayHeight * 0.28 };
  }

  update(dtMs: number): void {
    this.gfx.clear();
    this.minions = this.minions.filter((m) => !m.foe.dead);
    this.timers = this.timers.filter((t) => t.getOverallProgress() < 1);
    if (this.foe.dead) return this.die();
    const s = this.foe.sprite;
    const stance = this.stance;
    switch (stance.kind) {
      case 'entering':
        s.y = Math.min(HOME_Y, s.y + (ENTER_SPEED * dtMs) / 1000);
        if (s.y >= HOME_Y) this.stance = { kind: 'fighting', gapMs: 1200 };
        break;
      case 'fighting':
        this.drift(dtMs);
        if (transformDue(this.def, this.form, this.hpRatio)) {
          this.startTransform();
          break;
        }
        this.advancePhase();
        if ((stance.gapMs -= dtMs) <= 0) this.nextPattern(stance);
        break;
      case 'casting':
        if (transformDue(this.def, this.form, this.hpRatio)) {
          this.startTransform();
          break;
        }
        this.castStep(stance, dtMs);
        break;
      case 'transforming':
        this.transformStep(stance, dtMs);
        break;
      case 'dead':
        break;
    }
    if (this.stance.kind !== 'transforming' && this.stance.kind !== 'casting')
      this.halo.setPosition(s.x, s.y).setAlpha(0.18 + Math.sin(this.driftMs / 200) * 0.08 + this.phase * 0.08);
    this.updateBeams(dtMs);
    this.updateWell(dtMs);
    for (const m of this.minions) this.updateMinion(m, dtMs);
  }

  // Every pattern bullet comes through here, so the form's bullet speed applies to all of them.
  fire(spawn: BulletSpawn): void {
    const k = this.current.bulletSpeedScale;
    this.world.enemyShots.spawn({ ...spawn, vx: spawn.vx * k, vy: spawn.vy * k });
  }

  shoot(kind: BulletKind, from: Point, angleDeg: number, speed: number): void {
    const rad = Phaser.Math.DegToRad(90 + angleDeg);
    this.fire({ kind, x: from.x, y: from.y, vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed });
  }

  aimAtPlayer(): number {
    const { player } = this.world;
    const m = this.muzzle;
    return Phaser.Math.RadToDeg(Math.atan2(player.y - m.y, player.x - m.x)) - 90;
  }

  after(ms: number, fn: () => void): void {
    this.timers.push(this.world.scene.time.delayedCall(ms, () => !this.foe.dead && fn()));
  }

  repeat(times: number, everyMs: number, fn: () => void): void {
    this.timers.push(this.world.scene.time.addEvent({ delay: everyMs, repeat: times - 1, callback: () => !this.foe.dead && fn() }));
  }

  summon(count: number): void {
    const room = MAX_MINIONS - this.minions.length;
    const kind = this.current.minionKind;
    const def = ENEMIES[kind];
    for (let i = 0; i < Math.min(count, room); i++) {
      const s = this.foe.sprite;
      const foe = this.world.addFoe(kind, s.x, s.y, def.hp * MINION_HP_SCALE, def.coin, FOE_RADIUS[kind]);
      this.minions.push({ foe, kind, tx: 50 + Math.random() * (VIEW.w - 100), ty: 210 + Math.random() * 90, t: Math.random() * 1000, fireCd: 900 + Math.random() * 900 });
    }
    this.world.fx.spark(this.foe.sprite.x, this.foe.sprite.y, 20);
  }

  addBeam(spec: BeamSpec): void {
    this.beams.push({ ...spec, t: 0 });
  }

  openWell(at: Point, ms: number): void {
    this.well = { at, msLeft: ms, fullMs: ms, spin: 0 };
  }

  private drift(dtMs: number): void {
    this.driftMs += dtMs;
    const s = this.foe.sprite;
    const reach = Math.min(110 + this.phase * 15, VIEW.w / 2 - this.halo.displayWidth / 2 - 6);
    s.x = VIEW.w / 2 + Math.sin(this.driftMs / 1500) * reach;
    s.y = HOME_Y + Math.sin(this.driftMs / 700) * 10;
  }

  private advancePhase(): void {
    const next = bossPhaseAt(this.def, this.form, this.hpRatio);
    if (next <= this.phase) return;
    this.phase = next;
    this.restartCycle();
    this.phaseFx();
  }

  private restartCycle(): void {
    this.patternIndex = 0;
    if (this.stance.kind === 'fighting') this.stance.gapMs = 900;
  }

  private phaseFx(): void {
    const { fx } = this.world;
    fx.flash(200, 255, 255, 255);
    sfx('phase');
    fx.shake(0.015, 450);
    fx.explode(this.foe.sprite.x, this.foe.sprite.y, 'big');
    fx.float(this.foe.sprite.x, this.foe.sprite.y - 60, `PHASE ${this.phase + 1}`, COLORS.red);
  }

  private startTransform(): void {
    this.cancelAttacks();
    this.stance = { kind: 'transforming', msLeft: this.def.transform.durationMs, fromHp: this.foe.hp };
    const { fx } = this.world;
    fx.flash(120, 255, 255, 255);
    fx.shake(0.008, 300);
    sfx('phase');
  }

  private transformStep(stance: Extract<Stance, { kind: 'transforming' }>, dtMs: number): void {
    const total = this.def.transform.durationMs;
    const before = total - stance.msLeft;
    stance.msLeft -= dtMs;
    const t = Math.min(total, total - stance.msLeft);
    const p = t / total;
    const s = this.foe.sprite;
    s.x = Phaser.Math.Linear(s.x, VIEW.w / 2, 0.08);
    s.y = Phaser.Math.Linear(s.y, HOME_Y, 0.08);
    const charge = p < TRANSFORM.peak ? p / TRANSFORM.peak : 1 - (p - TRANSFORM.peak) / (1 - TRANSFORM.peak);
    s.setScale(1 + 0.08 * charge + 0.03 * Math.sin(t / 40) * charge);
    this.halo
      .setPosition(s.x + (Math.random() - 0.5) * 4 * charge, s.y + (Math.random() - 0.5) * 4 * charge)
      .setScale(1.08 + 0.15 * charge)
      .setAlpha(0.3 + 0.6 * charge);
    const heal = Phaser.Math.Clamp((p - TRANSFORM.healFrom) / (TRANSFORM.healTo - TRANSFORM.healFrom), 0, 1);
    this.foe.hp = stance.fromHp + (healedHp(this.def, stance.fromHp) - stance.fromHp) * Phaser.Math.Easing.Sine.InOut(heal);
    this.shockwave(t);
    const peakMs = total * TRANSFORM.peak;
    if (before < peakMs && t >= peakMs) this.reveal();
    if (stance.msLeft <= 0) this.finishTransform(stance.fromHp);
  }

  // An expanding ring from the boss that wipes every enemy bullet it passes.
  private shockwave(t: number): void {
    const p = t / TRANSFORM.shockMs;
    if (p >= 1) return;
    const { x, y } = this.foe.sprite;
    const r = TRANSFORM.shockReach * Phaser.Math.Easing.Quadratic.Out(p);
    const g = this.gfx;
    g.lineStyle(10, this.look.glow, 0.35 * (1 - p)).strokeCircle(x, y, r);
    g.lineStyle(3, COLORS.white, 0.9 * (1 - p)).strokeCircle(x, y, r);
    for (const b of this.world.enemyShots.list) {
      if (!b.alive || (b.sprite.x - x) ** 2 + (b.sprite.y - y) ** 2 > r * r) continue;
      this.world.enemyShots.kill(b);
      this.world.fx.spark(b.sprite.x, b.sprite.y, 2);
    }
  }

  // The peak: the second form appears through a white flash and the HUD takes its name.
  private reveal(): void {
    this.form = 1;
    const { scene, fx } = this.world;
    const { texture, name } = this.current;
    const s = this.foe.sprite;
    fx.flash(320, 255, 255, 255);
    fx.shake(0.02, 500);
    fx.explode(s.x, s.y, 'big');
    sfx('boom');
    const next = scene.add.image(s.x, s.y, texture).setDepth(DEPTH.foe).setAlpha(0).setScale(s.scale);
    this.halo.setTexture(texture).setTint(this.look.glow);
    scene.tweens.add({ targets: s, alpha: 0, duration: TRANSFORM.crossfadeMs });
    scene.tweens.add({
      targets: next,
      alpha: 1,
      duration: TRANSFORM.crossfadeMs,
      onUpdate: () => next.setPosition(s.x, s.y).setScale(s.scale),
      onComplete: () => {
        s.setTexture(texture).setAlpha(1);
        next.destroy();
      },
    });
    banner(scene, name, this.look.subtitle, css(this.look.glow), 1000, 26);
  }

  private finishTransform(fromHp: number): void {
    this.foe.sprite.setScale(1);
    this.halo.setScale(1.08);
    this.foe.hp = healedHp(this.def, fromHp);
    this.phase = bossPhaseAt(this.def, this.form, this.hpRatio);
    this.patternIndex = 0;
    this.stance = { kind: 'fighting', gapMs: 900 };
    this.summon(this.def.transform.summon);
  }

  private deflect(): true {
    this.deflected++;
    const now = this.world.scene.time.now;
    if (now - this.lastImmuneFloatAt > IMMUNE_FLOAT_GAP_MS) {
      this.lastImmuneFloatAt = now;
      const s = this.foe.sprite;
      this.world.fx.float(s.x + (Math.random() - 0.5) * 60, s.y + s.displayHeight * 0.3, 'IMMUNE', COLORS.steel);
    }
    return true;
  }

  // Stops every attack in flight: pending bursts, beams, the well and a special still charging.
  private cancelAttacks(): void {
    for (const t of this.timers) t.remove();
    this.timers = [];
    this.beams = [];
    this.well = null;
    if (this.stance.kind === 'casting') this.stance.callout.destroy();
    this.foe.sprite.setScale(1);
  }

  // Runs the next pattern of the cycle, or starts charging it when it is a special.
  private nextPattern(stance: Extract<Stance, { kind: 'fighting' }>): void {
    const phase = this.current.phases[this.phase]!;
    const pattern = phase.patterns[this.patternIndex % phase.patterns.length]!;
    this.patternIndex++;
    stance.gapMs = phase.patternGapMs;
    const { cast } = PATTERNS[pattern];
    if (!cast) return PATTERNS[pattern].run(this);
    const s = this.foe.sprite;
    const callout = label(this.world.scene, s.x, Math.max(CALLOUT_MIN_Y, s.y - s.displayHeight / 2 - 16), cast.callout, {
      size: 18,
      bold: true,
      color: css(this.look.glow),
      align: 'center',
      stroke: '#0d0b26',
    }).setDepth(DEPTH.fx);
    callout.setOrigin(0.5).setScale(0);
    this.world.scene.tweens.add({ targets: callout, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.stance = { kind: 'casting', pattern, msLeft: cast.chargeMs, aim: cast.aim(this), callout, convergeMs: 0 };
    sfx('phase');
  }

  // The charge: the boss holds still and pulses in its form's glow while light gathers into it and the telegraph
  // shows where the attack lands. Then it releases with a flash.
  private castStep(stance: Extract<Stance, { kind: 'casting' }>, dtMs: number): void {
    const cast = PATTERNS[stance.pattern].cast!;
    stance.msLeft -= dtMs;
    const p = Math.min(1, 1 - stance.msLeft / cast.chargeMs);
    const s = this.foe.sprite;
    const beat = 0.5 - 0.5 * Math.cos(p * Math.PI * (4 + 4 * p));
    s.setScale(1 + CAST.pulse * beat);
    this.halo.setPosition(s.x, s.y).setScale(1.1 + 0.12 * beat).setAlpha(0.45 + 0.45 * beat);
    cast.telegraph(this, stance.aim, this.gfx, p);
    if ((stance.convergeMs -= dtMs) <= 0) {
      stance.convergeMs = CAST.convergeEveryMs;
      this.converge();
    }
    if (stance.msLeft > 0) return;
    s.setScale(1);
    this.halo.setScale(1.08);
    const { callout } = stance;
    this.world.scene.tweens.add({ targets: callout, y: callout.y - 18, alpha: 0, duration: 360, onComplete: () => callout.destroy() });
    const glow = Phaser.Display.Color.IntegerToRGB(this.look.glow);
    this.world.fx.flash(140, glow.r, glow.g, glow.b);
    this.world.fx.shake(CAST.releaseShake, 220);
    sfx('boom');
    this.stance = { kind: 'fighting', gapMs: this.current.phases[this.phase]!.patternGapMs };
    PATTERNS[stance.pattern].run(this, stance.aim);
  }

  // One mote of light flies in from a ring around the boss.
  private converge(): void {
    const { scene } = this.world;
    const s = this.foe.sprite;
    const a = Math.random() * Math.PI * 2;
    const r = s.displayWidth * (0.6 + Math.random() * 0.35);
    const mote = scene.add
      .image(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 'spark')
      .setTint(Math.random() < 0.5 ? this.look.glow : COLORS.white)
      .setScale(2.4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.fx);
    scene.tweens.add({ targets: mote, x: s.x, y: s.y, scale: 0.4, alpha: 0.2, duration: 380, ease: 'Quad.easeIn', onComplete: () => mote.destroy() });
  }

  private updateBeams(dtMs: number): void {
    const g = this.gfx;
    const { player } = this.world;
    for (const beam of this.beams) {
      beam.t += dtMs;
      const from = beam.origin === 'muzzle' ? this.muzzle : beam.origin;
      const sweepT = beam.t - beam.telegraphMs;
      const k = Phaser.Math.Clamp(sweepT / beam.sweepMs, 0, 1);
      const to = rayEnd(from, 180 - Phaser.Math.Linear(beam.fromDeg, beam.toDeg, k), BEAM.length);
      if (sweepT < 0) {
        const blink = Math.floor(sweepT / 90) % 2 === 0;
        g.lineStyle(2, this.look.beam, blink ? 0.9 : 0.35).lineBetween(from.x, from.y, to.x, to.y);
        g.fillStyle(this.look.beam, 0.5).fillCircle(from.x, from.y, 4 + beam.t / 60);
        continue;
      }
      const w = BEAM.width * (1 + Math.sin(this.world.scene.time.now / 25) * 0.15);
      g.lineStyle(w + 12, this.look.beam, 0.3).lineBetween(from.x, from.y, to.x, to.y);
      g.lineStyle(w, this.look.beam, 0.85).lineBetween(from.x, from.y, to.x, to.y);
      g.lineStyle(w * 0.35, COLORS.white, 1).lineBetween(from.x, from.y, to.x, to.y);
      if (distanceToSegment(player, from, to) <= w / 2 + player.coreRadius) this.world.hurtPlayer();
    }
    this.beams = this.beams.filter((b) => b.t < b.telegraphMs + b.sweepMs);
  }

  // The well pulls the ship (slower than it can fly, and never while dashing) and bends enemy bullets into its core,
  // which swallows them. It never hurts the ship itself.
  private updateWell(dtMs: number): void {
    const well = this.well;
    if (!well) return;
    const dt = dtMs / 1000;
    well.msLeft -= dtMs;
    well.spin += dt * 3;
    const { at } = well;
    const { world } = this;
    const fade = Math.min(1, well.msLeft / 300, (well.fullMs - well.msLeft) / 200);
    const p = world.player;
    const toShip = Math.hypot(at.x - p.x, at.y - p.y);
    if (!world.dash.active && toShip > 4 && toShip < WELL.pullRadius * 1.8) {
      const pull = (WELL.shipPull * fade * dt) / toShip;
      p.nudge({ x: (at.x - p.x) * pull, y: (at.y - p.y) * pull });
    }
    for (const b of world.enemyShots.list) {
      if (!b.alive) continue;
      const dx = at.x - b.sprite.x;
      const dy = at.y - b.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d < WELL.coreRadius) {
        world.enemyShots.kill(b);
        continue;
      }
      if (d > WELL.pullRadius) continue;
      const a = (WELL.bulletPull * (1 - d / WELL.pullRadius) * fade * dt) / d;
      b.vx += dx * a;
      b.vy += dy * a;
    }
    const g = this.gfx;
    g.fillStyle(this.look.beam, 0.07 * fade).fillCircle(at.x, at.y, WELL.pullRadius);
    g.lineStyle(1, this.look.beam, 0.35 * fade).strokeCircle(at.x, at.y, WELL.pullRadius);
    for (let i = 0; i < 3; i++) {
      const r = WELL.coreRadius + 10 + i * 16;
      const start = well.spin * (1.6 - i * 0.4) + i * 2;
      g.lineStyle(3 - i * 0.6, i === 0 ? COLORS.gold : this.look.beam, 0.9 * fade).beginPath().arc(at.x, at.y, r, start, start + 2.2).strokePath();
      g.beginPath().arc(at.x, at.y, r, start + Math.PI, start + Math.PI + 2.2).strokePath();
    }
    g.fillStyle(COLORS.violet, 0.8 * fade).fillCircle(at.x, at.y, WELL.coreRadius + 4);
    g.fillStyle(0x05040f, fade).fillCircle(at.x, at.y, WELL.coreRadius);
    if (well.msLeft <= 0) this.well = null;
  }

  private updateMinion(m: Minion, dtMs: number): void {
    const s = m.foe.sprite;
    m.t += dtMs;
    s.x = Phaser.Math.Linear(s.x, m.tx + Math.sin(m.t / 600) * 30, 0.04);
    s.y = Phaser.Math.Linear(s.y, m.ty + Math.cos(m.t / 500) * 10, 0.04);
    hop(s, beatAt(m.t, 400));
    if ((m.fireCd -= dtMs) <= 0) {
      m.fireCd = 1400 + Math.random() * 1200;
      enemyFire(this.world, m.kind, s.x, s.y + 10);
    }
  }

  private die(): void {
    if (this.stance.kind === 'dead') return;
    this.cancelAttacks();
    this.stance = { kind: 'dead' };
    this.halo.setVisible(false);
    this.gfx.clear();
    for (const m of this.minions) this.world.damage(m.foe, m.foe.hp, 'bullet');
    const { x, y } = this.foe.sprite;
    for (let i = 0; i < 6; i++)
      this.world.scene.time.delayedCall(i * 140, () => this.world.fx.explode(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 80, 'big'));
    this.world.fx.flash(400, 255, 255, 255);
  }
}
