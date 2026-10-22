import Phaser from 'phaser';
import type { SpriteKey } from '../art/sprites';
import { VIEW } from '../view';
import type { DamageSource, Foe } from './world';

export type BulletKind = 'shot' | 'crit' | 'droneShot' | 'missile' | 'pellet' | 'needle' | 'orb' | 'voidOrb';

type BulletDef = {
  texture: SpriteKey;
  radius: number;
  // Rotated to face their velocity; round bullets spin instead.
  facing: 'velocity' | 'spin';
  steer?: (b: Bullet, foes: readonly Foe[], dtSec: number) => void;
};

const MISSILE_TURN_RATE = 7;

export const BULLETS: Record<BulletKind, BulletDef> = {
  shot: { texture: 'shot', radius: 4, facing: 'velocity' },
  crit: { texture: 'critShot', radius: 4, facing: 'velocity' },
  droneShot: { texture: 'shot', radius: 3, facing: 'velocity' },
  missile: { texture: 'missile', radius: 5, facing: 'velocity', steer: homing },
  pellet: { texture: 'pellet', radius: 4, facing: 'spin' },
  needle: { texture: 'needle', radius: 3, facing: 'velocity' },
  orb: { texture: 'orb', radius: 6, facing: 'spin' },
  voidOrb: { texture: 'voidOrb', radius: 6, facing: 'spin' },
};

export type Bullet = {
  kind: BulletKind;
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  damage: number;
  source: DamageSource;
  pierceLeft: number;
  // Foes this bullet already hit, so a piercing round damages each one once.
  hit: Set<Foe>;
  // An enemy bullet's pass by the ship: near inside the graze ring, counted once it leaves without touching the core.
  graze: 'far' | 'near' | 'counted';
  alive: boolean;
};

export type BulletSpawn = {
  kind: BulletKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage?: number;
  source?: DamageSource;
  pierce?: number;
};

export class Bullets {
  readonly list: Bullet[] = [];
  private readonly spare: Phaser.GameObjects.Image[] = [];
  // Spare sprites keep their last tint, so every spawn sets this one.
  private tint = { color: 0xffffff, mode: Phaser.TintModes.MULTIPLY as Phaser.TintModes };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  spawn(s: BulletSpawn): Bullet {
    const def = BULLETS[s.kind];
    const sprite = (this.spare.pop() ?? this.scene.add.image(0, 0, def.texture))
      .setTexture(def.texture)
      .setPosition(s.x, s.y)
      .setDepth(this.depth)
      .setTint(this.tint.color)
      .setTintMode(this.tint.mode)
      .setVisible(true)
      .setActive(true);
    const bullet: Bullet = {
      kind: s.kind,
      sprite,
      vx: s.vx,
      vy: s.vy,
      damage: s.damage ?? 1,
      source: s.source ?? 'bullet',
      pierceLeft: s.pierce ?? 0,
      hit: new Set(),
      graze: 'far',
      alive: true,
    };
    this.face(bullet);
    this.list.push(bullet);
    return bullet;
  }

  tintAll(color: number, mode: Phaser.TintModes = Phaser.TintModes.MULTIPLY): void {
    this.tint = { color, mode };
    for (const b of this.list) b.sprite.setTint(color).setTintMode(mode);
  }

  kill(b: Bullet): void {
    b.alive = false;
  }

  clear(): void {
    for (const b of this.list) b.alive = false;
    this.sweep();
  }

  update(dtSec: number, foes: readonly Foe[]): void {
    for (const b of this.list) {
      if (!b.alive) continue;
      BULLETS[b.kind].steer?.(b, foes, dtSec);
      b.sprite.x += b.vx * dtSec;
      b.sprite.y += b.vy * dtSec;
      this.face(b, dtSec);
      const { x, y } = b.sprite;
      if (x < -20 || x > VIEW.w + 20 || y < -30 || y > VIEW.h + 30) b.alive = false;
    }
    this.sweep();
  }

  radius(b: Bullet): number {
    return BULLETS[b.kind].radius;
  }

  private face(b: Bullet, dtSec = 0): void {
    if (BULLETS[b.kind].facing === 'velocity') b.sprite.rotation = Math.atan2(b.vx, -b.vy);
    else b.sprite.rotation += dtSec * 8;
  }

  private sweep(): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]!;
      if (b.alive) continue;
      b.sprite.setVisible(false).setActive(false);
      this.spare.push(b.sprite);
      this.list.splice(i, 1);
    }
  }
}

function homing(b: Bullet, foes: readonly Foe[], dtSec: number): void {
  let best: Foe | null = null;
  let bestD = Infinity;
  for (const f of foes) {
    if (f.dead || f.sprite.y > b.sprite.y + 40) continue;
    const d = (f.sprite.x - b.sprite.x) ** 2 + (f.sprite.y - b.sprite.y) ** 2;
    if (d < bestD) [best, bestD] = [f, d];
  }
  if (!best) return;
  const speed = Math.hypot(b.vx, b.vy);
  const want = Math.atan2(best.sprite.y - b.sprite.y, best.sprite.x - b.sprite.x);
  const have = Math.atan2(b.vy, b.vx);
  const turn = Phaser.Math.Angle.Wrap(want - have);
  const next = have + Phaser.Math.Clamp(turn, -MISSILE_TURN_RATE * dtSec, MISSILE_TURN_RATE * dtSec);
  b.vx = Math.cos(next) * speed;
  b.vy = Math.sin(next) * speed;
}
