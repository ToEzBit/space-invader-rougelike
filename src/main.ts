import Phaser from 'phaser';

class Smoke extends Phaser.Scene {
  create() {
    const tex = this.textures.createCanvas('px', 4, 4);
    tex?.context.fillRect(0, 0, 4, 4);
    tex?.refresh();
    this.physics.add.image(240, 320, 'px').setScale(8);
    this.add.text(20, 20, 'ทดสอบภาษาไทย OK', { fontFamily: 'sans-serif', fontSize: '20px' });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 640,
  pixelArt: true,
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Smoke],
});
