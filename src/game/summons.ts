import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import { SUMMON } from '../core/perks';
import type { Bullet } from './bullets';
import { circlesOverlap, stepToward, type Point } from './geometry';
import { DEPTH } from './layout';
import type { Foe, World } from './world';

const WISP_SPEED = 300;
// Familiars circle a point above the ship's nose, clear of the hull and of the Option Drones' slots beside it.
const ORBIT = { dy: -50, r: 12, radPerSec: 1.4 };
const FAMILIAR_RADIUS = 7;
const DIVE_SPEED = 560;
const RESTING_ALPHA = 0.4;
const ANYWHERE = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };

export type FamiliarState =
  | { kind: 'ready' }
  // After a Guardian block: it keeps shooting but cannot block again until this runs out.
  | { kind: 'resting'; msLeft: number }
  // Took a hit for the ship under Sacrifice.
  | { kind: 'gone'; msLeft: number }
  // Great Spirit: out to strike its target, then back to its place.
  | { kind: 'diving'; target: Foe; leg: 'out' | 'back' };

type Familiar = { sprite: Phaser.GameObjects.Image; cooldownMs: number; state: FamiliarState };

// The summon branch. Familiars exist only when a perk sets ShipStats.familiars, and every other effect reads its own
// field and stays off at zero, so a ship without the branch never reaches the fx (and their Math.random) below.
export class Summons {
  private readonly familiars: Familiar[];
  private orbitMs = 0;
  private spiritMs: number;
  private blocked: Bullet | null = null;

  constructor(private readonly world: World) {
    const { stats } = world;
    this.spiritMs = stats.greatSpiritEveryMs;
    this.familiars = Array.from({ length: stats.familiars }, (_, i) => {
      const at = this.home(i, stats.familiars);
      // Staggered, so a pack fires in turn rather than in one clump.
      const cooldownMs = (stats.wispIntervalMs * i) / stats.familiars;
      return { sprite: world.scene.add.image(at.x, at.y, 'familiar').setDepth(DEPTH.player), cooldownMs, state: { kind: 'ready' } };
    });
  }

  // Dev-only.
  get debug() {
    return {
      familiars: this.familiars.map(({ sprite, state }) => ({ state: state.kind, x: sprite.x, y: sprite.y, ...('msLeft' in state && { msLeft: state.msLeft }) })),
      spiritMs: this.spiritMs,
    };
  }

  // Dev-only: the enemy bullet Guardian blocked last.
  get lastBlocked(): Bullet | null {
    return this.blocked;
  }

  update(dtMs: number, firing: boolean): void {
    if (this.familiars.length === 0) return;
    this.orbitMs += dtMs;
    if (firing) this.callGreatSpirit(dtMs);
    this.familiars.forEach((f, i) => {
      this.move(f, this.home(i, this.familiars.length), dtMs);
      if (firing) this.shoot(f, dtMs);
    });
  }

  // Guardian: a ready familiar destroys the enemy bullet it touches, then rests.
  guard(): void {
    const { stats, enemyShots, fx } = this.world;
    if (stats.guardianRestMs <= 0) return;
    for (const f of this.familiars) {
      if (f.state.kind !== 'ready') continue;
      const b = enemyShots.list.find((b) => b.alive && circlesOverlap(b.sprite, enemyShots.radius(b), f.sprite, FAMILIAR_RADIUS));
      if (!b) continue;
      enemyShots.kill(b);
      this.blocked = b;
      fx.spark(b.sprite.x, b.sprite.y, 6);
      this.become(f, { kind: 'resting', msLeft: stats.guardianRestMs });
    }
  }

  // Sacrifice: true when a ready familiar took the hit in the ship's place.
  sacrifice(): boolean {
    const { stats, fx, player } = this.world;
    const f = stats.sacrificeMs > 0 && this.familiars.find((f) => f.state.kind === 'ready');
    if (!f) return false;
    fx.spark(f.sprite.x, f.sprite.y, 14);
    fx.float(player.x, player.y - 30, 'SACRIFICE', COLORS.cornflower);
    this.become(f, { kind: 'gone', msLeft: stats.sacrificeMs });
    return true;
  }

