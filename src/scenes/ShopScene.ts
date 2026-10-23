import Phaser from 'phaser';
import { want } from '../audio/music';
import { sfx } from '../audio/sfx';
import { ITEM_IDS, ITEM_STACK_MAX, ITEMS, type ItemDef, type ItemId } from '../core/items';
import { BRANCH_LABEL, PERKS, PERK_IDS, deriveStats, describePerk, type PerkDef } from '../core/perks';
import { buyOffer, leaveShop, offerCost, refreshCost, refreshShop, type RunState, type ShopResult } from '../core/run';
import { COLORS, css } from '../art/palette';
import type { FrameKey } from '../art/ui';
import { setDebugHooks } from '../debug';
import { WORDS } from '../input';
import { Backdrop } from '../ui/backdrop';
import { BRANCH_LOOK } from '../ui/branch';
import { frame } from '../ui/frame';
import { ITEM_LOOK } from '../ui/itemLook';
import { ownedTip, type OwnedRef, type Rect } from '../ui/ownedTip';
import { label } from '../ui/text';
import { Tooltip } from '../ui/tooltip';
import { fitCamera, VIEW } from '../view';
import { goTo, type RunData } from './flow';

type Card =
  | { kind: 'perk'; slot: number; perk: PerkDef; level: number; cost: number; affordable: boolean }
  | { kind: 'item'; slot: number; id: ItemId; item: ItemDef; held: number; cost: number; affordable: boolean }
  | { kind: 'soldOut'; slot: number };

function cardsOf(run: RunState): Card[] {
  if (run.phase.kind !== 'shop') return [];
  return run.phase.shop.offers.map((offer, slot): Card => {
    if (!offer) return { kind: 'soldOut', slot };
    const cost = offerCost(run, offer);
    const affordable = run.money >= cost;
    switch (offer.kind) {
      case 'perk':
        return { kind: 'perk', slot, perk: PERKS[offer.id], level: run.perks[offer.id] ?? 0, cost, affordable };
      case 'item':
        return { kind: 'item', slot, id: offer.id, item: ITEMS[offer.id], held: run.items[offer.id] ?? 0, cost, affordable };
    }
  });
}

const CARD = { x: 20, w: VIEW.w - 40, h: 116, top: 92, gap: 10 };
const BUTTON_Y = 482;
const STATUS_Y = 510;
const STATUS_H = 124;
const CHIP_ROW = 18;
// The perk stripe sits inside the frame's border.
const STRIPE_W = 52;
const STRIPE_INSET = 5;
const ITEM_CHIP: FrameKey = 'chipGold';

type ButtonLook = { idle: FrameKey; hover: FrameKey };
const BUTTON = {
  refresh: { idle: 'button', hover: 'buttonHover' },
  disabled: { idle: 'buttonDisabled', hover: 'buttonDisabled' },
  go: { idle: 'buttonAccent', hover: 'buttonAccentHover' },
} satisfies Record<string, ButtonLook>;

export class ShopScene extends Phaser.Scene {
  private run!: RunState;
  private backdrop!: Backdrop;
  private layer!: Phaser.GameObjects.Container;
  private cards: Phaser.GameObjects.Container[] = [];
  private chips: { ref: OwnedRef; rect: Rect }[] = [];
  // Dev-only: where each card and button takes a tap, in world units.
  private targets: { id: string; rect: Rect }[] = [];
  private tooltip!: Tooltip<OwnedRef>;
  private leaving = false;

  constructor() {
    super('Shop');
  }

  init(data: RunData): void {
    this.run = data.run;
  }

