import Phaser from 'phaser';
import { STAGE_COUNT } from '../core/stages';
import { COLORS, css } from '../art/palette';
import type { SpriteKey } from '../art/sprites';
import { MONEY_ANCHOR } from '../game/fx';
import { DEPTH } from '../game/layout';
import type { BossFight } from '../game/boss';
import { sweepAngle, type SkillMeter } from '../game/skills';
import type { World } from '../game/world';
import { VIEW } from '../view';
import { label } from './text';

export class Hud {
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private readonly money: Phaser.GameObjects.Text;
  private shownMoney = -1;
  private shownHp = '';
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly skills: SkillSlot[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly boss: BossFight | null,
  ) {
    const d = DEPTH.hud;
    scene.add.rectangle(0, 0, VIEW.w, 34, 0x0d0b26, 0.72).setOrigin(0).setDepth(d);
    scene.add.rectangle(0, 34, VIEW.w, 2, COLORS.violet, 0.6).setOrigin(0).setDepth(d);
    label(scene, VIEW.w / 2, 7, `STAGE ${world.run.stage}/${STAGE_COUNT}`, { size: 14, bold: true, color: css(COLORS.yellow), align: 'center' }).setDepth(d);
    scene.add.image(MONEY_ANCHOR.x, MONEY_ANCHOR.y, 'coin0').setDepth(d);
    this.money = label(scene, MONEY_ANCHOR.x - 14, 7, '0', { size: 14, bold: true, align: 'right' }).setDepth(d);
    this.bossBar = scene.add.graphics().setDepth(d);
    if (boss) label(scene, VIEW.w / 2, 40, boss.name.toUpperCase(), { size: 13, bold: true, color: css(COLORS.red), align: 'center', stroke: '#0d0b26' }).setDepth(d);
    this.skills = SKILL_SLOTS.filter((def) => def.meter(world)).map((def, i) => new SkillSlot(scene, TRAY.x + i * TRAY.gap, TRAY.y, def));
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
    this.drawBossBar();
    for (const slot of this.skills) slot.update(this.world);
    const money = run.money + coins;
    if (money !== this.shownMoney) {
      if (this.shownMoney >= 0) this.scene.tweens.add({ targets: this.money, scale: { from: 1.3, to: 1 }, duration: 160 });
      this.shownMoney = money;
      this.money.setText(String(money));
    }
  }

  private drawBossBar(): void {
    const g = this.bossBar.clear();
    if (!this.boss) return;
    const x = 60;
    const w = VIEW.w - 120;
    g.fillStyle(0x0d0b26, 0.9).fillRect(x - 2, 62, w + 4, 12);
    g.fillStyle(0x3a0a1a, 1).fillRect(x, 64, w, 8);
    g.fillStyle(COLORS.red, 1).fillRect(x, 64, w * this.boss.hpRatio, 8);
    g.fillStyle(COLORS.pink, 1).fillRect(x, 64, w * this.boss.hpRatio, 2);
    for (const phase of this.boss.def.phases.slice(1)) g.fillStyle(COLORS.yellow, 1).fillRect(x + w * phase.hpRatio - 1, 61, 2, 14);
  }
}

type SkillDef = { id: 'laser' | 'orbital' | 'dash'; icon: SpriteKey; color: number; hint: 'AUTO' | 'SHIFT'; meter: (w: World) => SkillMeter | null };

export const SKILL_SLOTS: readonly SkillDef[] = [
  { id: 'dash', icon: 'iconRam', color: COLORS.pink, hint: 'SHIFT', meter: (w) => w.dash.meter() },
  { id: 'laser', icon: 'iconLaser', color: COLORS.cyan, hint: 'AUTO', meter: (w) => w.laser.meter() },
  { id: 'orbital', icon: 'iconOrbital', color: COLORS.yellow, hint: 'AUTO', meter: (w) => w.laser.orbitalMeter() },
];

const TRAY = { x: 32, y: 604, gap: 56, r: 22 } as const;
const FULL_TURN = sweepAngle(1);