  // Haunt marks a foe a wisp hit, after that hit's own damage.
  onWispHit(foe: Foe): void {
    if (this.world.stats.hauntBonus > 0) foe.hauntMs = SUMMON.hauntMs;
  }

  vanish(): void {
    for (const f of this.familiars) f.sprite.setVisible(false);
  }

  private home(i: number, n: number): Point {
    const { player } = this.world;
    const angle = (this.orbitMs / 1000) * ORBIT.radPerSec + (2 * Math.PI * i) / n;
    return { x: player.x + Math.cos(angle) * ORBIT.r, y: player.y + ORBIT.dy + Math.sin(angle) * ORBIT.r };
  }

  private move(f: Familiar, home: Point, dtMs: number): void {
    const s = f.state;
    switch (s.kind) {
      case 'resting':
        if ((s.msLeft -= dtMs) <= 0) this.become(f, { kind: 'ready' });
        return follow(f.sprite, home);
      case 'ready':
        return follow(f.sprite, home);
      case 'gone':
        if ((s.msLeft -= dtMs) > 0) return;
        f.sprite.setPosition(home.x, home.y);
        this.world.fx.spark(home.x, home.y, 8);
        return this.become(f, { kind: 'ready' });
      case 'diving': {
        // A target that dies on the way sends the familiar straight home.
        if (s.leg === 'out' && s.target.dead) s.leg = 'back';
        const to = s.leg === 'out' ? s.target.sprite : home;
        const next = stepToward(f.sprite, to, (DIVE_SPEED * dtMs) / 1000, ANYWHERE);
        f.sprite.setPosition(next.x, next.y);
        if (next.x !== to.x || next.y !== to.y) return;
        if (s.leg === 'back') return this.become(f, { kind: 'ready' });
        this.world.damage(s.target, SUMMON.greatSpiritDamage, 'spirit');
        this.world.fx.spark(next.x, next.y, 10);
        s.leg = 'back';
        return;
      }
    }
  }

  private shoot(f: Familiar, dtMs: number): void {
    const { stats, playerShots, tally } = this.world;
    if (stats.wispIntervalMs <= 0 || (f.state.kind !== 'ready' && f.state.kind !== 'resting')) return;
    f.cooldownMs -= dtMs;
    if (f.cooldownMs > 0) return;
    const at = f.sprite;
    const target = this.world.nearestFoe(at);
    if (!target) {
      f.cooldownMs = 0;
      return;
    }
    const aim = Math.atan2(target.sprite.y - at.y, target.sprite.x - at.x);
    tally.fired += stats.wispDamage;
    playerShots.spawn({
      kind: 'wisp',
      x: at.x,
      y: at.y,
      vx: Math.cos(aim) * WISP_SPEED,
      vy: Math.sin(aim) * WISP_SPEED,
      damage: stats.wispDamage,
      source: 'wisp',
      pierce: stats.wispPierce,
      blast: stats.soulBurstRadius,
    });
    f.cooldownMs += stats.wispIntervalMs;
  }

  // Great Spirit: every present familiar dives at the live foe with the most HP, waiting for one if none is up.
  private callGreatSpirit(dtMs: number): void {
    const every = this.world.stats.greatSpiritEveryMs;
    if (every <= 0 || (this.spiritMs -= dtMs) > 0) return;
    const target = this.world.foes.reduce<Foe | null>((best, f) => (!f.dead && (!best || f.hp > best.hp) ? f : best), null);
    const divers = this.familiars.filter((f) => f.state.kind === 'ready' || f.state.kind === 'resting');
    if (!target || divers.length === 0) {
      this.spiritMs = 0;
      return;
    }
    for (const f of divers) this.become(f, { kind: 'diving', target, leg: 'out' });
    this.spiritMs = every;
  }

  private become(f: Familiar, state: FamiliarState): void {
    f.state = state;
    f.sprite.setVisible(state.kind !== 'gone').setAlpha(state.kind === 'resting' ? RESTING_ALPHA : 1);
  }
}

function follow(sprite: Phaser.GameObjects.Image, to: Point): void {
  sprite.setPosition(Phaser.Math.Linear(sprite.x, to.x, 0.25), Phaser.Math.Linear(sprite.y, to.y, 0.25));
}