  create(): void {
    fitCamera(this);
    want('shop');
    this.leaving = false;
    this.backdrop = new Backdrop(this);
    label(this, VIEW.w / 2, 12, 'UPGRADE SHOP', { size: 26, bold: true, color: css(COLORS.yellow), align: 'center', stroke: '#5a22b0' });
    const subtitle = this.run.stage === 0 ? 'โรงเก็บยาน · เลือกอัปเกรดแรกก่อนออกบิน' : `ร้านอัปเกรด · ผ่านด่าน ${this.run.stage} แล้ว`;
    label(this, VIEW.w / 2, 54, subtitle, { size: 13, color: '#e3c6ff', align: 'center' });
    this.layer = this.add.container(0, 0);
    this.tooltip = new Tooltip(this);
    this.render();

    const kb = this.input.keyboard;
    (['ONE', 'TWO', 'THREE'] as const).forEach((key, slot) => kb?.on(`keydown-${key}`, () => this.buy(slot)));
    kb?.on('keydown-R', () => this.refresh());
    // An Enter held from Title would otherwise repeat straight through the hangar.
    kb?.on('keydown-ENTER', (event: KeyboardEvent) => !event.repeat && this.leave());
    // A finger has no hover, so a tooltip a tap opened closes on a tap anywhere else; a tap on a chip stops here.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) this.tooltip.hide();
    });
    setDebugHooks(this, { run: () => this.run, info: () => this.debugInfo() });
  }

  update(_time: number, delta: number): void {
    this.backdrop.update(Math.min(delta, 50) / 1000, 0.4);
  }

  private debugInfo(): Record<string, unknown> {
    const shown = this.tooltip.shown;
    return {
      cards: this.run.phase.kind === 'shop' ? this.run.phase.shop.offers : [],
      chips: this.chips.map(({ ref, rect }) => ({ ...ref, ...rect })),
      targets: this.targets.map(({ id, rect }) => ({ id, ...rect })),
      tooltip: shown ? { visible: true, ...shown.ref, hasNext: shown.tip.next !== undefined, ...shown.bounds, fadeIns: this.tooltip.fadeIns } : { visible: false, fadeIns: this.tooltip.fadeIns },
    };
  }

  private render(): void {
    // Rebuilt chips never send pointerout, so a tooltip left up would go stale.
    this.tooltip.clear();
    this.chips = [];
    this.targets = [];
    this.layer.removeAll(true);
    this.cards = cardsOf(this.run).map((card) => this.drawCard(card));
    this.drawButtons();
    this.drawStatus();
  }

  private drawCard(card: Card): Phaser.GameObjects.Container {
    const y = CARD.top + card.slot * (CARD.h + CARD.gap);
    const box = this.add.container(CARD.x + CARD.w / 2, y + CARD.h / 2);
    this.layer.add(box);
    const left = -CARD.w / 2;
    const top = -CARD.h / 2;
    const key = label(this, left + CARD.w - 14, top + 8, WORDS.cardKey(card.slot), { size: 12, bold: true, color: '#8a96c8', align: 'right' });

    if (card.kind === 'soldOut') {
      const g = this.add.graphics();
      g.fillStyle(0x15132e, 0.85).fillRoundedRect(left, top, CARD.w, CARD.h, 10);
      g.lineStyle(2, 0x2a2650, 1).strokeRoundedRect(left, top, CARD.w, CARD.h, 10);
      box.add([g, key, label(this, 0, -14, 'SOLD OUT', { size: 24, bold: true, color: '#565f94', align: 'center' })]);
      return box;
    }

    if (card.kind === 'item') this.drawItem(box, card);
    else this.drawPerk(box, card);
    const { cost, affordable } = card;
    const coin = this.add.image(left + CARD.w - 22, top + CARD.h - 24, 'coinLarge');
    const price = label(this, left + CARD.w - 36, top + CARD.h - 38, String(cost), {
      size: 20,
      bold: true,
      color: affordable ? css(COLORS.yellow) : css(COLORS.red),
      align: 'right',
    });
    box.add([coin, price, key]);
    if (!affordable) box.add(label(this, left + CARD.w - 14, top + CARD.h - 56, 'เงินไม่พอ', { size: 11, color: css(COLORS.red), align: 'right' }));
    box.setAlpha(affordable ? 1 : 0.78);

    const hit = this.add.zone(0, 0, CARD.w, CARD.h).setInteractive({ useHandCursor: true });
    box.add(hit);
    hit.on('pointerover', () => this.tweens.add({ targets: box, scale: 1.03, duration: 90 }));
    hit.on('pointerout', () => this.tweens.add({ targets: box, scale: 1, duration: 90 }));
    onTap(hit, () => this.buy(card.slot));
    this.targets.push({ id: `card${card.slot}`, rect: { x: CARD.x, y, w: CARD.w, h: CARD.h } });
    return box;
  }

  private drawPerk(box: Phaser.GameObjects.Container, card: Extract<Card, { kind: 'perk' }>): void {
    const left = -CARD.w / 2;
    const top = -CARD.h / 2;
    const { perk, level } = card;
    const look = BRANCH_LOOK[perk.branch];
    const g = this.add.graphics();
    const inset = STRIPE_INSET;
    g.fillStyle(look.color, 0.16).fillRect(left + inset + 1, top + inset + 1, STRIPE_W - inset, CARD.h - 2 * inset - 2);
    g.fillStyle(look.color, 0.55).fillRect(left + STRIPE_W, top + inset + 1, 1, CARD.h - 2 * inset - 2);
    const icon = this.add.image(left + 26, top + 36, look.icon);
    const tier = label(this, left + 26, top + 66, `T${perk.tier}`, { size: 15, bold: true, color: css(look.color), align: 'center', stroke: css(COLORS.ink) });
    const tx = left + 66;
    const name = label(this, tx, top + 6, perk.name, { size: 17, bold: true, color: css(look.color) });
    const lv = label(this, tx + name.width + 10, top + 10, level ? `Lv ${level} → ${level + 1}` : `NEW · Lv 1`, {
      size: 12,
      bold: true,
      color: level ? '#ffffff' : css(COLORS.green),
    });
    const branch = label(this, tx, top + 30, BRANCH_LABEL[perk.branch], { size: 11, color: '#8a96c8' });
    const desc = label(this, tx, top + 50, describePerk(perk, level + 1), { size: 13, color: '#ffffff', wrap: CARD.w - 66 - 96 });
    box.add([frame(this, look.card, 0, 0, CARD.w, CARD.h), g, icon, tier, name, lv, branch, desc]);
  }

  // Items read as a different kind of goods: gold frame and a round icon well like the HUD tray.
  private drawItem(box: Phaser.GameObjects.Container, card: Extract<Card, { kind: 'item' }>): void {
    const left = -CARD.w / 2;
    const top = -CARD.h / 2;
    const { item, id, held } = card;
    const look = ITEM_LOOK[id];
    const g = this.add.graphics();
    const well = { x: left + 36, y: 4 };
    g.fillStyle(COLORS.ink, 0.9).fillCircle(well.x, well.y, 25);
    g.fillStyle(look.color, 0.3).fillCircle(well.x, well.y, 22);
    g.lineStyle(2, look.color, 1).strokeCircle(well.x, well.y, 22);
    const icon = this.add.image(well.x, well.y, look.icon);
    const tx = left + 76;
    const name = label(this, tx, top + 6, item.name, { size: 17, bold: true, color: css(COLORS.gold) });
    const stack = label(this, tx + name.width + 10, top + 10, `ถืออยู่ ${held}/${ITEM_STACK_MAX}`, { size: 12, bold: true, color: held ? '#ffffff' : css(COLORS.green) });
    const use = label(this, tx, top + 30, WORDS.itemUse(item), { size: 11, color: '#c9a86a' });
    const desc = label(this, tx, top + 50, item.desc, { size: 13, color: '#ffffff', wrap: CARD.w - 76 - 96 });
    box.add([frame(this, 'itemCard', 0, 0, CARD.w, CARD.h), g, icon, name, stack, use, desc]);
  }

  private drawButtons(): void {
    const refresh = refreshShop(this.run);
    if (!refresh.ok && refresh.reason === 'hangar') {
      this.button('go', VIEW.w / 2, WORDS.launch, BUTTON.go, () => this.leave());
      return;
    }
    this.button('refresh', VIEW.w / 2 - 110, WORDS.refresh(refreshCost(this.run)), refresh.ok ? BUTTON.refresh : BUTTON.disabled, () => this.refresh());
    this.button('go', VIEW.w / 2 + 110, WORDS.go, BUTTON.go, () => this.leave());
  }

  private button(id: string, x: number, text: string, look: ButtonLook, onClick: () => void): void {
    const box = this.add.container(x, BUTTON_Y);
    const bg = frame(this, look.idle, 0, 0, 200, 40);
    const t = label(this, 0, -12, text, { size: 15, bold: true, align: 'center' });
    const hit = this.add.zone(0, 0, 200, 40).setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      bg.setTexture(look.hover);
      this.tweens.add({ targets: box, scale: 1.05, duration: 80 });
    });
    hit.on('pointerout', () => {
      bg.setTexture(look.idle);
      this.tweens.add({ targets: box, scale: 1, duration: 80 });
    });
    onTap(hit, onClick);
    box.add([bg, t, hit]);
    this.layer.add(box);
    this.targets.push({ id, rect: { x: x - 100, y: BUTTON_Y - 20, w: 200, h: 40 } });
  }

  private drawStatus(): void {
    const stats = deriveStats(this.run.perks);
    const y = STATUS_Y;
    this.layer.add(frame(this, 'panel', 20, y, VIEW.w - 40, STATUS_H).setOrigin(0));
    for (let i = 0; i < stats.maxHp; i++) this.layer.add(this.add.image(38 + i * 18, y + 18, i < this.run.hp ? 'heart' : 'heartEmpty'));
    this.layer.add(this.add.image(VIEW.w - 40, y + 18, 'coinLarge'));
    this.layer.add(label(this, VIEW.w - 54, y + 7, String(this.run.money), { size: 17, bold: true, color: css(COLORS.yellow), align: 'right' }));

    const owned = [
      ...PERK_IDS.filter((id) => this.run.perks[id]).map((id) => {
        const { color, chip } = BRANCH_LOOK[PERKS[id].branch];
        return { ref: { kind: 'perk' as const, id }, text: `${PERKS[id].name} ${this.run.perks[id]}`, color, chip };
      }),
      ...ITEM_IDS.filter((id) => this.run.items[id]).map((id) => ({ ref: { kind: 'item' as const, id }, text: `${ITEMS[id].name} x${this.run.items[id]}`, color: COLORS.gold, chip: ITEM_CHIP })),
    ];
    if (!owned.length) {
      this.layer.add(label(this, 34, y + 40, 'ยังไม่มีอัปเกรด เลือกซื้อการ์ดด้านบนได้เลย', { size: 12, color: '#8a96c8' }));
      return;
    }
    let cx = 34;
    let cy = y + 36;
    for (const [i, chip] of owned.entries()) {
      const { bg, text } = this.chip(chip.text, chip.color, chip.chip);
      if (cx + bg.width > VIEW.w - 30) [cx, cy] = [34, cy + CHIP_ROW];
      if (cy + CHIP_ROW > y + STATUS_H) {
        bg.destroy();
        text.setText(`+${owned.length - i} more`).setOrigin(0.5, 0).setPosition(VIEW.w / 2, y + 10);
        return;
      }
      bg.setPosition(cx, cy + 2);
      text.setPosition(cx + 5, cy);
      this.hoverChip(chip.ref, { x: cx, y: cy + 2, w: bg.width, h: bg.height });
      cx += bg.width + 4;
    }
  }

  private chip(chipText: string, color: number, key: FrameKey): { bg: Phaser.GameObjects.NineSlice; text: Phaser.GameObjects.Text } {
    const text = label(this, 0, 0, chipText, { size: 10, bold: true, color: css(color) });
    const bg = frame(this, key, 0, 0, Math.ceil(text.width + 10), 16).setOrigin(0);
    this.layer.add([bg, text]);
    return { bg, text };
  }

  private hoverChip(ref: OwnedRef, rect: Rect): void {
    // Padded so neighboring chips' zones touch and the pointer never crosses dead space between them.
    const hit = this.add.zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w + 4, rect.h + 2).setInteractive();
    const show = () => this.tooltip.show(ref, ownedTip(this.run, ref), rect);
    hit.on('pointerover', (p: Phaser.Input.Pointer) => !p.wasTouch && show());
    hit.on('pointerout', (p: Phaser.Input.Pointer) => !p.wasTouch && this.tooltip.hide());
    hit.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      if (!p.wasTouch) return;
      event.stopPropagation();
      const open = this.tooltip.shown?.ref;
      if (open?.kind === ref.kind && open.id === ref.id) this.tooltip.hide();
      else show();
    });
    this.layer.add(hit);
    this.chips.push({ ref, rect });
  }

  private buy(slot: number): void {
    if (this.leaving) return;
    const card = cardsOf(this.run)[slot];
    const result = buyOffer(this.run, slot);
    this.apply(result, slot);
    if (result.ok && card && card.kind !== 'soldOut') {
      const box = this.cards[slot];
      if (!box) return;
      const color = card.kind === 'perk' ? BRANCH_LOOK[card.perk.branch].color : ITEM_LOOK[card.id].color;
      const text = card.kind === 'perk' ? `${card.perk.name} Lv ${card.level + 1}!` : `${card.item.name} x${card.held + 1}!`;
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
      const msg = label(this, box.x, box.y - 20, text, { size: 20, bold: true, color: css(color), align: 'center', stroke: '#0d0b26' });
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

// Fires on release over the zone only for a press that began on it, so a steering finger lifted as the shop opens buys nothing.
function onTap(zone: Phaser.GameObjects.Zone, fn: () => void): void {
  const pressed = new Set<number>();
  zone.on('pointerdown', (p: Phaser.Input.Pointer) => pressed.add(p.id));
  zone.on('pointerout', (p: Phaser.Input.Pointer) => pressed.delete(p.id));
  zone.on('pointerup', (p: Phaser.Input.Pointer) => pressed.delete(p.id) && fn());
}
