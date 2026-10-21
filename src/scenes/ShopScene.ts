import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { BRANCH_LABEL, PERKS, PERK_IDS, deriveStats, describePerk, type PerkDef, type PerkId } from '../core/perks';
import { buyOffer, leaveShop, offerCost, refreshCost, refreshShop, type RunState, type ShopResult } from '../core/run';
import { COLORS, css } from '../art/palette';
import { setDebugHooks } from '../debug';
import { Backdrop } from '../ui/backdrop';
import { BRANCH_LOOK } from '../ui/branch';
import { label } from '../ui/text';
import { fitCamera, VIEW } from '../view';
import { goTo, type RunData } from './flow';

type Card =
  | { kind: 'offer'; slot: number; perk: PerkDef; level: number; cost: number; affordable: boolean }
  | { kind: 'soldOut'; slot: number };

function cardsOf(run: RunState): Card[] {
  if (run.phase.kind !== 'shop') return [];
  return run.phase.shop.offers.map((id, slot): Card => {
    if (!id) return { kind: 'soldOut', slot };
    const cost = offerCost(run, id);
    return { kind: 'offer', slot, perk: PERKS[id], level: run.perks[id] ?? 0, cost, affordable: run.money >= cost };
  });
}

const CARD = { x: 20, w: VIEW.w - 40, h: 116, top: 92, gap: 10 };
const BUTTON_Y = 482;
const STATUS_Y = 510;
const STATUS_H = 124;
const CHIP_ROW = 18;

export class ShopScene extends Phaser.Scene {
  private run!: RunState;
  private backdrop!: Backdrop;
  private layer!: Phaser.GameObjects.Container;
  private cards: Phaser.GameObjects.Container[] = [];
  private leaving = false;

  constructor() {
    super('Shop');
  }

  init(data: RunData): void {
    this.run = data.run;
  }

  create(): void {
    fitCamera(this);
    this.leaving = false;
    this.backdrop = new Backdrop(this);
    label(this, VIEW.w / 2, 12, 'UPGRADE SHOP', { size: 26, bold: true, color: css(COLORS.yellow), align: 'center', stroke: '#5a22b0' });
    label(this, VIEW.w / 2, 54, `ร้านอัปเกรด · ผ่านด่าน ${this.run.stage} แล้ว`, { size: 13, color: '#e3c6ff', align: 'center' });
    this.layer = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard;
    (['ONE', 'TWO', 'THREE'] as const).forEach((key, slot) => kb?.on(`keydown-${key}`, () => this.buy(slot)));
    kb?.on('keydown-R', () => this.refresh());
    kb?.on('keydown-ENTER', () => this.leave());
    setDebugHooks(this, { run: () => this.run, info: () => ({ cards: cardsOf(this.run).map((c) => (c.kind === 'offer' ? c.perk.id : null)) }) });
  }

  update(_time: number, delta: number): void {
    this.backdrop.update(Math.min(delta, 50) / 1000, 0.4);
  }

  private render(): void {
    this.layer.removeAll(true);
    this.cards = cardsOf(this.run).map((card) => this.drawCard(card));
    this.drawButtons();
    this.drawStatus();
  }

