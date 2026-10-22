import Phaser from 'phaser';
import { toggleMute } from './audio/music';
import { toggleGodMode } from './godMode';
import { BootScene } from './scenes/BootScene';
import { EndScene } from './scenes/EndScene';
import { ShopScene } from './scenes/ShopScene';
import { StageScene } from './scenes/StageScene';
import { TitleScene } from './scenes/TitleScene';
import { installDebug } from './debug';

// CSS stretches the canvas over the window; its backing store matches device pixels so text and
// thin lines stay sharp on HiDPI screens. Capped because fill rate grows with the square.
const devicePixels = () => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { width: Math.round(window.innerWidth * dpr), height: Math.round(window.innerHeight * dpr) };
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#07061a',
  pixelArt: true,
  // A steering thumb plus taps on the tray with other fingers.
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.NONE, ...devicePixels(), fullscreenTarget: 'game' },
  scene: [BootScene, TitleScene, StageScene, ShopScene, EndScene],
});

game.events.once(Phaser.Core.Events.READY, () => {
  const fill = () => {
    const { width, height } = devicePixels();
    if (width !== game.scale.width || height !== game.scale.height) game.scale.resize(width, height);
  };
  fill();
  window.addEventListener('resize', fill);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF' && !e.repeat) game.scale.toggleFullscreen();
    if (e.code === 'KeyM' && !e.repeat) toggleMute();
    if (e.code === 'KeyG' && !e.repeat) toggleGodMode();
  });
});

installDebug(game);
