import Phaser from 'phaser';
import { itemForKey, type ItemId } from '../core/items';

export type Controls = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  // True once per press of the dash key.
  dash: boolean;
  // True once per press of Space.
  transAm: boolean;
  // Items whose keys were pressed since the last read, in press order.
  useItems: readonly ItemId[];
};

const K = Phaser.Input.Keyboard.KeyCodes;

export class KeyboardControls {
  private readonly keys: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's', Phaser.Input.Keyboard.Key> | null;
  // Latched from the keydown event: a tap shorter than a frame clears Key's own justDown flag.
  private dashQueued = false;
  private transAmQueued = false;
  private itemsQueued: ItemId[] = [];
  // Phaser can hand the same KeyboardEvent to 'keydown' listeners twice in one frame; its own
  // duplicate check only catches back-to-back repeats. Counting presses needs exactly one.
  private lastEvent: KeyboardEvent | null = null;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    this.keys = kb && {
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      a: kb.addKey(K.A),
      d: kb.addKey(K.D),
      w: kb.addKey(K.W),
      s: kb.addKey(K.S),
    };
    kb?.on('keydown-SHIFT', (e: KeyboardEvent) => {
      if (!e.repeat) this.dashQueued = true;
    });
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat || e === this.lastEvent) return;
      this.lastEvent = e;
      if (e.code === 'Space') this.transAmQueued = true;
      const item = itemForKey(e.key);
      if (item) this.itemsQueued.push(item);
    });
  }

  // Forgets a Space press made while TRANS-AM could not start, so it is not acted on later.
  dropTransAm(): void {
    this.transAmQueued = false;
  }

  read(): Controls {
    const k = this.keys;
    const { dashQueued: dash, transAmQueued: transAm, itemsQueued: useItems } = this;
    this.dashQueued = false;
    this.transAmQueued = false;
    this.itemsQueued = [];
    if (!k) return { left: false, right: false, up: false, down: false, dash, transAm, useItems };
    return {
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
      up: k.up.isDown || k.w.isDown,
      down: k.down.isDown || k.s.isDown,
      dash,
      transAm,
      useItems,
    };
  }
}