class SkillSlot {
  private readonly root: Phaser.GameObjects.Container;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly countdown: Phaser.GameObjects.Text;
  private shown: SkillMeter['kind'] | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly def: SkillDef,
  ) {
    const { r } = TRAY;
    const base = scene.add.graphics();
    base.fillStyle(COLORS.ink, 0.85).fillCircle(0, 0, r + 2);
    base.fillStyle(0x1b1840, 1).fillCircle(0, 0, r - 1);
    base.fillStyle(def.color, 0.3).fillCircle(0, 0, r - 1);
    this.icon = scene.add.image(0, 0, def.icon).setScale(2);
    this.overlay = scene.add.graphics();
    this.countdown = label(scene, 0, 0, '', { size: 15, bold: true, align: 'center', stroke: css(COLORS.ink) });
    this.countdown.setOrigin(0.5);
    const hint = label(scene, 0, r - 4, def.hint, { size: 8, bold: true, color: css(def.color), align: 'center', stroke: css(COLORS.ink) });
    this.root = scene.add.container(x, y, [base, this.icon, this.overlay, this.countdown, hint]).setDepth(DEPTH.skillTray);
  }

  update(world: World): void {
    const m = this.def.meter(world);
    if (!m) return;
    if (this.shown === 'cooling' && m.kind === 'ready') this.pop();
    this.shown = m.kind;
    const { r } = TRAY;
    const { color } = this.def;
    const g = this.overlay.clear();
    switch (m.kind) {
      case 'cooling': {
        const edge = sweepAngle(m.progress);
        this.icon.setTint(0x9a9ab8);
        g.fillStyle(0x05040f, 0.8).slice(0, 0, r - 1, edge, FULL_TURN, false).fillPath();
        g.lineStyle(2, 0x3a3566, 1).strokeCircle(0, 0, r);
        g.lineStyle(2, color, 0.9).beginPath().arc(0, 0, r, sweepAngle(0), edge, false).strokePath();
        g.lineStyle(1.5, COLORS.white, 0.95).lineBetween(0, 0, Math.cos(edge) * (r - 1), Math.sin(edge) * (r - 1));
        this.countdown.setVisible(true).setText((m.msLeft / 1000).toFixed(1));
        break;
      }
      case 'active': {
        const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 60);
        this.icon.clearTint();
        g.lineStyle(6, color, 0.25 + 0.35 * pulse).strokeCircle(0, 0, r + 2);
        g.lineStyle(2, COLORS.white, 1).strokeCircle(0, 0, r);
        this.countdown.setVisible(false);
        break;
      }
      case 'ready': {
        this.icon.clearTint();
        g.lineStyle(2, color, 1).strokeCircle(0, 0, r);
        if (m.refill !== null) g.lineStyle(2, COLORS.white, 1).beginPath().arc(0, 0, r, sweepAngle(0), sweepAngle(m.refill), false).strokePath();
        this.countdown.setVisible(false);
        break;
      }
    }
    if (m.kind !== 'active' && m.maxCharges > 1) this.pips(g, m.charges, m.maxCharges);
  }

  private pips(g: Phaser.GameObjects.Graphics, charges: number, max: number): void {
    const w = 6;
    const left = -((max - 1) * (w + 2)) / 2 - w / 2;
    for (let i = 0; i < max; i++) {
      g.fillStyle(COLORS.ink, 1).fillRect(left + i * (w + 2) - 1, -TRAY.r - 3, w + 2, 5);
      g.fillStyle(i < charges ? COLORS.yellow : 0x2a2650, 1).fillRect(left + i * (w + 2), -TRAY.r - 2, w, 3);
    }
  }

  private pop(): void {
    const { scene } = this;
    scene.tweens.add({ targets: this.root, scale: { from: 1.25, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    const flash = scene.add.circle(this.x, this.y, TRAY.r).setStrokeStyle(3, COLORS.white, 1).setDepth(DEPTH.skillTray);
    scene.tweens.add({ targets: flash, scale: 1.7, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => flash.destroy() });
  }
}
