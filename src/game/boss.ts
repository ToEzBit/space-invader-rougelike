import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { BOSSES, ENEMIES, type BossDef, type BossId, type BossPattern, type BossStage } from '../core/stages';
import { BOSS_SPRITE, ENEMY_FRAMES } from '../art/sprites';
import { COLORS } from '../art/palette';
import { VIEW } from '../view';
import type { BulletKind } from './bullets';
import type { Encounter } from './encounter';
import { enemyFire } from './formation';
import { distanceToSegment, rayEnd, type Point } from './geometry';
import { BOSS_RADIUS, FOE_RADIUS } from './hitbox';
import { hpRatio } from './hpBar';
import { DEPTH } from './layout';
import { bossPhaseIndex } from './phases';
import type { Foe, World } from './world';

const HOME_Y = 138;
const ENTER_SPEED = 70;
const MAX_MINIONS = 6;
const MINION_HP_SCALE = 2;
const SWEEP = { telegraphMs: 850, sweepMs: 1500, fromDeg: -55, toDeg: 55, width: 18, length: 900 } as const;

const BOSS_LOOK: Record<BossId, { orb: BulletKind; beam: number; glow: number }> = {
  crimsonSeraph: { orb: 'orb', beam: COLORS.red, glow: COLORS.pink },
  voidEmpress: { orb: 'voidOrb', beam: COLORS.violet, glow: COLORS.cyan },
};

// Angles here are screen angles in degrees where 0 points straight down at the player.
type SweepBeam =
  | { kind: 'idle' }
  | { kind: 'telegraph'; msLeft: number; angle: number }
  | { kind: 'sweeping'; msLeft: number; angle: number; dir: 1 | -1 };

type Minion = { foe: Foe; tx: number; ty: number; t: number; fireCd: number };

const PATTERNS: Record<BossPattern, (b: BossFight) => void> = {
  fanSpread: (b) => {
    const waves = b.phase + 1;
    for (let w = 0; w < waves; w++)
      b.after(w * 260, () => {
        const count = 9 + w;
        for (let i = 0; i < count; i++) b.shoot(b.look.orb, b.muzzle, -55 + (110 * i) / (count - 1), 165);
      });
  },
  aimedBurst: (b) => {
    b.repeat(6, 110, () => b.shoot('needle', b.muzzle, b.aimAtPlayer(), 270));
  },
  summonDrones: (b) => b.summon(3 + b.phase),
  spiral: (b) => {
    let angle = 0;
    b.repeat(26, 65, () => {
      for (const arm of [0, 120, 240]) b.shoot(b.look.orb, b.muzzle, angle + arm, 150);
      angle += 17;
    });
  },
  sweepLaser: (b) => b.startSweep(),
  bulletRain: (b) => {
    b.repeat(24, 80, () => {
      const x = 20 + Math.random() * (VIEW.w - 40);
      b.world.enemyShots.spawn({ kind: 'pellet', x, y: 40, vx: 0, vy: 170 + Math.random() * 70 });
    });
  },
};

