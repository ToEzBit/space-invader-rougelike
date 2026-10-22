import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { ITEM_IDS, ITEMS, type ItemId } from '../core/items';
import { STAGE_COUNT } from '../core/stages';
import { TRANS_AM } from '../core/transAm';
import { COLORS, css } from '../art/palette';
import type { CharacterKey } from '../art/characters';
import type { IconKey } from '../art/ui';
import { MONEY_ANCHOR } from '../game/fx';
import { barAlpha, hpBarColor, hpRatio, visibleBar } from '../game/hpBar';
import { DEPTH } from '../game/layout';
import { godMode } from '../godMode';
import type { BossFight } from '../game/boss';
import { sweepAngle, type SkillMeter } from '../game/skills';
import type { World } from '../game/world';
import { VIEW } from '../view';
import { frame } from './frame';
import { ITEM_LOOK } from './itemLook';
import { label } from './text';

export class Hud {
  private readonly hearts: Phaser.GameObjects.Image[] = [];
  private readonly money: Phaser.GameObjects.Text;
  private readonly godBadge: Phaser.GameObjects.Text;
  private shownMoney = -1;
  private shownHp = '';
  private readonly bossBar: Phaser.GameObjects.Graphics;
  private readonly bossName: Phaser.GameObjects.Text | null;
  private readonly foeBars: Phaser.GameObjects.Graphics;
  private readonly skills: Map<SkillDef['id'], SkillSlot>;
  private readonly items: Map<ItemId, SkillSlot>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
    private readonly boss: BossFight | null,
  ) {
    const d = DEPTH.hud;
    // Oversized by 2 on every side so only the bottom trim and lower corners show at the playfield's top edge.
    frame(scene, 'hudBar', -2, -2, VIEW.w + 4, 38).setOrigin(0).setDepth(d);
    label(scene, VIEW.w / 2, 7, `STAGE ${world.run.stage}/${STAGE_COUNT}`, { size: 14, bold: true, color: css(COLORS.yellow), align: 'center' }).setDepth(d);
    scene.add.image(MONEY_ANCHOR.x, MONEY_ANCHOR.y, 'coin0').setDepth(d);
    this.money = label(scene, MONEY_ANCHOR.x - 14, 7, '0', { size: 14, bold: true, align: 'right' }).setDepth(d);
    this.godBadge = label(scene, 0, 10, 'อมตะ · G', { size: 12, bold: true, color: css(COLORS.gold), stroke: css(COLORS.ink) }).setDepth(d);
    this.bossBar = scene.add.graphics().setDepth(d);
    this.foeBars = scene.add.graphics().setDepth(DEPTH.hpBar);
    this.bossName = boss && label(scene, VIEW.w / 2, 40, boss.name.toUpperCase(), { size: 13, bold: true, color: css(COLORS.red), align: 'center', stroke: '#0d0b26' }).setDepth(d);
    const shown = SKILL_SLOTS.filter((def) => def.meter(world));
    this.skills = new Map(shown.map((def, i) => [def.id, new SkillSlot(scene, TRAY.x + i * TRAY.gap, TRAY.y, def)]));
    // Items can only be spent during a stage, so the slots held at the start stay put (dimmed at x0) until it ends.
    const held = ITEM_IDS.filter((id) => world.run.items[id]);
    this.items = new Map(held.map((id, i) => [id, new SkillSlot(scene, ITEM_TRAY_RIGHT - (held.length - 1 - i) * TRAY.gap, TRAY.y, ITEM_SLOTS[id])]));
  }

  refuseItem(id: ItemId): void {
    sfx('deny');
    const slot = this.items.get(id);
    if (slot) return slot.refuse();
    this.world.fx.float(ITEM_TRAY_RIGHT - 30, TRAY.y - 36, `ไม่มี ${ITEMS[id].name}`, COLORS.red);
  }

  refuseTransAm(): void {
    sfx('deny');
    this.skills.get('transAm')?.refuse();
    const t = this.world.transAm;
    if (t.kind === 'charging' && t.gauge < TRANS_AM.gaugeMax) this.world.fx.float(TRAY.x + 30, TRAY.y - 36, 'เกจยังไม่เต็ม', COLORS.red);
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
      this.godBadge.setX(16 + stats.maxHp * 18);
    }
    this.godBadge.setVisible(godMode());
    this.drawBossBar();
    this.drawFoeBars();
    for (const slot of this.skills.values()) slot.update(this.world);
    for (const slot of this.items.values()) slot.update(this.world);
    const money = run.money + coins;
    if (money !== this.shownMoney) {
      if (this.shownMoney >= 0) this.scene.tweens.add({ targets: this.money, scale: { from: 1.3, to: 1 }, duration: 160 });
      this.shownMoney = money;
      this.money.setText(String(money));
    }
  }

  private drawFoeBars(): void {
    const g = this.foeBars.clear();
    for (const foe of this.world.foes) {
      const bar = visibleBar(foe);
      if (!bar) continue;
      const s = foe.sprite;
      const w = Math.round(s.displayWidth);
      const x = Math.round(s.x - w / 2);
      const y = Math.round(s.y - s.originY * s.displayHeight) - FOE_BAR.gap - FOE_BAR.h;
      const ratio = hpRatio(foe);
      const a = barAlpha(bar);
      g.fillStyle(COLORS.ink, 0.9 * a).fillRect(x - 1, y - 1, w + 2, FOE_BAR.h + 2);
      g.fillStyle(0x2a2650, a).fillRect(x, y, w, FOE_BAR.h);
      g.fillStyle(COLORS.white, a).fillRect(x, y, Math.round(w * bar.chip), FOE_BAR.h);
      g.fillStyle(hpBarColor(ratio), a).fillRect(x, y, Math.max(1, Math.round(w * ratio)), FOE_BAR.h);
    }
  }

  private drawBossBar(): void {
    const g = this.bossBar.clear();
    if (!this.boss) return;
    const name = this.boss.name.toUpperCase();
    if (this.bossName && this.bossName.text !== name) this.bossName.setText(name);
    const x = 60;
    const w = VIEW.w - 120;
    g.fillStyle(0x0d0b26, 0.9).fillRect(x - 2, 62, w + 4, 12);
    g.fillStyle(0x3a0a1a, 1).fillRect(x, 64, w, 8);
    // The HP a transformation heals back climbs in green.
    const healing = this.boss.stanceKind === 'transforming' && this.boss.def.transform.healRatio > 0;
    g.fillStyle(healing ? COLORS.green : COLORS.red, 1).fillRect(x, 64, w * this.boss.hpRatio, 8);
    g.fillStyle(healing ? COLORS.white : COLORS.pink, 1).fillRect(x, 64, w * this.boss.hpRatio, 2);
    for (const ratio of bossTicks(this.boss)) g.fillStyle(COLORS.yellow, 1).fillRect(x + w * ratio - 1, 61, 2, 14);
  }
}

