import Phaser from 'phaser';
import { itemForKey, type ItemId } from '../core/items';

export type Controls = {
  left: boolean;
  right: boolean;
  // True once per press of the dash key.
  dash: boolean;
  // Items whose keys were pressed since the last read, in press order.
  useItems: readonly ItemId[];
};

const K = Phaser.Input.Keyboard.KeyCodes;

export class KeyboardControls {
  private readonly keys: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key> | null;
  // Latched from the keydown event: a tap shorter than a frame clears Key's own justDown flag.
  private dashQueued = false;
  private itemsQueued: ItemId[] = [];
  // Phaser can hand the same KeyboardEvent to 'keydown' listeners twice in one frame; its own
  // duplicate check only catches back-to-back repeats. Counting presses needs exactly one.
  private lastItemEvent: KeyboardEvent | null = null;

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
      if (e.repeat || e === this.lastItemEvent) return;
      this.lastItemEvent = e;
      const item = itemForKey(e.key);
      if (item) this.itemsQueued.push(item);
    });
  }

  read(): Controls {
    const k = this.keys;
    const { dashQueued: dash, itemsQueued: useItems } = this;
    this.dashQueued = false;
    this.itemsQueued = [];
    if (!k) return { left: false, right: false, dash, useItems };
    return { left: k.left.isDown || k.a.isDown, right: k.right.isDown || k.d.isDown, dash, useItems };
  }
}
