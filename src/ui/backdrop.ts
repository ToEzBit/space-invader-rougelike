import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import { bakeDebris, bakeSector, seeded, type Rand } from '../art/sky';
import { ART_SCALE } from '../art/sprites';
import { STAR_LAYERS } from '../art/textures';
import { sectorFor } from '../core/sectors';
import { onViewport, viewport, VIEW, type Viewport } from '../view';

const LAYER_SPEED = [10, 26, 60];
// Slower than the farthest stars, so the set piece reads as the most distant thing on screen.
const PIECE_SPEED = 3;
// Dim enough that foes and their bullets stay the brightest things on screen.
const PIECE_ALPHA = 0.7;
// Faster than the farthest stars, so the debris reads as nearer than them.
const DEBRIS_SPEED = { min: 26, max: 46 };
const FRAME_GLOW = [
  { width: 8, alpha: 0.05 },
  { width: 4, alpha: 0.1 },
  { width: 1.5, alpha: 0.55 },
] as const;

// The set piece sits above the stars it hides, and the debris above both; all stay under the foes.
const DEPTH = { nebula: -10, stars: -9, piece: -8.9, debris: -8.6, frame: -8 } as const;

type Drifter = { image: Phaser.GameObjects.Image; vx: number; vy: number; spin: number };

export class Backdrop {
  private readonly nebula: Phaser.GameObjects.TileSprite;
  private readonly layers: Phaser.GameObjects.TileSprite[];
  private readonly scroll = LAYER_SPEED.map(() => 0);
  private readonly piece: Phaser.GameObjects.Image | null = null;
  private readonly debris: Drifter[] = [];
  private readonly rand: Rand;
  private view: Viewport;

  // Without a stage it shows the plain sky the menus use.
  constructor(scene: Phaser.Scene, stage?: number) {
    this.view = viewport(scene);
    this.rand = seeded(1 + (stage ?? 0) * 6271);
    const sector = stage === undefined ? null : sectorFor(stage);
    const keys = sector && bakeSector(scene, sector);
    this.nebula = scene.add.tileSprite(0, 0, VIEW.w, VIEW.h, keys?.nebula ?? 'nebula').setOrigin(0).setDepth(DEPTH.nebula);
    this.layers = STAR_LAYERS.map((key) => scene.add.tileSprite(0, 0, VIEW.w, VIEW.h, key).setOrigin(0).setDepth(DEPTH.stars));
    if (sector && keys) {
      this.piece = scene.add.image(sector.at.x, sector.at.y, keys.piece).setScale(ART_SCALE).setDepth(DEPTH.piece).setAlpha(PIECE_ALPHA);
      const variants = bakeDebris(scene, sector.debris.kind);
      for (let i = 0; i < sector.debris.count; i++) {
        const image = scene.add
          .image(0, 0, variants[i % variants.length]!)
          .setScale(ART_SCALE)
          .setDepth(DEPTH.debris)
          .setTint(sector.debris.tint)
          .setAlpha(0.3 + this.rand() * 0.25);
        const drifter = { image, vx: 0, vy: 0, spin: 0 };
        this.respawn(drifter, this.view.y + this.rand() * this.view.h);
        this.debris.push(drifter);
      }
    }
    const frame = scene.add.graphics().setDepth(DEPTH.frame);
    for (const { width, alpha } of FRAME_GLOW) {
      frame.lineStyle(width, COLORS.violet, alpha).strokeRect(-width / 2, -width / 2, VIEW.w + width, VIEW.h + width);
    }
    onViewport(scene, (view) => {
      this.view = view;
      for (const layer of [this.nebula, ...this.layers]) layer.setPosition(view.x, view.y).setSize(view.w, view.h);
      this.place();
    });
  }

  update(dtSec: number, speed = 1): void {
    const dt = dtSec * speed;
    this.layers.forEach((_, i) => (this.scroll[i]! -= LAYER_SPEED[i]! * dt));
    const bottom = this.view.y + this.view.h;
    if (this.piece) {
      this.piece.y += PIECE_SPEED * dt;
      if (this.piece.y - this.piece.displayHeight / 2 > bottom) this.piece.y = this.view.y - this.piece.displayHeight / 2;
    }
    for (const d of this.debris) {
      d.image.x += d.vx * dt;
      d.image.y += d.vy * dt;
      d.image.angle += d.spin * dt;
      if (d.image.y - d.image.displayHeight > bottom) this.respawn(d, this.view.y - d.image.displayHeight - this.rand() * 120);
    }
    this.place();
  }

  private respawn(d: Drifter, y: number): void {
    d.image.setPosition(this.view.x + this.rand() * this.view.w, y).setAngle(this.rand() * 360);
    d.vy = DEBRIS_SPEED.min + this.rand() * (DEBRIS_SPEED.max - DEBRIS_SPEED.min);
    d.vx = (this.rand() - 0.5) * 12;
    d.spin = (this.rand() - 0.5) * 70;
  }

  // Tile offsets track the sprite position so the playfield shows the same stars at any window size.
  private place(): void {
    this.nebula.setTilePosition(this.nebula.x, this.nebula.y);
    this.layers.forEach((layer, i) => layer.setTilePosition(layer.x, layer.y + this.scroll[i]!));
  }
}
