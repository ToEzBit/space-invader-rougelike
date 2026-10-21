import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import { STAR_LAYERS } from '../art/textures';
import { onViewport, VIEW } from '../view';

const LAYER_SPEED = [10, 26, 60];
const FRAME_GLOW = [
  { width: 8, alpha: 0.05 },
  { width: 4, alpha: 0.1 },
  { width: 1.5, alpha: 0.55 },
] as const;

export class Backdrop {
  private readonly nebula: Phaser.GameObjects.TileSprite;
  private readonly layers: Phaser.GameObjects.TileSprite[];
  private readonly scroll = LAYER_SPEED.map(() => 0);

  constructor(scene: Phaser.Scene) {
    this.nebula = scene.add.tileSprite(0, 0, VIEW.w, VIEW.h, 'nebula').setOrigin(0).setDepth(-10);
    this.layers = STAR_LAYERS.map((key) => scene.add.tileSprite(0, 0, VIEW.w, VIEW.h, key).setOrigin(0).setDepth(-9));
    const frame = scene.add.graphics().setDepth(-8);
    for (const { width, alpha } of FRAME_GLOW) {
      frame.lineStyle(width, COLORS.violet, alpha).strokeRect(-width / 2, -width / 2, VIEW.w + width, VIEW.h + width);
    }
    onViewport(scene, ({ x, y, w, h }) => {
      for (const layer of [this.nebula, ...this.layers]) layer.setPosition(x, y).setSize(w, h);
      this.place();
    });
  }

  update(dtSec: number, speed = 1): void {
    this.layers.forEach((_, i) => (this.scroll[i]! -= LAYER_SPEED[i]! * dtSec * speed));
    this.place();
  }

  // Tile offsets track the sprite position so the playfield shows the same stars at any window size.
  private place(): void {
    this.nebula.setTilePosition(this.nebula.x, this.nebula.y);
    this.layers.forEach((layer, i) => layer.setTilePosition(layer.x, layer.y + this.scroll[i]!));
  }
}
