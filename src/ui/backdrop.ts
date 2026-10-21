import Phaser from 'phaser';
import { STAR_LAYERS } from '../art/textures';
import { VIEW } from '../view';

const LAYER_SPEED = [10, 26, 60];

export class Backdrop {
  private readonly layers: Phaser.GameObjects.TileSprite[];

  constructor(scene: Phaser.Scene) {
    scene.add.image(0, 0, 'nebula').setOrigin(0).setDepth(-10);
    this.layers = STAR_LAYERS.map((key) => scene.add.tileSprite(0, 0, VIEW.w, VIEW.h, key).setOrigin(0).setDepth(-9));
  }

  update(dtSec: number, speed = 1): void {
    this.layers.forEach((layer, i) => (layer.tilePositionY -= LAYER_SPEED[i]! * dtSec * speed));
  }
}