  private drawCard(card: Card): Phaser.GameObjects.Container {
    const y = CARD.top + card.slot * (CARD.h + CARD.gap);
    const box = this.add.container(CARD.x + CARD.w / 2, y + CARD.h / 2);
    this.layer.add(box);
    const g = this.add.graphics();
    box.add(g);
    const left = -CARD.w / 2;
    const top = -CARD.h / 2;
    const key = label(this, left + CARD.w - 14, top + 8, `[${card.slot + 1}]`, { size: 12, bold: true, color: '#8a96c8', align: 'right' });

    if (card.kind === 'soldOut') {
      g.fillStyle(0x15132e, 0.85).fillRoundedRect(left, top, CARD.w, CARD.h, 10);
      g.lineStyle(2, 0x2a2650, 1).strokeRoundedRect(left, top, CARD.w, CARD.h, 10);
      box.add([key, label(this, 0, -14, 'SOLD OUT', { size: 24, bold: true, color: '#565f94', align: 'center' })]);
      return box;
    }

    const { perk, level, cost, affordable } = card;
    const look = BRANCH_LOOK[perk.branch];
    g.fillStyle(0x0d0b26, 0.92).fillRoundedRect(left, top, CARD.w, CARD.h, 10);
    g.fillStyle(look.color, 0.9).fillRoundedRect(left, top, 52, CARD.h, { tl: 10, bl: 10, tr: 0, br: 0 });
    g.lineStyle(2, look.color, affordable ? 1 : 0.45).strokeRoundedRect(left, top, CARD.w, CARD.h, 10);
    const icon = this.add.image(left + 26, top + 36, look.icon).setScale(1.5);
    const tier = label(this, left + 26, top + 66, `T${perk.tier}`, { size: 15, bold: true, color: '#0d0b26', align: 'center' });
    const tx = left + 66;
    const name = label(this, tx, top + 6, perk.name, { size: 17, bold: true, color: css(look.color) });
    const lv = label(this, tx + name.width + 10, top + 10, level ? `Lv ${level} → ${level + 1}` : `NEW · Lv 1`, {
      size: 12,
      bold: true,
      color: level ? '#ffffff' : css(COLORS.green),
    });
    const branch = label(this, tx, top + 30, BRANCH_LABEL[perk.branch], { size: 11, color: '#8a96c8' });
    const desc = label(this, tx, top + 50, describePerk(perk, level + 1), { size: 13, color: '#ffffff', wrap: CARD.w - 66 - 96 });
    const coin = this.add.image(left + CARD.w - 22, top + CARD.h - 24, 'coin0').setScale(1.4);
    const price = label(this, left + CARD.w - 36, top + CARD.h - 38, String(cost), {
      size: 20,
      bold: true,
      color: affordable ? css(COLORS.yellow) : css(COLORS.red),
      align: 'right',
    });
    box.add([icon, tier, name, lv, branch, desc, coin, price, key]);
    if (!affordable) box.add(label(this, left + CARD.w - 14, top + CARD.h - 56, 'เงินไม่พอ', { size: 11, color: css(COLORS.red), align: 'right' }));
    box.setAlpha(affordable ? 1 : 0.78);

    const hit = this.add.zone(0, 0, CARD.w, CARD.h).setInteractive({ useHandCursor: true });
    box.add(hit);
    hit.on('pointerover', () => this.tweens.add({ targets: box, scale: 1.03, duration: 90 }));
    hit.on('pointerout', () => this.tweens.add({ targets: box, scale: 1, duration: 90 }));
    hit.on('pointerdown', () => this.buy(card.slot));
    return box;
  }

  private drawButtons(): void {
    const cost = refreshCost(this.run);
    const canRefresh = this.run.money >= cost;
    this.button(VIEW.w / 2 - 110, `R · รีเฟรช  ${cost}`, canRefresh ? COLORS.violet : 0x2a2650, () => this.refresh());
    this.button(VIEW.w / 2 + 110, 'ENTER · ไปต่อ ▶', COLORS.green, () => this.leave());
  }

