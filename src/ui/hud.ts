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
    const money = run.money + coins;
    if (money !== this.shownMoney) {
      if (this.shownMoney >= 0) this.scene.tweens.add({ targets: this.money, scale: { from: 1.3, to: 1 }, duration: 160 });
      this.shownMoney = money;
      this.money.setText(String(money));
    }
  }
}
