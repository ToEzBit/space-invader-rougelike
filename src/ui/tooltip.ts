import Phaser from 'phaser';
import { COLORS, css } from '../art/palette';
import { VIEW } from '../view';
import { frame } from './frame';
import { placeTip, type Rect, type Tip } from './ownedTip';
import { label } from './text';

const MAX_W = 260;
const PAD_X = 12;
const PAD_TOP = 6;
const PAD_BOTTOM = 8;
const DIM = '#8a96c8';
// The panel art is see-through in the middle; the tooltip floats over cards and needs a solid back.
const BACK_INSET = 3;
// Keeps the tooltip up while the pointer slides from one target to the next.
const HIDE_GRACE_MS = 90;

type Shown<T> = { ref: T; tip: Tip; bounds: Rect & { below: boolean } };

export class Tooltip<T> {
  private readonly box: Phaser.GameObjects.Container;
  private readonly back: Phaser.GameObjects.Rectangle;
  private readonly bg: Phaser.GameObjects.NineSlice;
  private readonly title: Phaser.GameObjects.Text;
  private readonly badge: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly desc: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private current: Shown<T> | null = null;
  private hiding: Phaser.Time.TimerEvent | null = null;
  private intros = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const wrap = MAX_W - 2 * PAD_X;
    this.back = scene.add.rectangle(0, 0, MAX_W, 64, COLORS.ink, 0.96).setOrigin(0);
    this.bg = frame(scene, 'panel', 0, 0, MAX_W, 64).setOrigin(0);
    this.title = label(scene, 0, 0, '', { size: 14, bold: true });
    this.badge = label(scene, 0, 0, '', { size: 11, bold: true });
    this.sub = label(scene, 0, 0, '', { size: 10, color: DIM });
    this.desc = label(scene, 0, 0, '', { size: 12, wrap });
    this.next = label(scene, 0, 0, '', { size: 11, color: DIM, wrap });
    this.box = scene.add.container(0, 0, [this.back, this.bg, this.title, this.badge, this.sub, this.desc, this.next]).setDepth(100).setVisible(false);
  }

  get shown(): Shown<T> | null {
    return this.current;
  }

  get fadeIns(): number {
    return this.intros;
  }

  show(ref: T, tip: Tip, anchor: Rect): void {
    this.hiding?.remove();
    this.hiding = null;
    this.scene.tweens.killTweensOf(this.box);
    const onScreen = this.box.visible;
    const bounds = this.layout(tip, anchor);
    this.current = { ref, tip, bounds };
    this.box.setVisible(true);
    if (onScreen) {
      this.box.setAlpha(1).setScale(1);
      return;
    }
    this.intros++;
    this.box.setAlpha(0).setScale(0.92);
    this.scene.tweens.add({ targets: this.box, alpha: 1, scale: 1, duration: 100, ease: 'Quad.easeOut' });
  }

  hide(): void {
    if (!this.current || this.hiding) return;
    this.hiding = this.scene.time.delayedCall(HIDE_GRACE_MS, () => {
      this.hiding = null;
      this.current = null;
      this.scene.tweens.add({ targets: this.box, alpha: 0, duration: 80, onComplete: () => this.box.setVisible(false) });
    });
  }

  clear(): void {
    this.hiding?.remove();
    this.hiding = null;
    this.scene.tweens.killTweensOf(this.box);
    this.current = null;
    this.box.setVisible(false);
  }

  private layout(tip: Tip, anchor: Rect): Shown<T>['bounds'] {
    this.title.setText(tip.title).setColor(css(tip.color));
    this.badge.setText(tip.badge);
    this.sub.setText(tip.sub);
    this.desc.setText(tip.desc);
    this.next.setText(tip.next ?? '').setVisible(tip.next !== undefined);

    const rows: Phaser.GameObjects.Text[] = [this.sub, this.desc];
    if (tip.next !== undefined) rows.push(this.next);
    const inner = Math.max(this.title.width + 8 + this.badge.width, ...rows.map((t) => t.width));
    const w = even(Math.min(MAX_W, inner + 2 * PAD_X));
    let y = PAD_TOP;
    const at: [Phaser.GameObjects.Text, number, number][] = [
      [this.title, PAD_X, y],
      [this.badge, PAD_X + this.title.width + 8, y + 3],
    ];
    y += this.title.height - 2;
    for (const row of rows) {
      at.push([row, PAD_X, y]);
      y += row.height;
    }
    const h = even(y + PAD_BOTTOM);

    const bounds = placeTip(anchor, w, h, VIEW);
    // The pivot sits on the edge that faces the anchor, so the scale-in grows out of it.
    const pivot = { x: w / 2, y: bounds.below ? 0 : h };
    this.box.setPosition(bounds.x + pivot.x, bounds.y + pivot.y);
    this.back.setPosition(BACK_INSET - pivot.x, BACK_INSET - pivot.y).setSize(w - 2 * BACK_INSET, h - 2 * BACK_INSET);
    this.bg.setPosition(-pivot.x, -pivot.y).setSize(w, h);
    for (const [text, x, ty] of at) text.setPosition(x - pivot.x, Math.round(ty) - pivot.y);
    return bounds;
  }
}

function even(n: number): number {
  return Math.ceil(n / 2) * 2;
}
