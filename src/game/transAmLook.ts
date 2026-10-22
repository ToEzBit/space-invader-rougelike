import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { TransAmSound } from '../audio/transAmSound';
import { COLORS } from '../art/palette';
import { TRANS_AM, type TransAm } from '../core/transAm';
import { VIEW } from '../view';
import { DEPTH } from './layout';
import type { World } from './world';

const SHIP_TINT = { active: 0xff8ab4, depleted: 0x6c6c80, overdrive: 0xffb0e0 } as const;
const GHOST = { everyMs: 40, ms: 260, alpha: 0.5 } as const;
const VIGNETTE = { bands: 10, bandPx: 5, alpha: 0.3 } as const;

// How the ship and screen look and sound through TRANS-AM, plus the ship's overdrive flicker, so one place owns the
// ship tint. None of this touches game state.
export class TransAmLook {
  private readonly halo: Phaser.GameObjects.Image;
  private readonly vignette: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly sound = new TransAmSound();
  private clockMs = 0;
  private ghostMs = 0;

  constructor(private readonly world: World) {
    const { scene, player } = world;
    this.halo = scene.add
      .image(player.x, player.y, 'player')
      .setTint(COLORS.red)
      .setTintMode(Phaser.TintModes.FILL)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player - 1)
      .setVisible(false);
    this.vignette = scene.add.graphics().setDepth(DEPTH.fx).setVisible(false);
    for (let i = 0; i < VIGNETTE.bands; i++) {
      const inset = VIGNETTE.bandPx * (i + 0.5);
      this.vignette.lineStyle(VIGNETTE.bandPx, COLORS.red, VIGNETTE.alpha * (1 - i / VIGNETTE.bands));
      this.vignette.strokeRect(inset, inset, VIEW.w - inset * 2, VIEW.h - inset * 2);
    }
    this.ring = scene.add.graphics().setDepth(DEPTH.fx);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hush());
  }

  enter(kind: TransAm['kind']): void {
    if (kind === 'active') sfx('transAm');
    else this.sound.end();
    if (kind === 'depleted') sfx('powerDown');
  }

  release(): void {
    const { fx, gun } = this.world;
    this.sound.release(gun.volleys);
    fx.flash(160, 255, 90, 150);
    fx.shake(0.008, 260);
  }

  // shockRadius is the release ring's reach this frame, null outside the release.
  update(dtMs: number, t: TransAm, shockRadius: number | null, overdriven: boolean): void {
    this.clockMs += dtMs;
    const { player, gun } = this.world;
    this.sound.update(t, gun.volleys);
    const ship = player.sprite;
    const active = t.kind === 'active';
    const pulse = 0.5 + 0.5 * Math.sin(this.clockMs / 70);
    ship.setTint(active ? SHIP_TINT.active : t.kind === 'depleted' ? SHIP_TINT.depleted : overdriven && Math.floor(this.clockMs / 90) % 2 ? SHIP_TINT.overdrive : 0xffffff);
    this.halo
      .setVisible(active && ship.visible)
      .setPosition(ship.x, ship.y)
      .setRotation(ship.rotation)
      .setScale(1.2 + 0.08 * pulse + (shockRadius === null ? 0 : 0.3))
      .setAlpha(0.3 + 0.25 * pulse);
    this.vignette.setVisible(active).setAlpha(0.75 + 0.25 * pulse);
    if (active && ship.visible && (this.ghostMs -= dtMs) <= 0) {
      this.ghostMs = GHOST.everyMs;
      this.ghost();
    }
    const g = this.ring.clear();
    if (shockRadius === null) return;
    const fade = 1 - shockRadius / TRANS_AM.clearRadiusPx;
    g.lineStyle(10, COLORS.pink, 0.25 + 0.3 * fade).strokeCircle(player.x, player.y, shockRadius);
    g.lineStyle(3, COLORS.white, 0.5 + 0.5 * fade).strokeCircle(player.x, player.y, shockRadius);
  }

  // The stage is over. Its last frames keep the look but play no more TRANS-AM sound.
  hush(): void {
    this.sound.hush();
  }

  private ghost(): void {
    const { scene, player } = this.world;
    const s = player.sprite;
    const ghost = scene.add
      .image(s.x, s.y, 'player')
      .setRotation(s.rotation)
      .setTint(COLORS.red)
      .setTintMode(Phaser.TintModes.FILL)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(GHOST.alpha)
      .setDepth(DEPTH.player - 2);
    scene.tweens.add({ targets: ghost, alpha: 0, scale: 0.9, duration: GHOST.ms, onComplete: () => ghost.destroy() });
  }
}
