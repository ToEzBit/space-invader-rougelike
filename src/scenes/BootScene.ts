import Phaser from 'phaser';
import { CHARACTER_ART } from '../art/characters';
import { buildTextures } from '../art/textures';
import { UI_ICONS } from '../art/ui';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const [key, url] of Object.entries({ ...CHARACTER_ART, ...UI_ICONS })) this.load.image(key, url);
  }

  create(): void {
    buildTextures(this);
    this.scene.start('Title');
  }
}
