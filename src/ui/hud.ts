import Phaser from 'phaser';
import { STAGE_COUNT } from '../core/stages';
import { COLORS, css } from '../art/palette';
import { MONEY_ANCHOR } from '../game/fx';
import { DEPTH } from '../game/layout';
import type { World } from '../game/world';
import { VIEW } from '../view';
import { label } from './text';

export class Hud {
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private readonly money: Phaser.GameObjects.Text;
  private shownMoney = -1;
  private shownHp = '';
  private readonly meters: Phaser.GameObjects.Graphics;
  private readonly laserLabel: Phaser.GameObjects.Text | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    const d = DEPTH.hud;
    scene.add.rectangle(0, 0, VIEW.w, 34, 0x0d0b26, 0.72).setOrigin(0).setDepth(d);
    scene.add.rectangle(0, 34, VIEW.w, 2, COLORS.violet, 0.6).setOrigin(0).setDepth(d);
    label(scene, VIEW.w / 2, 7, `STAGE ${world.run.stage}/${STAGE_COUNT}`, { size: 14, bold: true, color: css(COLORS.yellow), align: 'center' }).setDepth(d);
    scene.add.image(MONEY_ANCHOR.x, MONEY_ANCHOR.y, 'coin0').setDepth(d);
    this.money = label(scene, MONEY_ANCHOR.x - 14, 7, '0', { size: 14, bold: true, align: 'right' }).setDepth(d);
    this.meters = scene.add.graphics().setDepth(d);
    this.laserLabel = world.laser.meter() ? label(scene, METER.laserX, METER.y - 15, 'LASER', { size: 10, bold: true, color: css(COLORS.cyan) }).setDepth(d) : null;
  }

  update(): void {
    const { run, stats, coins } = this.world;
    const hpKey = `${run.hp}/${stats.maxHp}`;
    if (hpKey !== this.shownHp) {
      this.shownHp = hpKey;
      this.hearts.forEach((h) => h.destroy());
      this.hearts.length = 0;
      for (let i = 0; i < stats.maxHp; i++)
        this.hearts.push(this.scene.add.image(16 + i * 18, 17, i < run.hp ? 'heart' : 'heartEmpty').setDepth(DEPTH.hud));
    }
    this.drawMeters();
    const money = run.money + coins;
    if (money !== this.shownMoney) {
      if (this.shownMoney >= 0) this.scene.tweens.add({ targets: this.money, scale: { from: 1.3, to: 1 }, duration: 160 });
      this.shownMoney = money;
      this.money.setText(String(money));
    }
  }

  private drawMeters(): void {
    const g = this.meters.clear();
    const laser = this.world.laser.meter();
    if (laser) {
      const color = laser.active ? COLORS.white : laser.ready ? COLORS.cyan : COLORS.azure;
      bar(g, METER.laserX, METER.y, METER.w, laser.ratio, color);
      this.laserLabel?.setText(laser.ready ? 'LASER READY' : laser.active ? 'LASER!!' : 'LASER');
    }
  }
}

const METER = { y: 626, w: 120, laserX: 14, dashX: VIEW.w - 14 - 120 } as const;

function bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, ratio: number, color: number): void {
  g.fillStyle(0x0d0b26, 0.85).fillRect(x - 1, y - 1, w + 2, 8);
  g.fillStyle(0x2a2650, 1).fillRect(x, y, w, 6);
  g.fillStyle(color, 1).fillRect(x, y, Math.max(0, Math.min(1, ratio)) * w, 6);
}
