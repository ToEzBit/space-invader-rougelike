import Phaser from 'phaser';
import { cueFor } from '../audio/director';
import { want } from '../audio/music';
import { speak, type Speech } from '../audio/voice';
import { clearStage, failRun, type RunState } from '../core/run';
import { stageDef, STAGE_COUNT } from '../core/stages';
import { COLORS, css } from '../art/palette';
import { CUT_IN, CUT_IN_MS, cutInPose } from '../core/cutIn';
import { setDebugHooks } from '../debug';
import { KeyboardControls } from '../game/controls';
import { CutIn } from '../game/cutIn';
import { createEncounter, type Encounter } from '../game/encounter';
import { hpRatio, visibleBar } from '../game/hpBar';
import type { Bullet } from '../game/bullets';
import { World, type Foe } from '../game/world';
import { Backdrop } from '../ui/backdrop';
import { banner } from '../ui/banner';
import { Hud, SKILL_SLOTS } from '../ui/hud';
import { fitCamera } from '../view';
import { goTo, type RunData } from './flow';

const INTRO_MS = 1200;
const OUTRO_MS = 1900;
const MAX_FRAME_MS = 50;

// Only the exit from 'fighting' produces the next RunState, so a stage ends exactly once.
type Life =
  | { kind: 'intro'; msLeft: number }
  | { kind: 'fighting' }
  | { kind: 'cutIn'; elapsedMs: number; totalMs: number; speech: Speech | null }
  | { kind: 'ending'; msLeft: number; next: RunState }
  | { kind: 'leaving' };

export class StageScene extends Phaser.Scene {
  private run!: RunState;
  private world!: World;
  private encounter!: Encounter;
  private hud!: Hud;
  private backdrop!: Backdrop;
  private controls!: KeyboardControls;
  private cutIn!: CutIn;
  private life: Life = { kind: 'fighting' };
  // Dev-only: game time spent fighting, in capped frame deltas, and how many frames hit the cap.
  private clock = { fightMs: 0, frames: 0, capped: 0 };

  constructor() {
    super('Stage');
  }

  init(data: RunData): void {
    this.run = data.run;
  }

