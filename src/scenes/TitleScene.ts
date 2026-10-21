import Phaser from 'phaser';
import { ENEMIES, type EnemyKind } from '../core/stages';
import { newRun } from '../core/run';
import { ENEMY_FRAMES } from '../art/sprites';
import { css, COLORS } from '../art/palette';
import { setDebugHooks } from '../debug';
import { Backdrop } from '../ui/backdrop';
import { label } from '../ui/text';
import { fitCamera, VIEW } from '../view';
import { goTo } from './flow';

const CONTROLS: readonly [string, string][] = [
  ['← → / A D', 'เคลื่อนที่'],
  ['SPACE (ค้าง)', 'ยิง · เลเซอร์ยิงอัตโนมัติเมื่อปลดล็อก'],
  ['SHIFT', 'พุ่งชนทะลุฝูงศัตรู (เมื่อปลดล็อก)'],
  ['1 2 3 / R / ENTER', 'ซื้อ · รีเฟรช · ไปต่อ ในร้านค้า'],
];

export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private starting = false;

  constructor() {
    super('Title');
  }

  create(): void {
    fitCamera(this);
    this.starting = false;
    this.backdrop = new Backdrop(this);
    const cx = VIEW.w / 2;

    const logo = this.add.container(cx, 64);
    logo.add(label(this, 0, 0, 'SPACE INVADER', { size: 40, bold: true, color: css(COLORS.cyan), align: 'center', stroke: '#1c2f8f' }));
    logo.add(label(this, 0, 50, 'ROGUELIKE', { size: 30, bold: true, color: css(COLORS.pink), align: 'center', stroke: '#5a22b0' }));
    this.tweens.add({ targets: logo, y: 72, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, cx, 196, 'ปกป้องกาแล็กซีจากกองทัพสาวต่างดาว · อัปเกรดแบบโร้กไลก์', { size: 13, color: '#e3c6ff', align: 'center' });

    const kinds = Object.keys(ENEMY_FRAMES) as EnemyKind[];
    const parade = kinds.map((kind, i) => {
      const x = cx + (i - (kinds.length - 1) / 2) * 96;
      const img = this.add.image(x, 252, ENEMY_FRAMES[kind][0]).setScale(1.5);
      label(this, x, 282, ENEMIES[kind].name, { size: 11, color: '#c9d4ff', align: 'center' });
      this.tweens.add({ targets: img, y: 246, duration: 700 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      return { img, kind };
    });
    let frame = 0;
    this.time.addEvent({
      delay: 420,
      loop: true,
      callback: () => {
        frame ^= 1;
        for (const { img, kind } of parade) img.setTexture(ENEMY_FRAMES[kind][frame as 0 | 1]);
      },
    });

    const ship = this.add.image(cx, 350, 'player');
    const flame = this.add.image(cx, 382, 'flame0');
    this.time.addEvent({ delay: 70, loop: true, callback: () => flame.setTexture(flame.texture.key === 'flame0' ? 'flame1' : 'flame0') });
    this.tweens.add({ targets: [ship, flame], y: '-=6', duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const panel = this.add.graphics();
    panel.fillStyle(0x0d0b26, 0.82).fillRoundedRect(40, 410, VIEW.w - 80, 142, 10);
    panel.lineStyle(2, COLORS.violet, 0.9).strokeRoundedRect(40, 410, VIEW.w - 80, 142, 10);
    label(this, cx, 418, 'CONTROLS · การควบคุม', { size: 13, bold: true, color: css(COLORS.yellow), align: 'center' });
    CONTROLS.forEach(([key, what], i) => {
      label(this, 60, 446 + i * 25, key, { size: 13, bold: true, color: css(COLORS.cyan) });
      label(this, 196, 446 + i * 25, what, { size: 13, color: '#ffffff' });
    });

    const prompt = label(this, cx, 578, 'PRESS ENTER หรือคลิกเพื่อเริ่ม', { size: 18, bold: true, color: '#ffffff', align: 'center', stroke: '#d81b8c' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    const keyboard = this.input.keyboard;
    keyboard?.once('keydown-ENTER', () => this.begin());
    keyboard?.once('keydown-SPACE', () => this.begin());
    this.input.once('pointerdown', () => this.begin());
    setDebugHooks(this, { run: () => null });
  }

  update(_time: number, delta: number): void {
    this.backdrop.update(Math.min(delta, 50) / 1000);
  }

  private begin(): void {
    if (this.starting) return;
    this.starting = true;
    goTo(this, newRun(Date.now()));
  }
}
