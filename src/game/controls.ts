import Phaser from 'phaser';
import { itemForCode, type ItemId } from '../core/items';

// Keys give a direction to fly at full speed; a finger gives a world point to fly to.
export type Move = { kind: 'dir'; x: number; y: number } | { kind: 'to'; x: number; y: number };

export type Controls = {
  move: Move;
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
  // Phaser re-dispatches the frame's whole key queue on every DOM key event, so Shift+Z in one frame reaches
  // 'keydown' listeners as Shift, Z, Shift, Z, ... Its own duplicate check only catches back-to-back repeats.
  private readonly seen = new WeakSet<KeyboardEvent>();

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
      if (e.repeat || this.seen.has(e)) return;
      this.seen.add(e);
      if (e.code === 'Space') this.transAmQueued = true;
      const item = itemForCode(e.code);
      if (item) this.itemsQueued.push(item);
    });
  }

  dropTransAm(): void {
    this.transAmQueued = false;
  }

  read(): Controls {
    const k = this.keys;
    const { dashQueued: dash, transAmQueued: transAm, itemsQueued: useItems } = this;
    this.dashQueued = false;
    this.transAmQueued = false;
    this.itemsQueued = [];
    if (!k) return { move: { kind: 'dir', x: 0, y: 0 }, dash, transAm, useItems };
    const held = (...keys: Phaser.Input.Keyboard.Key[]) => Number(keys.some((key) => key.isDown));
    return {
      move: { kind: 'dir', x: held(k.right, k.d) - held(k.left, k.a), y: held(k.down, k.s) - held(k.up, k.w) },
      dash,
      transAm,
      useItems,
    };
  }
}
