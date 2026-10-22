import Phaser from 'phaser';
import type { CharacterKey } from '../art/characters';
import { COLORS } from '../art/palette';
import { VIEW } from '../view';
import { MOTIONS, originFor, poseAt, poseOf, type AuraKind, type Move, type Pose } from './bossMotion';
import type { Point } from './geometry';
import { DEPTH } from './layout';

type Graphics = Phaser.GameObjects.Graphics;

const GHOSTS = [
  { lagMs: 60, alpha: 0.45, grow: 0.04 },
  { lagMs: 120, alpha: 0.3, grow: 0.08 },
  { lagMs: 190, alpha: 0.16, grow: 0.12 },
] as const;
const DIM = { color: 0x05040f, alpha: 0.6, depth: -7 } as const;
const WHITE_HOT = 0.7;
export const MUZZLE_DROP = 0.28;

// castPalm is the casting art's open hand, in art pixels from its center, so a skill that forms in her hand draws there.
export type BodyLook = { glow: number; castArt?: CharacterKey; castPalm?: Point };

type Layers = { behind: Graphics; behindAdd: Graphics; front: Graphics };
type Aura = (g: Layers, at: { center: Point; muzzle: Point; hand: Point }, ms: number, a: number, color: number, leadMs: number) => void;

function glowLine(g: Graphics, width: number, color: number, a: number, x1: number, y1: number, x2: number, y2: number): void {
  g.lineStyle(width * 2.4, color, 0.16 * a).lineBetween(x1, y1, x2, y2);
  g.lineStyle(width, color, 0.45 * a).lineBetween(x1, y1, x2, y2);
  g.lineStyle(Math.max(1, width * 0.3), COLORS.white, 0.9 * a).lineBetween(x1, y1, x2, y2);
}

function glowRing(g: Graphics, width: number, color: number, a: number, x: number, y: number, r: number): void {
  g.lineStyle(width * 2.4, color, 0.16 * a).strokeCircle(x, y, r);
  g.lineStyle(width, color, 0.5 * a).strokeCircle(x, y, r);
  g.lineStyle(Math.max(1, width * 0.3), COLORS.white, 0.85 * a).strokeCircle(x, y, r);
}

const AURAS: Record<AuraKind, Aura> = {
  burst: ({ behindAdd }, { center }, ms, a, color) => {
    if (ms >= 0) glowRing(behindAdd, 4, color, a, center.x, center.y, 30 + ms * 0.32);
  },
  shock: ({ behindAdd }, { center }, ms, a, color) => {
    if (ms < 0) return;
    const r = 34 + ms * 0.75;
    const y = center.y + 40;
    behindAdd.lineStyle(14, color, 0.2 * a).strokeEllipse(center.x, y, r * 2, r * 0.7);
    behindAdd.lineStyle(5, color, 0.55 * a).strokeEllipse(center.x, y, r * 2, r * 0.7);
    behindAdd.lineStyle(2, COLORS.white, 0.85 * a).strokeEllipse(center.x, y, r * 2, r * 0.7);
  },
  rays: ({ behindAdd }, { center }, ms, a, color) => {
    const count = 16;
    const spin = ms / 1400;
    const from = 46 + Math.max(0, ms) * 0.22;
    const to = from + 16 + 62 * a;
    for (let i = 0; i < count; i++) {
      const c = Math.cos(spin + (Math.PI * 2 * i) / count);
      const s = Math.sin(spin + (Math.PI * 2 * i) / count);
      glowLine(behindAdd, i % 2 ? 2 : 4, color, a, center.x + c * from, center.y + s * from, center.x + c * to, center.y + s * to);
    }
  },
  cross: ({ behindAdd }, { center }, ms, a, color) => {
    const tall = 50 + 150 * a + Math.max(0, ms) * 0.05;
    const wide = 40 + 60 * a;
    const y = center.y - 22;
    glowLine(behindAdd, 6 + 6 * a, color, a, center.x, center.y - tall, center.x, center.y + tall);
    glowLine(behindAdd, 5 + 4 * a, color, a, center.x - wide, y, center.x + wide, y);
    behindAdd.fillStyle(COLORS.white, 0.5 * a).fillCircle(center.x, y, 6 + 8 * a);
  },
  implode: ({ front }, { hand }, ms, a, color, leadMs) => {
    if (ms >= 0) return glowRing(front, 4, color, a, hand.x, hand.y, 16 + ms * 0.45);
    for (let i = 0; i < 3; i++) {
      const k = 1 - (((((ms + leadMs) / 420 + i / 3) % 1) + 1) % 1);
      glowRing(front, 3, color, a * (1 - k), hand.x, hand.y, 8 + k * 110);
    }
    front.fillStyle(DIM.color, 0.95 * a).fillCircle(hand.x, hand.y, 4 + 9 * a);
    front.lineStyle(2, COLORS.gold, 0.9 * a).strokeCircle(hand.x, hand.y, 6 + 9 * a);
  },
  corona: ({ behind, behindAdd }, { center }, ms, a, color) => {
    const r = 30 + 36 * a;
    behind.fillStyle(DIM.color, 0.8 * a).fillCircle(center.x, center.y, r);
    glowRing(behindAdd, 4, color, a, center.x, center.y, r + 3);
    behindAdd.lineStyle(14, COLORS.violet, 0.25 * a).strokeCircle(center.x, center.y, r + 10);
    for (const delay of [0, 130]) if (ms >= delay) glowRing(behindAdd, 4, color, a, center.x, center.y, r + (ms - delay) * 0.55);
  },
};

