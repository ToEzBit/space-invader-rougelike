import { ENEMIES, type EnemyKind, type WaveStage } from '../core/stages';
import { ENEMY_FRAMES } from '../art/sprites';
import { VIEW } from '../view';
import type { BulletKind } from './bullets';
import type { Encounter } from './encounter';
import { FOE_RADIUS } from './hitbox';
import { BREACH_Y, PLAYFIELD } from './layout';
import { frontRank, marchSpeed } from './march';
import type { Foe, World } from './world';

const CELL = { w: 36, h: 30 };
const TOP = 96;
const STEP_PX = 4;
const DROP_PX = 10;
const DIVE_CHANCE_PER_SEC = 0.08;
const DIVE_SPEED = 230;
const RETURN_SPEED = 260;

export type EnemyShot = { bullet: BulletKind; speed: number; aimed: boolean };

export const ENEMY_SHOT: Record<EnemyKind, EnemyShot> = {
  drone: { bullet: 'pellet', speed: 150, aimed: false },
  gunner: { bullet: 'needle', speed: 240, aimed: true },
  tank: { bullet: 'orb', speed: 120, aimed: false },
  diver: { bullet: 'pellet', speed: 180, aimed: true },
};

type Mode = { kind: 'ranked' } | { kind: 'diving'; vx: number; vy: number } | { kind: 'returning' };

type Member = { foe: Foe; kind: EnemyKind; col: number; row: number; mode: Mode };

export function enemyFire(world: World, kind: EnemyKind, x: number, y: number): void {
  const shot = ENEMY_SHOT[kind];
  const angle = shot.aimed ? Math.atan2(world.player.y - y, world.player.x - x) : Math.PI / 2;
  world.enemyShots.spawn({ kind: shot.bullet, x, y, vx: Math.cos(angle) * shot.speed, vy: Math.sin(angle) * shot.speed });
}

export class Formation implements Encounter {
  readonly boss = null;
  private members: Member[] = [];
  private readonly total: number;
  private readonly originX: number;
  private offsetX = 0;
  private offsetY = 0;
  private dir: 1 | -1 = 1;
  private stepCarry = 0;
  private frame: 0 | 1 = 0;

  constructor(
    private readonly world: World,
    private readonly def: WaveStage,
  ) {
    this.originX = (VIEW.w - (def.cols - 1) * CELL.w) / 2;
    def.rows.forEach((kind, row) => {
      const enemy = ENEMIES[kind];
      for (let col = 0; col < def.cols; col++) {
        const foe = world.addFoe(ENEMY_FRAMES[kind][0], 0, 0, Math.ceil(enemy.hp * def.hpMultiplier), enemy.coin, FOE_RADIUS[kind]);
        this.members.push({ foe, kind, col, row, mode: { kind: 'ranked' } });
      }
    });
    this.total = this.members.length;
    for (const m of this.members) m.foe.sprite.setPosition(this.slotX(m), this.slotY(m));
  }

  get cleared(): boolean {
    return this.members.every((m) => m.foe.dead);
  }

  get breached(): boolean {
    return this.members.some((m) => !m.foe.dead && m.mode.kind === 'ranked' && m.foe.sprite.y + m.foe.radius >= BREACH_Y);
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.members = this.members.filter((m) => !m.foe.dead);
    this.stepCarry += marchSpeed(this.def.marchSpeed, this.members.length, this.total) * dt;
    while (this.stepCarry >= STEP_PX) {
      this.stepCarry -= STEP_PX;
      this.step();
    }
    for (const m of this.members) this.move(m, dt);
    this.fire(dt);
  }

  private slotX(m: Member): number {
    return this.originX + this.offsetX + m.col * CELL.w;
  }

  private slotY(m: Member): number {
    return TOP + this.offsetY + m.row * CELL.h;
  }

  private step(): void {
    const ranked = this.members.filter((m) => m.mode.kind === 'ranked');
    if (ranked.length) {
      const xs = ranked.map((m) => this.slotX(m) + this.dir * STEP_PX);
      const half = CELL.w / 2 - 2;
      if (Math.min(...xs) - half < PLAYFIELD.left || Math.max(...xs) + half > PLAYFIELD.right) {
        this.offsetY += DROP_PX;
        this.dir = this.dir === 1 ? -1 : 1;
      } else {
        this.offsetX += this.dir * STEP_PX;
      }
    }
    this.frame = this.frame === 0 ? 1 : 0;
    for (const m of this.members) m.foe.sprite.setTexture(ENEMY_FRAMES[m.kind][this.frame]);
  }

  private move(m: Member, dt: number): void {
    const s = m.foe.sprite;
    const mode = m.mode;
    switch (mode.kind) {
      case 'ranked':
        s.setPosition(this.slotX(m), this.slotY(m)).setRotation(0);
        if (m.kind === 'diver' && Math.random() < DIVE_CHANCE_PER_SEC * dt) {
          const angle = Math.atan2(this.world.player.y - s.y, this.world.player.x - s.x);
          m.mode = { kind: 'diving', vx: Math.cos(angle) * DIVE_SPEED, vy: Math.sin(angle) * DIVE_SPEED };
        }
        return;
      case 'diving':
        mode.vx += Math.sign(this.world.player.x - s.x) * 120 * dt;
        s.x += mode.vx * dt;
        s.y += mode.vy * dt;
        s.setRotation(Math.atan2(-mode.vx, mode.vy) * 0.6);
        if (s.y > VIEW.h + 24) {
          s.y = -24;
          m.mode = { kind: 'returning' };
        }
        return;
      case 'returning': {
        const tx = this.slotX(m);
        const ty = this.slotY(m);
        const d = Math.hypot(tx - s.x, ty - s.y);
        const stepLen = RETURN_SPEED * dt;
        if (d <= stepLen) m.mode = { kind: 'ranked' };
        else s.setPosition(s.x + ((tx - s.x) / d) * stepLen, s.y + ((ty - s.y) / d) * stepLen).setRotation(0);
        return;
      }
    }
  }

  private fire(dt: number): void {
    const shooters = frontRank(this.members.filter((m) => m.mode.kind === 'ranked'));
    if (!shooters.length) return;
    const perShooter = (this.def.fireRate / shooters.length) * dt;
    for (const m of shooters) {
      if (Math.random() < perShooter * ENEMIES[m.kind].fireWeight) enemyFire(this.world, m.kind, m.foe.sprite.x, m.foe.sprite.y + 10);
    }
  }
}
