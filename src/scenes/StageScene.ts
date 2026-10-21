import Phaser from 'phaser';
import { clearStage, failRun, type RunState } from '../core/run';
import { stageDef, STAGE_COUNT } from '../core/stages';
import { COLORS, css } from '../art/palette';
import { setDebugHooks } from '../debug';
import { KeyboardControls } from '../game/controls';
import { createEncounter, type Encounter } from '../game/encounter';
import { World } from '../game/world';
import { Backdrop } from '../ui/backdrop';
import { banner } from '../ui/banner';
import { Hud } from '../ui/hud';
import { fitCamera } from '../view';
import { goTo, type RunData } from './flow';

const INTRO_MS = 1200;
const OUTRO_MS = 1900;
const MAX_FRAME_MS = 50;

// Only the exit from 'fighting' produces the next RunState, so a stage ends exactly once.
type Life =
  | { kind: 'intro'; msLeft: number }
  | { kind: 'fighting' }
  | { kind: 'ending'; msLeft: number; next: RunState }
  | { kind: 'leaving' };

export class StageScene extends Phaser.Scene {
  private run!: RunState;
  private world!: World;
  private encounter!: Encounter;
  private hud!: Hud;
  private backdrop!: Backdrop;
  private controls!: KeyboardControls;
  private life: Life = { kind: 'fighting' };

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
    this.life = { kind: 'intro', msLeft: INTRO_MS };
    const final = this.run.stage === STAGE_COUNT;
    banner(
      this,
      def.kind === 'boss' ? 'WARNING' : `STAGE ${this.run.stage}`,
      def.kind === 'boss' ? (final ? 'บอสสุดท้ายกำลังมา!' : 'บอสกำลังเข้ามา!') : 'กำจัดผู้รุกรานให้หมด!',
      css(def.kind === 'boss' ? COLORS.red : COLORS.cyan),
      INTRO_MS - 300,
    );
    setDebugHooks(this, {
      run: () => this.world.run,
      info: () => ({
        life: this.life.kind,
        foes: this.world.foes.length,
        coins: this.world.coins,
        boss: this.encounter.boss && { name: this.encounter.boss.name, hpRatio: this.encounter.boss.hpRatio, phase: this.encounter.boss.phase },
      }),
      kill: () => this.world.killAll(),
      hurt: () => this.world.hurtPlayer(true),
      bossHp: (ratio) => {
        const boss = this.encounter.boss;
        if (boss) boss.foe.hp = boss.foe.maxHp * ratio;
      },
    });
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(delta, MAX_FRAME_MS);
    const input = this.controls.read();
    this.backdrop.update(dtMs / 1000, 1.5);
    const life = this.life;
    switch (life.kind) {
      case 'intro':
        this.world.update(dtMs, input);
        this.world.resolveCollisions();
        if ((life.msLeft -= dtMs) <= 0) this.life = { kind: 'fighting' };
        break;
      case 'fighting':
        this.world.update(dtMs, input);
        this.encounter.update(dtMs);
        this.world.resolveCollisions();
        this.checkEnd();
        break;
      case 'ending':
        this.world.update(dtMs, { ...input, fire: false, dash: false });
        if ((life.msLeft -= dtMs) <= 0) {
          this.life = { kind: 'leaving' };
          goTo(this, life.next);
        }
        break;
      case 'leaving':
        break;
    }
    this.hud.update();
  }

  private checkEnd(): void {
    const { world } = this;
    if (world.run.phase.kind === 'defeat') return this.end(world.run);
    if (this.encounter.breached) return this.end(failRun(world.run));
    if (this.encounter.cleared) return this.end(clearStage(world.run, world.coins));
  }

  private end(next: RunState): void {
    this.life = { kind: 'ending', msLeft: OUTRO_MS, next };
    this.world.enemyShots.clear();
    if (next.phase.kind === 'defeat') {
      this.world.fx.explode(this.world.player.x, this.world.player.y, 'big');
      this.world.player.vanish();
      banner(this, 'SHIP DOWN', 'ยานของคุณถูกทำลาย', css(COLORS.red), OUTRO_MS - 600);
      return;
    }
    const earned = next.money - this.run.money;
    banner(this, next.phase.kind === 'victory' ? 'VICTORY!' : 'STAGE CLEAR', `ได้รับ +${earned} เหรียญ`, css(COLORS.yellow), OUTRO_MS - 600);
  }
}