// Where the current form changes phase, plus where the first form transforms.
function bossTicks({ def, form }: BossFight): number[] {
  const phases = def.forms[form].phases.slice(1).map((p) => p.hpRatio);
  return form === 0 ? [...phases, def.transform.atHpRatio] : phases;
}

// `count` adds an xN badge and dims the icon at zero, for consumables. `tint` colors the icon whenever it is not
// dimmed. `pulseReady` keeps a ready slot glowing, for the one skill worth watching for.
type SlotDef = {
  icon: IconKey | CharacterKey;
  color: number;
  hint: string;
  meter: (w: World) => SkillMeter | null;
  count?: (w: World) => number;
  tint?: number;
  pulseReady?: boolean;
};

type SkillDef = SlotDef & { id: 'transAm' | 'laser' | 'orbital' | 'dash'; hint: 'AUTO' | 'SHIFT' | 'SPACE' };

// TRANS-AM always shows, so it leads the tray and never moves.
export const SKILL_SLOTS: readonly SkillDef[] = [
  { id: 'transAm', icon: 'player', color: COLORS.red, tint: 0xff8ab4, hint: 'SPACE', meter: (w) => w.transAmMeter(), pulseReady: true },
  { id: 'dash', icon: 'iconRam', color: COLORS.pink, hint: 'SHIFT', meter: (w) => w.dash.meter() },
  { id: 'laser', icon: 'iconLaser', color: COLORS.cyan, hint: 'AUTO', meter: (w) => w.laser.meter() },
  { id: 'orbital', icon: 'iconOrbital', color: COLORS.yellow, hint: 'AUTO', meter: (w) => w.laser.orbitalMeter() },
];

const ITEM_SLOTS = Object.fromEntries(
  ITEM_IDS.map((id): [ItemId, SlotDef] => [
    id,
    { ...ITEM_LOOK[id], hint: ITEMS[id].key, meter: (w) => w.itemMeter(id), count: (w) => w.run.items[id] ?? 0 },
  ]),
) as Record<ItemId, SlotDef>;

// Four skill slots and five item slots fit across the bottom edge at this gap.
const TRAY = { x: 32, y: 604, gap: 52, r: 22 } as const;
const FOE_BAR = { h: 3, gap: 3 } as const;
const ITEM_TRAY_RIGHT = VIEW.w - TRAY.x;
const FULL_TURN = sweepAngle(1);
// Icons drawn for a slot are 28 px; anything larger, such as the ship, is scaled down to that.
const ICON_FIT = 28;