export class BossFight implements Encounter {
  readonly boss = this;
  readonly def: BossDef;
  readonly foe: Foe;
  readonly look: (typeof BOSS_LOOK)[BossId];
  readonly breached = false;
  phase = 0;
  private stance: 'entering' | 'fighting' | 'dead' = 'entering';
  private patternIndex = 0;
  private gapMs = 1200;
  private t = 0;
  private sweep: SweepBeam = { kind: 'idle' };
  private minions: Minion[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly halo: Phaser.GameObjects.Image;

  constructor(
    readonly world: World,
    stage: BossStage,
  ) {
    this.def = BOSSES[stage.boss];
    this.look = BOSS_LOOK[stage.boss];
    this.foe = world.addFoe(BOSS_SPRITE[stage.boss], VIEW.w / 2, -70, this.def.hp, 0, BOSS_RADIUS, 'big');
    this.foe.hpBar = { kind: 'hud' };
    this.halo = world.scene.add
      .image(VIEW.w / 2, -70, BOSS_SPRITE[stage.boss])
      .setTint(this.look.glow)
      .setTintMode(Phaser.TintModes.FILL)
      .setAlpha(0.25)
      .setScale(1.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.foe - 1);
    this.gfx = world.scene.add.graphics().setDepth(DEPTH.beam);
  }

  get name(): string {
    return this.def.name;
  }

  get hpRatio(): number {
    return hpRatio(this.foe);
  }

  get cleared(): boolean {
    return this.foe.dead;
  }

  get muzzle(): Point {
    return { x: this.foe.sprite.x, y: this.foe.sprite.y + 30 };
  }

  update(dtMs: number): void {
    this.minions = this.minions.filter((m) => !m.foe.dead);
    if (this.foe.dead) return this.die();
    this.t += dtMs;
    const s = this.foe.sprite;
    if (this.stance === 'entering') {
      s.y = Math.min(HOME_Y, s.y + (ENTER_SPEED * dtMs) / 1000);
      if (s.y >= HOME_Y) [this.stance, this.t] = ['fighting', 0];
    } else {
      const reach = Math.min(110 + this.phase * 15, VIEW.w / 2 - this.halo.displayWidth / 2 - 6);
      s.x = VIEW.w / 2 + Math.sin(this.t / 1500) * reach;
      s.y = HOME_Y + Math.sin(this.t / 700) * 10;
      this.advancePhase();
      this.nextPattern(dtMs);
    }
    this.halo.setPosition(s.x, s.y).setAlpha(0.18 + Math.sin(this.t / 200) * 0.08 + this.phase * 0.08);
    this.updateSweep(dtMs);
    for (const m of this.minions) this.updateMinion(m, dtMs);
  }

  shoot(kind: BulletKind, from: Point, angleDeg: number, speed: number): void {
    const rad = Phaser.Math.DegToRad(90 + angleDeg);
    this.world.enemyShots.spawn({ kind, x: from.x, y: from.y, vx: Math.cos(rad) * speed, vy: Math.sin(rad) * speed });
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
    const def = ENEMIES.drone;
    for (let i = 0; i < Math.min(count, room); i++) {
      const s = this.foe.sprite;
      const foe = this.world.addFoe(ENEMY_FRAMES.drone[0], s.x, s.y, def.hp * MINION_HP_SCALE, def.coin, FOE_RADIUS.drone);
      this.minions.push({ foe, tx: 50 + Math.random() * (VIEW.w - 100), ty: 210 + Math.random() * 90, t: Math.random() * 1000, fireCd: 900 + Math.random() * 900 });
    }
    this.world.fx.spark(this.foe.sprite.x, this.foe.sprite.y, 20);
  }

  startSweep(): void {
    if (this.sweep.kind !== 'idle') return;
    const flip = Math.random() < 0.5 ? 1 : -1;
    this.sweep = { kind: 'telegraph', msLeft: SWEEP.telegraphMs, angle: SWEEP.fromDeg * flip };
  }

  private advancePhase(): void {
    const next = bossPhaseIndex(this.def.phases, this.hpRatio);
    if (next <= this.phase) return;
    this.phase = next;
    this.patternIndex = 0;
    this.gapMs = 900;
    const { fx } = this.world;
    fx.flash(200, 255, 255, 255);
    sfx('phase');
    fx.shake(0.015, 450);
    fx.explode(this.foe.sprite.x, this.foe.sprite.y, 'big');
    fx.float(this.foe.sprite.x, this.foe.sprite.y - 60, `PHASE ${next + 1}`, COLORS.red);
  }

  private nextPattern(dtMs: number): void {
    if ((this.gapMs -= dtMs) > 0) return;
    const phase = this.def.phases[this.phase]!;
    const pattern = phase.patterns[this.patternIndex % phase.patterns.length]!;
    this.patternIndex++;
    this.gapMs = phase.patternGapMs;
    PATTERNS[pattern](this);
  }

  private updateSweep(dtMs: number): void {
    const g = this.gfx.clear();
    const s = this.sweep;
    if (s.kind === 'idle') return;
    const from = this.muzzle;
    const to = rayEnd(from, 180 - s.angle, SWEEP.length);
    if (s.kind === 'telegraph') {
      const blink = Math.floor(s.msLeft / 90) % 2 === 0;
      g.lineStyle(2, this.look.beam, blink ? 0.9 : 0.35).lineBetween(from.x, from.y, to.x, to.y);
      g.fillStyle(this.look.beam, 0.5).fillCircle(from.x, from.y, 4 + (SWEEP.telegraphMs - s.msLeft) / 60);
      if ((s.msLeft -= dtMs) <= 0) this.sweep = { kind: 'sweeping', msLeft: SWEEP.sweepMs, angle: s.angle, dir: s.angle < 0 ? 1 : -1 };
      return;
    }
    const total = SWEEP.toDeg - SWEEP.fromDeg;
    s.angle += (s.dir * total * dtMs) / SWEEP.sweepMs;
    const w = SWEEP.width * (1 + Math.sin(this.t / 25) * 0.15);
    g.lineStyle(w + 12, this.look.beam, 0.3).lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(w, this.look.beam, 0.85).lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(w * 0.35, COLORS.white, 1).lineBetween(from.x, from.y, to.x, to.y);
    const { player } = this.world;
    if (distanceToSegment(player, from, to) <= w / 2 + player.coreRadius) this.world.hurtPlayer();
    if ((s.msLeft -= dtMs) <= 0) this.sweep = { kind: 'idle' };
  }

  private updateMinion(m: Minion, dtMs: number): void {
    const s = m.foe.sprite;
    m.t += dtMs;
    s.x = Phaser.Math.Linear(s.x, m.tx + Math.sin(m.t / 600) * 30, 0.04);
    s.y = Phaser.Math.Linear(s.y, m.ty + Math.cos(m.t / 500) * 10, 0.04);
    s.setTexture(ENEMY_FRAMES.drone[Math.floor(m.t / 400) % 2 ? 1 : 0]);
    if ((m.fireCd -= dtMs) <= 0) {
      m.fireCd = 1400 + Math.random() * 1200;
      enemyFire(this.world, 'drone', s.x, s.y + 10);
    }
  }

  private die(): void {
    if (this.stance === 'dead') return;
    this.stance = 'dead';
    this.halo.setVisible(false);
    this.sweep = { kind: 'idle' };
    this.gfx.clear();
    for (const t of this.timers) t.remove();
    for (const m of this.minions) this.world.damage(m.foe, m.foe.hp, 'bullet');
    const { x, y } = this.foe.sprite;
    for (let i = 0; i < 6; i++)
      this.world.scene.time.delayedCall(i * 140, () => this.world.fx.explode(x + (Math.random() - 0.5) * 100, y + (Math.random() - 0.5) * 80, 'big'));
    this.world.fx.flash(400, 255, 255, 255);
  }
}
