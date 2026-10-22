import Phaser from 'phaser';
import { itemForCode, type ItemId } from '../core/items';
import type { Box, Point } from './geometry';

// Keys give a direction to fly at full speed; a finger gives a world point to fly to.
export type Move = { kind: 'dir'; x: number; y: number } | { kind: 'to'; x: number; y: number };

export type Controls = {
  move: Move;
  // True once per press of the dash key or tap on its slot.
  dash: boolean;
  // True once per press of Space or tap on its slot.
  transAm: boolean;
  // Items whose keys were pressed or slots tapped since the last read, in press order.
  useItems: readonly ItemId[];
};

// What a key press or a tap on a tray slot asks for.
export type TrayButton = 'transAm' | 'dash' | ItemId;
export type TrayHit = { button: TrayButton; x: number; y: number; r: number };

// The job a pointer took when it went down. A steering finger moves the ship by as much as it moved itself since
// `finger`, starting from `ship`, so the thumb can sit anywhere, below the playfield included, without covering it.
type Job = { kind: 'steer'; finger: Point; ship: Point } | { kind: 'button'; button: TrayButton };

type Ship = Point & { zone(): Box };

const K = Phaser.Input.Keyboard.KeyCodes;

export class StageControls {
  private readonly keys: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's', Phaser.Input.Keyboard.Key> | null;
  private readonly jobs = new Map<number, Job>();
  // Latched from the keydown or pointerdown event: a tap shorter than a frame clears Key's own justDown flag.
  private dashQueued = false;
  private transAmQueued = false;
  private itemsQueued: ItemId[] = [];
  // Phaser re-dispatches the frame's whole key queue on every DOM key event, so Shift+Z in one frame reaches
  // 'keydown' listeners as Shift, Z, Shift, Z, ... Its own duplicate check only catches back-to-back repeats.
  private readonly seen = new WeakSet<KeyboardEvent>();
  private lastMove: Move = { kind: 'dir', x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ship: Ship,
    private readonly tray: () => readonly TrayHit[],
  ) {
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
      if (!e.repeat) this.press('dash');
    });
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat || this.seen.has(e)) return;
      this.seen.add(e);
      if (e.code === 'Space') this.press('transAm');
      const item = itemForCode(e.code);
      if (item) this.press(item);
    });
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.pointerDown(p));
    for (const up of [Phaser.Input.Events.POINTER_UP, Phaser.Input.Events.POINTER_UP_OUTSIDE])
      scene.input.on(up, (p: Phaser.Input.Pointer) => this.jobs.delete(p.id));
  }

  dropTransAm(): void {
    this.transAmQueued = false;
  }

  read(): Controls {
    const { dashQueued: dash, transAmQueued: transAm, itemsQueued: useItems } = this;
    this.dashQueued = false;
    this.transAmQueued = false;
    this.itemsQueued = [];
    this.lastMove = this.steer() ?? this.keyDirection();
    return { move: this.lastMove, dash, transAm, useItems };
  }

  // Dev-only view of what each pointer is doing and where the ship was last told to go.
  debug(): { pointers: { id: number; job: 'steer' | TrayButton }[]; move: Move } {
    const pointers = [...this.jobs].map(([id, job]) => ({ id, job: job.kind === 'steer' ? ('steer' as const) : job.button }));
    return { pointers, move: this.lastMove };
  }

  private press(button: TrayButton): void {
    if (button === 'transAm') this.transAmQueued = true;
    else if (button === 'dash') this.dashQueued = true;
    else this.itemsQueued.push(button);
  }

  private pointerDown(p: Phaser.Input.Pointer): void {
    const at = this.worldOf(p);
    const hit = this.tray().find((b) => (b.x - at.x) ** 2 + (b.y - at.y) ** 2 <= b.r ** 2);
    if (hit) {
      this.jobs.set(p.id, { kind: 'button', button: hit.button });
      return this.press(hit.button);
    }
    // The newest finger takes over steering, so a thumb put down again before the last one lifted never fights it.
    for (const [id, job] of this.jobs) if (job.kind === 'steer') this.jobs.delete(id);
    this.jobs.set(p.id, { kind: 'steer', finger: at, ship: { x: this.ship.x, y: this.ship.y } });
  }

  private steer(): Move | null {
    for (const [id, job] of this.jobs) {
      if (job.kind !== 'steer') continue;
      const pointer = this.scene.input.manager.pointers[id];
      // A finger lifted while the scene was paused never sent its pointerup here.
      if (!pointer?.isDown) {
        this.jobs.delete(id);
        continue;
      }
      const finger = this.worldOf(pointer);
      const want = { x: job.ship.x + finger.x - job.finger.x, y: job.ship.y + finger.y - job.finger.y };
      const zone = this.ship.zone();
      const to = { x: Math.min(zone.right, Math.max(zone.left, want.x)), y: Math.min(zone.bottom, Math.max(zone.top, want.y)) };
      // Re-anchored at the wall, so pulling the finger back moves the ship at once instead of first undoing the overshoot.
      if (to.x !== want.x || to.y !== want.y) Object.assign(job, { finger, ship: to });
      return { kind: 'to', ...to };
    }
    return null;
  }

  private keyDirection(): Move {
    const k = this.keys;
    if (!k) return { kind: 'dir', x: 0, y: 0 };
    const held = (...keys: Phaser.Input.Keyboard.Key[]) => Number(keys.some((key) => key.isDown));
    return { kind: 'dir', x: held(k.right, k.d) - held(k.left, k.a), y: held(k.down, k.s) - held(k.up, k.w) };
  }

  private worldOf(p: Phaser.Input.Pointer): Point {
    const { x, y } = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x, y };
  }
}