class SkillSlot {
  private readonly root: Phaser.GameObjects.Container;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly countdown: Phaser.GameObjects.Text;
  private readonly badge: Phaser.GameObjects.Text | null;
  private shown: SkillMeter['kind'] | null = null;
  private shownCount: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly def: SlotDef,
  ) {
    const { r } = TRAY;
    const base = scene.add.graphics();
    base.fillStyle(COLORS.ink, 0.85).fillCircle(0, 0, r + 2);
    base.fillStyle(0x1b1840, 1).fillCircle(0, 0, r - 1);
    base.fillStyle(def.color, 0.3).fillCircle(0, 0, r - 1);
    this.icon = scene.add.image(0, 0, def.icon);
    this.icon.setScale(Math.min(1, ICON_FIT / Math.max(this.icon.width, this.icon.height)));
    this.overlay = scene.add.graphics();
    this.countdown = label(scene, 0, 0, '', { size: 15, bold: true, align: 'center', stroke: css(COLORS.ink) });
    this.countdown.setOrigin(0.5);
    const hint = label(scene, 0, r - 4, def.hint, { size: 8, bold: true, color: css(def.color), align: 'center', stroke: css(COLORS.ink) });
    this.badge = def.count ? label(scene, r + 4, -r - 4, '', { size: 11, bold: true, align: 'right', stroke: css(COLORS.ink) }) : null;
    this.root = scene.add.container(x, y, [base, this.icon, this.overlay, this.countdown, hint, ...(this.badge ? [this.badge] : [])]).setDepth(DEPTH.skillTray);
  }

  refuse(): void {
    const { scene } = this;
    scene.tweens.add({ targets: this.root, x: { from: this.x - 5, to: this.x }, duration: 260, ease: 'Bounce.easeOut' });
    const flash = scene.add.circle(this.x, this.y, TRAY.r, COLORS.red, 0.55).setStrokeStyle(3, COLORS.red, 1).setDepth(DEPTH.skillTray);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 320, ease: 'Quad.easeIn', onComplete: () => flash.destroy() });
  }

  update(world: World): void {
    const m = this.def.meter(world);
    if (!m) return;
    const count = this.def.count?.(world);
    if ((this.shown === 'cooling' || this.shown === 'charging') && m.kind === 'ready') this.pop();
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
      case 'charging': {
        const edge = sweepAngle(m.ratio);
        this.icon.setTint(0x9a9ab8);
        g.fillStyle(0x05040f, 0.6).slice(0, 0, r - 1, edge, FULL_TURN, false).fillPath();
        g.lineStyle(2, 0x3a3566, 1).strokeCircle(0, 0, r);
        g.lineStyle(3, color, 1).beginPath().arc(0, 0, r, sweepAngle(0), edge, false).strokePath();
        this.countdown.setVisible(true).setText(String(Math.floor(m.ratio * 100)));
        break;
      }
      case 'active': {
        const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 60);
        this.lit();
        g.lineStyle(6, color, 0.25 + 0.35 * pulse).strokeCircle(0, 0, r + 2);
        g.lineStyle(2, 0x3a3566, 1).strokeCircle(0, 0, r);
        g.lineStyle(3, COLORS.white, 1).beginPath().arc(0, 0, r, sweepAngle(0), sweepAngle(m.ratioLeft), false).strokePath();
        this.countdown.setVisible(false);
        break;
      }
      case 'ready': {
        if (count === 0) this.icon.setTint(0x6a6a88);
        else this.lit();
        if (this.def.pulseReady) g.lineStyle(7, color, 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(this.scene.time.now / 110))).strokeCircle(0, 0, r + 3);
        g.lineStyle(2, color, 1).strokeCircle(0, 0, r);
        if (m.refill !== null) g.lineStyle(2, COLORS.white, 1).beginPath().arc(0, 0, r, sweepAngle(0), sweepAngle(m.refill), false).strokePath();
        this.countdown.setVisible(false);
        break;
      }
    }
    if ((m.kind === 'ready' || m.kind === 'cooling') && m.maxCharges > 1) this.pips(g, m.charges, m.maxCharges);
    if (this.badge && count !== undefined && count !== this.shownCount) {
      this.shownCount = count;
      this.badge.setText(`x${count}`).setColor(count ? '#ffffff' : css(COLORS.red));
    }
  }

  private lit(): void {
    if (this.def.tint === undefined) this.icon.clearTint();
    else this.icon.setTint(this.def.tint);
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
