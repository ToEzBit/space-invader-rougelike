import Phaser from 'phaser';
import { newRun } from '../core/run';
import { css, COLORS } from '../art/palette';
import { setDebugHooks } from '../debug';
import { Backdrop } from '../ui/backdrop';
import { frame } from '../ui/frame';
import { label } from '../ui/text';
import { fitCamera, VIEW } from '../view';
import { goTo } from './flow';

const CONTROLS: readonly [string, string][] = [
  ['← → ↑ ↓ / W A S D', 'เคลื่อนที่'],
  ['AUTO', 'ยิงอัตโนมัติ · เลเซอร์ยิงเองเมื่อปลดล็อก'],
  ['SHIFT', 'พุ่งชนทะลุฝูงศัตรู (เมื่อปลดล็อก)'],
  ['1 2 3 4 5', 'ใช้ไอเทมที่ซื้อจากร้านค้า ระหว่างด่าน'],
  ['1 2 3 / R / ENTER', 'ซื้อ · รีเฟรช · ไปต่อ ในร้านค้า'],
  ['F', 'เต็มจอ / ออกจากเต็มจอ'],
];
const ROW_H = 20;

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
    const ink = css(COLORS.ink);

    // Between the nebula and the star layers, so the key art covers the playfield and the stars still scroll over it.
    this.add.image(0, 0, 'titleBg').setOrigin(0).setDepth(-9.5);
    const cast = this.add.image(cx, 312, 'titleScene');
    this.tweens.add({ targets: cast, y: '-=6', duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const logo = this.add.image(cx, 96, 'logo');
    this.tweens.add({ targets: logo, y: 104, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    label(this, cx, 196, 'ปกป้องกาแล็กซีจากกองทัพสาวต่างดาว · อัปเกรดแบบโร้กไลก์', { size: 13, color: '#e3c6ff', align: 'center', stroke: ink });

    frame(this, 'panel', 40, 410, VIEW.w - 80, 44 + CONTROLS.length * ROW_H).setOrigin(0);
    label(this, cx, 418, 'CONTROLS · การควบคุม', { size: 13, bold: true, color: css(COLORS.yellow), align: 'center' });
    CONTROLS.forEach(([key, what], i) => {
      label(this, 60, 444 + i * ROW_H, key, { size: 13, bold: true, color: css(COLORS.cyan) });
      label(this, 196, 444 + i * ROW_H, what, { size: 13, color: '#ffffff' });
    });

    const prompt = label(this, cx, 590, 'PRESS ENTER หรือคลิกเพื่อเริ่ม', { size: 18, bold: true, color: '#ffffff', align: 'center', stroke: '#d81b8c' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    const fullscreen = label(this, VIEW.w - 12, 10, 'F · เต็มจอ', { size: 12, bold: true, color: '#c9d4ff', align: 'right', stroke: ink });
    fullscreen.setInteractive({ useHandCursor: true }).on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.scale.toggleFullscreen();
      },
    );

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
