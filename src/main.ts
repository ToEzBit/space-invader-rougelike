import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { EndScene } from './scenes/EndScene';
import { ShopScene } from './scenes/ShopScene';
import { StageScene } from './scenes/StageScene';
import { TitleScene } from './scenes/TitleScene';
import { installDebug } from './debug';
import { RENDER_SCALE, VIEW } from './view';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW.w * RENDER_SCALE,
  height: VIEW.h * RENDER_SCALE,
  backgroundColor: '#07061a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, TitleScene, StageScene, ShopScene, EndScene],
});

installDebug(game);
