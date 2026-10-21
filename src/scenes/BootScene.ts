import Phaser from 'phaser';
import { CHARACTER_ART } from '../art/characters';
import { buildTextures } from '../art/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const [key, url] of Object.entries(CHARACTER_ART)) this.load.image(key, url);
  }

  create(): void {
    buildTextures(this);
    this.scene.start('Title');
  }
}