  private button(x: number, text: string, color: number, onClick: () => void): void {
    const box = this.add.container(x, BUTTON_Y);
    const g = this.add.graphics();
    g.fillStyle(color, 0.25).fillRoundedRect(-100, -20, 200, 40, 8);
    g.lineStyle(2, color, 1).strokeRoundedRect(-100, -20, 200, 40, 8);
    const t = label(this, 0, -12, text, { size: 15, bold: true, align: 'center' });
    const hit = this.add.zone(0, 0, 200, 40).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => this.tweens.add({ targets: box, scale: 1.05, duration: 80 }));
    hit.on('pointerout', () => this.tweens.add({ targets: box, scale: 1, duration: 80 }));
    hit.on('pointerdown', onClick);
    box.add([g, t, hit]);
    this.layer.add(box);
  }

  private drawStatus(): void {
    const stats = deriveStats(this.run.perks);
    const y = STATUS_Y;
    const g = this.add.graphics();
    g.fillStyle(0x0d0b26, 0.8).fillRoundedRect(20, y, VIEW.w - 40, STATUS_H, 10);
    g.lineStyle(1, COLORS.violet, 0.6).strokeRoundedRect(20, y, VIEW.w - 40, STATUS_H, 10);
    this.layer.add(g);
    for (let i = 0; i < stats.maxHp; i++) this.layer.add(this.add.image(38 + i * 18, y + 18, i < this.run.hp ? 'heart' : 'heartEmpty'));
    this.layer.add(this.add.image(VIEW.w - 40, y + 18, 'coin0').setScale(1.3));
    this.layer.add(label(this, VIEW.w - 54, y + 7, String(this.run.money), { size: 17, bold: true, color: css(COLORS.yellow), align: 'right' }));

    const owned = PERK_IDS.filter((id) => this.run.perks[id]);
    if (!owned.length) {
      this.layer.add(label(this, 34, y + 40, 'ยังไม่มีอัปเกรด เลือกซื้อการ์ดด้านบนได้เลย', { size: 12, color: '#8a96c8' }));
      return;
    }
    let cx = 34;
    let cy = y + 36;
    for (const [i, id] of owned.entries()) {
      const { bg, text } = this.chip(id);
      if (cx + bg.width > VIEW.w - 30) [cx, cy] = [34, cy + CHIP_ROW];
      if (cy + CHIP_ROW > y + STATUS_H) {
        bg.destroy();
        text.setText(`+${owned.length - i} more`).setOrigin(0.5, 0).setPosition(VIEW.w / 2, y + 10);
        return;
      }
      bg.setPosition(cx, cy + 2);
      text.setPosition(cx + 5, cy);
      cx += bg.width + 4;
    }
  }

  private chip(id: PerkId): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const perk = PERKS[id];
    const color = BRANCH_LOOK[perk.branch].color;
    const text = label(this, 0, 0, `${perk.name} ${this.run.perks[id]}`, { size: 10, bold: true, color: css(color) });
    const bg = this.add.rectangle(0, 0, text.width + 10, 16, color, 0.15).setOrigin(0).setStrokeStyle(1, color, 0.7);
    this.layer.add([bg, text]);
    return { bg, text };
  }

  private buy(slot: number): void {
    if (this.leaving) return;
    const card = cardsOf(this.run)[slot];
    const result = buyOffer(this.run, slot);
    this.apply(result, slot);
    if (result.ok && card?.kind === 'offer') {
      const box = this.cards[slot];
      if (!box) return;
      const color = BRANCH_LOOK[card.perk.branch].color;
      const burst = this.add.particles(box.x, box.y, 'spark', {
        lifespan: 500,
        speed: { min: 80, max: 260 },
        scale: { start: 3, end: 0 },
        tint: [color, COLORS.white, COLORS.yellow],
        emitting: false,
        blendMode: Phaser.BlendModes.ADD,
      });
      burst.explode(40);
      this.time.delayedCall(700, () => burst.destroy());
      const msg = label(this, box.x, box.y - 20, `${card.perk.name} Lv ${card.level + 1}!`, { size: 20, bold: true, color: css(color), align: 'center', stroke: '#0d0b26' });
      this.tweens.add({ targets: msg, y: box.y - 60, alpha: 0, duration: 900, onComplete: () => msg.destroy() });
      this.cameras.main.flash(120, 255, 255, 255);
    }
  }

  private refresh(): void {
    if (this.leaving) return;
    const result = refreshShop(this.run);
    this.apply(result, null);
    if (result.ok) for (const box of this.cards) this.tweens.add({ targets: box, scaleY: { from: 0, to: 1 }, duration: 200, ease: 'Back.easeOut' });
  }

  private apply(result: ShopResult, slot: number | null): void {
    sfx(result.ok ? 'buy' : 'deny');
    if (!result.ok) {
      const target = slot === null ? this.layer : this.cards[slot];
      if (target) this.tweens.add({ targets: target, x: target.x + 6, duration: 40, yoyo: true, repeat: 3 });
      return;
    }
    this.run = result.run;
    this.render();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    goTo(this, leaveShop(this.run));
  }
}
