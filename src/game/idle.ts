import type Phaser from 'phaser';

// Characters have one frame, so idle life is a whole-pixel hop. Only the drawn image moves:
// the sprite's position, which collisions, enemy fire and HP bars read, stays put.
// Two world units matches how far one art pixel moved between the old two-frame sprites.
const HOP_PX = 2;

export function hop(sprite: Phaser.GameObjects.Image, up: boolean): void {
  sprite.setOrigin(0.5, 0.5 + (up ? HOP_PX / sprite.displayHeight : 0));
}

// Alternates every `beatMs`, for characters that have no march step to keep time with.
export function beatAt(ms: number, beatMs: number): boolean {
  return Math.floor(ms / beatMs) % 2 === 1;
}
