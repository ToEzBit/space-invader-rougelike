import Phaser from 'phaser';

export type Controls = {
  left: boolean;
  right: boolean;
  fire: boolean;
  // True only on the frame the dash key goes down.
  dash: boolean;
};

const K = Phaser.Input.Keyboard.KeyCodes;

export class KeyboardControls {
  private readonly keys: Record<'left' | 'right' | 'a' | 'd' | 'fire' | 'dash', Phaser.Input.Keyboard.Key> | null;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    this.keys = kb && {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      fire: kb.addKey(K.SPACE),
      dash: kb.addKey(K.SHIFT),
    };
  }

  read(): Controls {
    const k = this.keys;
    if (!k) return { left: false, right: false, fire: false, dash: false };
    return {
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
      fire: k.fire.isDown,
      dash: Phaser.Input.Keyboard.JustDown(k.dash),
    };
  }
}
