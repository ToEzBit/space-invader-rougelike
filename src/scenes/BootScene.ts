import Phaser from 'phaser';
import { CHARACTER_ART } from '../art/characters';
import { buildTextures } from '../art/textures';
import { UI_FRAMES, UI_ICONS, UI_IMAGES } from '../art/ui';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    for (const [key, url] of Object.entries({ ...CHARACTER_ART, ...UI_ICONS, ...UI_IMAGES })) this.load.image(key, url);
    for (const [key, { url }] of Object.entries(UI_FRAMES)) this.load.image(key, url);
  }

  create(): void {
    buildTextures(this);
    this.scene.start('Title');
  }
}
