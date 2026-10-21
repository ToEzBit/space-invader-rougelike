import Phaser from 'phaser';
import { PERKS, PERK_IDS } from '../core/perks';
import type { RunState } from '../core/run';
import { STAGE_COUNT } from '../core/stages';
import { COLORS, css } from '../art/palette';
import type { SpriteKey } from '../art/sprites';
import { setDebugHooks } from '../debug';
import { Backdrop } from '../ui/backdrop';
import { label } from '../ui/text';
import { fitCamera, VIEW } from '../view';
import type { RunData } from './flow';

type Ending = 'victory' | 'defeat';

const ENDING: Record<Ending, { title: string; subtitle: string; color: number; hero: SpriteKey; heroY: number }> = {
  victory: { title: 'VICTORY!', subtitle: 'คุณปกป้องกาแล็กซีได้สำเร็จ!', color: COLORS.yellow, hero: 'voidEmpress', heroY: 240 },
  defeat: { title: 'GAME OVER', subtitle: 'ยานของคุณถูกทำลาย...', color: COLORS.red, hero: 'gunner0', heroY: 236 },
};

export class EndScene extends Phaser.Scene {
  private run!: RunState;
  private backdrop!: Backdrop;
  private leaving = false;

  constructor() {
    super('End');
  }

  init(data: RunData): void {
    this.run = data.run;
  }

  create(): void {
    fitCamera(this);
    this.leaving = false;
    this.backdrop = new Backdrop(this);
    const ending: Ending = this.run.phase.kind === 'victory' ? 'victory' : 'defeat';
    const look = ENDING[ending];
    const cx = VIEW.w / 2;

    const title = label(this, cx, 70, look.title, { size: 48, bold: true, color: css(look.color), align: 'center', stroke: '#0d0b26' });
    this.tweens.add({ targets: title, scale: { from: 0.4, to: 1 }, duration: 500, ease: 'Back.easeOut' });
    label(this, cx, 136, look.subtitle, { size: 16, color: '#ffffff', align: 'center' });

    const hero = this.add.image(cx, look.heroY, look.hero).setScale(ending === 'victory' ? 1 : 2.5);
    if (ending === 'victory') {
      hero.setAlpha(0.5).setTint(0x8888aa);
      this.add.image(cx, 330, 'player').setScale(1.5);
      const sparkle = this.add.particles(cx, 320, 'spark', {
        lifespan: 1200,
        speed: { min: 30, max: 140 },
        scale: { start: 2.5, end: 0 },
        frequency: 60,
        tint: [COLORS.yellow, COLORS.cyan, COLORS.pink, COLORS.white],
        blendMode: Phaser.BlendModes.ADD,
      });
      sparkle.setDepth(-1);
    } else {
      this.tweens.add({ targets: hero, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const reached = ending === 'victory' ? STAGE_COUNT : this.run.stage;
    const lines = [`ด่านที่ไปถึง  ${reached}/${STAGE_COUNT}`, `เหรียญคงเหลือ  ${this.run.money}`];
    lines.forEach((line, i) => label(this, cx, 392 + i * 26, line, { size: 16, bold: true, color: '#e3c6ff', align: 'center' }));

    const owned = PERK_IDS.filter((id) => this.run.perks[id]);
    const perkLine = owned.map((id) => `${PERKS[id].name} ${this.run.perks[id]}`).join(' · ') || 'ไม่มีอัปเกรด';
    label(this, cx, 452, perkLine, { size: 12, color: '#c9d4ff', align: 'center', wrap: VIEW.w - 60 });

    const prompt = label(this, cx, 572, 'ENTER หรือคลิก · เล่นอีกครั้ง', { size: 18, bold: true, color: '#ffffff', align: 'center', stroke: '#d81b8c' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.input.keyboard?.once('keydown-ENTER', () => this.restart());
    this.input.once('pointerdown', () => this.restart());
    setDebugHooks(this, { run: () => this.run });
  }

  update(_time: number, delta: number): void {
    this.backdrop.update(Math.min(delta, 50) / 1000, 0.5);
  }

  private restart(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(220, 7, 6, 26);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
  }
}