  create(): void {
    fitCamera(this);
    this.backdrop = new Backdrop(this);
    this.world = new World(this, this.run);
    const def = stageDef(this.run.stage);
    this.encounter = createEncounter(this.world, def);
    this.hud = new Hud(this, this.world, this.encounter.boss);
    this.controls = new KeyboardControls(this);
    this.cutIn = new CutIn(this);
    this.setLife({ kind: 'intro', msLeft: INTRO_MS });
    this.clock = { fightMs: 0, frames: 0, capped: 0 };
    const final = this.run.stage === STAGE_COUNT;
    banner(
      this,
      def.kind === 'boss' ? 'WARNING' : `STAGE ${this.run.stage}`,
      def.kind === 'boss' ? (final ? 'บอสสุดท้ายกำลังมา!' : 'บอสกำลังเข้ามา!') : 'กำจัดผู้รุกรานให้หมด!',
      css(def.kind === 'boss' ? COLORS.red : COLORS.cyan),
      INTRO_MS - 300,
    );
    const foeIds = new WeakMap<Foe, number>();
    let nextFoeId = 0;
    const foeId = (foe: Foe) => {
      if (!foeIds.has(foe)) foeIds.set(foe, nextFoeId++);
      return foeIds.get(foe)!;
    };
    const shotIds = new WeakMap<Bullet, number>();
    let nextShotId = 0;
    const shotId = (b: Bullet) => {
      if (!shotIds.has(b)) shotIds.set(b, nextShotId++);
      return shotIds.get(b)!;
    };
    setDebugHooks(this, {
      run: () => this.world.run,
      info: () => ({
        life: this.life.kind,
        cutInMs: this.life.kind === 'cutIn' ? this.life.elapsedMs : null,
        cutInTotalMs: this.life.kind === 'cutIn' ? this.life.totalMs : null,
        foes: this.world.foes.length,
        foeSpots: this.world.foes.map((foe) => ({ x: foe.sprite.x, y: foe.sprite.y })),
        coins: this.world.coins,
        player: { x: this.world.player.x, y: this.world.player.y },
        laserFiring: this.world.laser.firing,
        dashing: this.world.dash.active,
        items: this.world.run.items,
        buffs: this.world.activeBuffs.map(({ buff, msLeft }) => ({ buff, msLeft })),
        shieldMs: this.world.player.shieldMs,
        hpBars: this.world.foes
          .filter((foe) => !foe.dead && foe.hp < foe.maxHp)
          .map((foe) => {
            const bar = visibleBar(foe);
            const { x, y } = foe.sprite;
            return { id: foeId(foe), x, y, maxHp: foe.maxHp, hpRatio: hpRatio(foe), bar: foe.hpBar.kind, ...(bar && { chipRatio: bar.chip, msLeft: bar.msLeft }) };
          }),
        stats: { moveSpeed: this.world.stats.moveSpeed, bulletDamage: this.world.stats.bulletDamage, fireIntervalMs: this.world.stats.fireIntervalMs, pierce: this.world.stats.pierce },
        transAm: this.world.transAm,
        boss: this.encounter.boss && {
          name: this.encounter.boss.name,
          form: this.encounter.boss.form,
          hpRatio: this.encounter.boss.hpRatio,
          phase: this.encounter.boss.phase,
          stance: this.encounter.boss.stanceKind,
          minions: this.encounter.boss.minionCount,
          deflected: this.encounter.boss.deflected,
          ...this.encounter.boss.casting,
          motion: this.encounter.boss.motion,
          hitFlash: this.encounter.boss.foe.flashMs > 0,
          x: this.encounter.boss.foe.sprite.x,
          y: this.encounter.boss.foe.sprite.y,
          maxHp: this.encounter.boss.foe.maxHp,
        },
        flashing: this.cameras.main.flashEffect.isRunning,
        god: this.world.god,
        tally: this.world.tally,
        clock: this.clock,
        skills: SKILL_SLOTS.flatMap(({ id, meter }) => {
          const m = meter(this.world);
          return m ? [{ id, kind: m.kind, ...(m.kind === 'cooling' && { msLeft: m.msLeft }) }] : [];
        }),
      }),
      kill: () => this.world.killAll(),
      hurt: () => this.world.hurtPlayer(true),
      hit: () => this.world.hurtPlayer(),
      bossHp: (ratio) => {
        const boss = this.encounter.boss;
        if (boss) boss.foe.hp = boss.foe.maxHp * ratio;
      },
      bossPattern: (pattern) => this.encounter.boss?.devPlay(pattern),
      god: (on) => {
        this.world.god = on;
      },
      transAmGauge: (value) => this.world.setTransAmGauge(value),
      shots: () => this.world.enemyShots.list.filter((b) => b.alive).map((b) => ({ id: shotId(b), kind: b.kind, x: b.sprite.x, y: b.sprite.y })),
    });
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, MAX_FRAME_MS);
    const life = this.life;
    if (life.kind === 'cutIn') {
      // Dash and item presses stay queued for the first frame after; a Space press would only be refused then.
      this.controls.dropTransAm();
      // A voiced cut-in keeps to the audio clock its line plays on, so dropped frames cannot land the shout early.
      life.elapsedMs = Math.max(life.elapsedMs + dtMs, life.speech?.elapsedMs() ?? 0);
      const pose = cutInPose(life.elapsedMs, life.totalMs);
      this.cutIn.draw(pose, life.elapsedMs);
      if (!pose) this.setLife({ kind: 'fighting' });
      this.hud.update();
      return;
    }
    const input = this.controls.read();
    this.backdrop.update(dtMs / 1000, 1.5);
    switch (life.kind) {
      case 'intro':
        this.world.update(dtMs, input, false);
        this.world.resolveCollisions();
        if ((life.msLeft -= dtMs) <= 0) this.setLife({ kind: 'fighting' });
        break;
      case 'fighting':
        this.clock.fightMs += dtMs;
        this.clock.frames++;
        if (delta > MAX_FRAME_MS) this.clock.capped++;
        for (const id of input.useItems) if (!this.world.useItem(id)) this.hud.refuseItem(id);
        this.world.update(dtMs, input, true);
        this.encounter.update(dtMs);
        this.world.resolveCollisions();
        this.checkEnd();
        break;
      case 'ending':
        this.world.update(dtMs, { ...input, dash: false }, false);
        if ((life.msLeft -= dtMs) <= 0) {
          this.setLife({ kind: 'leaving' });
          goTo(this, life.next);
        }
        break;
      case 'leaving':
        break;
    }
    if (input.transAm) this.pressTransAm();
    want(cueFor(this.encounter.boss));
    this.hud.update();
  }

  // After the frame's own update, so the stage freezes on the frame Space was pressed in.
  private pressTransAm(): void {
    if (this.life.kind !== 'fighting' || !this.world.activateTransAm()) return this.hud.refuseTransAm();
    // The pilot speaks as the band comes in, and the stage stays frozen until her shout.
    const speech = speak(CUT_IN.dimMs, CUT_IN_MS);
    this.setLife({ kind: 'cutIn', elapsedMs: 0, totalMs: speech?.shoutAtMs ?? CUT_IN_MS, speech });
  }

  // Phaser's Clock keeps paused across a scene restart (TweenManager resets its own), so every Life change sets both.
  private setLife(next: Life): void {
    this.life = next;
    const frozen = next.kind === 'cutIn';
    this.time.paused = frozen;
    this.tweens.paused = frozen;
  }

  private checkEnd(): void {
    const { world } = this;
    if (world.run.phase.kind === 'defeat') return this.end(world.run);
    if (this.encounter.breached) return this.end(failRun(world.run));
    if (this.encounter.cleared) return this.end(clearStage(world.run, world.coins));
  }

  private end(next: RunState): void {
    this.setLife({ kind: 'ending', msLeft: OUTRO_MS, next });
    this.world.enemyShots.clear();
    if (next.phase.kind === 'defeat') {
      this.world.fx.explode(this.world.player.x, this.world.player.y, 'big');
      this.world.player.vanish();
      for (const drone of this.world.gun.drones) drone.setVisible(false);
      banner(this, 'SHIP DOWN', 'ยานของคุณถูกทำลาย', css(COLORS.red), OUTRO_MS - 600);
      return;
    }
    const earned = next.money - this.run.money;
    banner(this, next.phase.kind === 'victory' ? 'VICTORY!' : 'STAGE CLEAR', `ได้รับ +${earned} เหรียญ`, css(COLORS.yellow), OUTRO_MS - 600);
  }
}