export class BossBody {
  private readonly overlay: Phaser.GameObjects.Image;
  private readonly ghosts: Phaser.GameObjects.Image[];
  private readonly layers: Layers;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private drawn: Pose = poseOf([]);

  constructor(
    scene: Phaser.Scene,
    private readonly sprite: Phaser.GameObjects.Image,
    private readonly halo: Phaser.GameObjects.Image,
    private readonly haloScale: number,
  ) {
    this.dim = scene.add.rectangle(VIEW.w / 2, VIEW.h / 2, VIEW.w * 4, VIEW.h * 4, DIM.color, 0).setDepth(DIM.depth);
    const behind = scene.add.graphics().setDepth(DEPTH.foe - 1);
    const behindAdd = scene.add.graphics().setDepth(DEPTH.foe - 1).setBlendMode(Phaser.BlendModes.ADD);
    this.ghosts = GHOSTS.map(() =>
      scene.add.image(0, 0, sprite.texture.key).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.foe - 1).setVisible(false),
    );
    this.overlay = scene.add.image(0, 0, sprite.texture.key).setDepth(DEPTH.foe).setVisible(false);
    this.layers = { behind, behindAdd, front: scene.add.graphics().setDepth(DEPTH.foe + 1) };
  }

  get drawnCenter(): Point {
    return { x: this.sprite.x + this.drawn.dx, y: this.sprite.y + this.drawn.dy };
  }

  get pose(): Pose {
    return this.drawn;
  }

  get art(): string | null {
    return this.overlay.visible ? this.overlay.texture.key : null;
  }

  show(moves: readonly Move[], look: BodyLook, idleGlow: number): void {
    const pose = poseOf(moves);
    this.drawn = pose;
    const s = this.sprite;
    const base = s.texture.key;
    const castKey = look.castArt && pose.cast > 0 ? look.castArt : null;
    const shape = castKey && pose.cast >= 0.5 ? castKey : base;
    const center = this.drawnCenter;
    const lead = moves.reduce<Move | null>((best, m) => (best && strength(poseAt(best.pattern, best.ms, best.dir)) >= strength(poseAt(m.pattern, m.ms, m.dir)) ? best : m), null);
    const color = (lead && MOTIONS[lead.pattern].color) ?? look.glow;

    const o = originFor(s.width, s.height, pose);
    s.setOrigin(o.x, o.y).setScale(pose.sx, pose.sy).setRotation(pose.rot).setAlpha(castKey && pose.cast >= 1 ? 0 : 1);
    this.overlay.setVisible(castKey !== null);
    if (castKey)
      this.overlay
        .setTexture(castKey)
        .setPosition(center.x, center.y)
        .setScale(pose.sx, pose.sy)
        .setRotation(pose.rot)
        .setAlpha(pose.cast)
        .setTint(s.tint)
        .setTintMode(s.tintMode);

    const grow = 1 + 0.1 * pose.glow + 0.06 * pose.flash;
    this.halo
      .setTexture(shape)
      .setPosition(center.x, center.y)
      .setRotation(pose.rot)
      .setScale(this.haloScale * pose.sx * grow, this.haloScale * pose.sy * grow)
      .setTint(pose.flash > WHITE_HOT ? COLORS.white : color)
      .setAlpha(Math.min(1, idleGlow + 0.5 * pose.glow + 0.6 * pose.flash));

    GHOSTS.forEach((ghost, i) => {
      const img = this.ghosts[i]!;
      img.setVisible(pose.ghosts > 0);
      if (pose.ghosts <= 0) return;
      const p = poseOf(moves, ghost.lagMs);
      img
        .setTexture(shape)
        .setPosition(s.x + p.dx, s.y + p.dy)
        .setRotation(p.rot)
        .setScale(p.sx * (1 + ghost.grow), p.sy * (1 + ghost.grow))
        .setTint(color)
        .setAlpha(ghost.alpha * pose.ghosts);
    });

    this.dim.setFillStyle(DIM.color, DIM.alpha * pose.darken);
    for (const g of Object.values(this.layers)) g.clear();
    const muzzle = { x: center.x - Math.sin(pose.rot) * s.height * MUZZLE_DROP * pose.sy, y: center.y + Math.cos(pose.rot) * s.height * MUZZLE_DROP * pose.sy };
    const palm = castKey && look.castPalm;
    const hand = palm
      ? { x: center.x + (palm.x * Math.cos(pose.rot) - palm.y * Math.sin(pose.rot)) * pose.sx, y: center.y + (palm.x * Math.sin(pose.rot) + palm.y * Math.cos(pose.rot)) * pose.sy }
      : muzzle;
    for (const m of moves) {
      const p = poseAt(m.pattern, m.ms, m.dir);
      const motion = MOTIONS[m.pattern];
      if (p.aura > 0) AURAS[motion.aura](this.layers, { center, muzzle, hand }, m.ms, p.aura, motion.color ?? look.glow, -motion.keys[0]!.at);
    }
    if (pose.glint > 0) glint(this.layers.front, muzzle, pose.glint, color);
  }

  rest(glow: number): void {
    this.drawn = poseOf([]);
    this.sprite.setOrigin(0.5).setScale(1).setRotation(0).setAlpha(1);
    this.halo.setRotation(0).setTexture(this.sprite.texture.key).setTint(glow);
    this.overlay.setVisible(false);
    for (const g of this.ghosts) g.setVisible(false);
    this.dim.setFillStyle(DIM.color, 0);
    for (const g of Object.values(this.layers)) g.clear();
  }
}

const strength = (p: Pose) => p.glow + p.ghosts + p.aura + p.cast;

function glint(g: Graphics, at: Point, a: number, color: number): void {
  const long = 10 + 16 * a;
  const short = 4 + 6 * a;
  g.fillStyle(color, 0.6 * a).fillCircle(at.x, at.y, 3 + 5 * a);
  g.lineStyle(3, color, 0.7 * a).lineBetween(at.x - long, at.y, at.x + long, at.y).lineBetween(at.x, at.y - short, at.x, at.y + short);
  g.lineStyle(1, COLORS.white, a).lineBetween(at.x - long, at.y, at.x + long, at.y).lineBetween(at.x, at.y - short, at.x, at.y + short);
  g.fillStyle(COLORS.white, a).fillCircle(at.x, at.y, 1.5 + 2 * a);
}
