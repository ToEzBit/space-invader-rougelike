import Phaser from 'phaser';
import { itemForKey, type ItemId } from '../core/items';

export type Controls = {
  left: boolean;
  right: boolean;
  // True once per press of the dash key.
  dash: boolean;
  // The item whose key was pressed since the last read.
  useItem: ItemId | null;
};

const K = Phaser.Input.Keyboard.KeyCodes;

export class KeyboardControls {
  private readonly keys: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key> | null;
  // Latched from the keydown event: a tap shorter than a frame clears Key's own justDown flag.
  private dashQueued = false;
  private itemQueued: ItemId | null = null;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    this.keys = kb && {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
    };
    kb?.on('keydown-SHIFT', (e: KeyboardEvent) => {
      if (!e.repeat) this.dashQueued = true;
    });
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.itemQueued = itemForKey(e.key) ?? this.itemQueued;
    });
  }

  read(): Controls {
    const k = this.keys;
    const { dashQueued: dash, itemQueued: useItem } = this;
    this.dashQueued = false;
    this.itemQueued = null;
    if (!k) return { left: false, right: false, dash, useItem };
    return { left: k.left.isDown || k.a.isDown, right: k.right.isDown || k.d.isDown, dash, useItem };
  }
}
