import Phaser from 'phaser';
import { isMuted, toggleMute, want } from '../audio/music';
import { newRun } from '../core/run';
import { css, COLORS } from '../art/palette';
import { setDebugHooks } from '../debug';
import { WORDS } from '../input';
import { Backdrop } from '../ui/backdrop';
import { frame } from '../ui/frame';
import { label } from '../ui/text';
import { fitCamera, VIEW } from '../view';
import { goTo } from './flow';

const ROW_H = 20;

export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private musicHint!: Phaser.GameObjects.Text;
  private starting = false;

  constructor() {
    super('Title');
  }

  create(): void {
    fitCamera(this);
    want('normal');
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

    frame(this, 'panel', 40, 410, VIEW.w - 80, 44 + WORDS.controls.length * ROW_H).setOrigin(0);
    label(this, cx, 418, 'CONTROLS · การควบคุม', { size: 13, bold: true, color: css(COLORS.yellow), align: 'center' });
    WORDS.controls.forEach(([key, what], i) => {
      label(this, 60, 444 + i * ROW_H, key, { size: 13, bold: true, color: css(COLORS.cyan) });
      label(this, 196, 444 + i * ROW_H, what, { size: 13, color: '#ffffff' });
    });

    const prompt = label(this, cx, 590, WORDS.start, { size: 18, bold: true, color: '#ffffff', align: 'center', stroke: '#d81b8c' });
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });

    const fullscreen = label(this, VIEW.w - 12, 10, WORDS.fullscreen, { size: 12, bold: true, color: '#c9d4ff', align: 'right', stroke: ink });
    fullscreen.setInteractive({ useHandCursor: true }).on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.scale.toggleFullscreen();
      },
    );

    this.musicHint = label(this, 12, 10, '', { size: 12, bold: true, color: '#c9d4ff', stroke: ink });
    this.musicHint.setInteractive({ useHandCursor: true }).on(
      'pointerdown',
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        toggleMute();
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
    this.musicHint.setText(WORDS.music(isMuted()));
  }

  private begin(): void {
    if (this.starting) return;
    this.starting = true;
    goTo(this, newRun(Date.now()));
  }
}
