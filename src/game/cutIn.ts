import Phaser from 'phaser';
import { COLORS, css } from '../art/palette';
import type { CutInPose } from '../core/cutIn';
import { label } from '../ui/text';
import { onViewport, VIEW } from '../view';
import { DEPTH } from './layout';

const TILT = Phaser.Math.DegToRad(-8);
const BAND_Y = VIEW.h * 0.42;
// The eye strip is 768x200; at this width it still spans the 480-wide view once tilted.
const STRIP = { w: 560, h: (560 * 200) / 768 } as const;
const BAR_H = 18;
const BAND_H = STRIP.h + BAR_H * 2;
// The black bars cross the widest viewport, so the band's ends never show.
const BAR_LEN = 1800;
const SLIDE_PX = 1500;
const DIM_ALPHA = 0.72;
const LINES = 26;
const TITLE = { size: 60, x: 0, y: STRIP.h / 2 + 4, shadow: 6, slam: 0.6, fromX: 90 } as const;

const noise = (i: number, n: number) => {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// The TRANS-AM cut-in: a dim, then a tilted band of the pilot's eyes turning red under the title, cut by a light
// slash. It draws the pose it is given each frame, so it runs while the stage's tweens and timers are paused.
export class CutIn {
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly band: Phaser.GameObjects.Container;
  private readonly red: Phaser.GameObjects.Image;
  private readonly title: Phaser.GameObjects.Container;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly slash: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.dim = scene.add.rectangle(0, 0, 1, 1, 0x000000).setOrigin(0).setDepth(DEPTH.cutIn);
    this.flash = scene.add.rectangle(0, 0, 1, 1, COLORS.white).setOrigin(0).setDepth(DEPTH.cutIn + 2);
    onViewport(scene, ({ x, y, w, h }) => {
      for (const r of [this.dim, this.flash]) r.setPosition(x, y).setSize(w, h);
    });
    const edges = scene.add.graphics();
    edges.fillStyle(COLORS.red, 1).fillRect(-BAR_LEN / 2, -STRIP.h / 2 - 3, BAR_LEN, 3).fillRect(-BAR_LEN / 2, STRIP.h / 2, BAR_LEN, 3);
    this.red = scene.add.image(0, 0, 'eyesRed').setDisplaySize(STRIP.w, STRIP.h);
    this.lines = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.slash = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const style = { size: TITLE.size, bold: true, italic: true, align: 'center' } as const;
    const back = label(scene, TITLE.shadow, TITLE.shadow, 'TRANS-AM', { ...style, color: css(COLORS.red), stroke: css(COLORS.red) }).setOrigin(0.5);
    const front = label(scene, 0, 0, 'TRANS-AM', { ...style, color: css(COLORS.white), stroke: css(COLORS.red) }).setOrigin(0.5);
    for (const t of [back, front]) t.setStroke(css(COLORS.red), 8);
    this.title = scene.add.container(TITLE.x, TITLE.y, [back, front]);
    this.band = scene.add
      .container(0, 0, [
        scene.add.rectangle(0, 0, BAR_LEN, BAND_H, 0x000000),
        // Red sits on an opaque blue, so the crossfade changes only the irises and never shows through.
        scene.add.image(0, 0, 'eyesBlue').setDisplaySize(STRIP.w, STRIP.h),
        this.red,
        edges,
        this.lines,
        this.title,
        this.slash,
      ])
      .setRotation(TILT)
      .setDepth(DEPTH.cutIn + 1);
    this.draw(null, 0);
  }

  // Null hides it.
  draw(pose: CutInPose | null, elapsedMs: number): void {
    this.dim.setVisible(pose !== null).setAlpha(DIM_ALPHA * (pose?.dim ?? 0));
    this.flash.setVisible(!!pose && pose.flash > 0).setAlpha(0.9 * (pose?.flash ?? 0));
    const inView = !!pose && Math.abs(pose.slide) < 1;
    this.band.setVisible(inView);
    if (!pose || !inView) return;
    const along = pose.slide * SLIDE_PX;
    this.band.setPosition(VIEW.w / 2 + Math.cos(TILT) * along, BAND_Y + Math.sin(TILT) * along);
    this.red.setAlpha(pose.red);
    this.title
      .setAlpha(pose.title)
      .setScale(1 + TITLE.slam * (1 - pose.title))
      .setX(TITLE.x + TITLE.fromX * (1 - pose.title));
    this.drawLines(elapsedMs);
    this.drawSlash(pose.slash);
  }

  // Speed lines streaking along the band, mostly through the black bars so they do not muddy the eyes.
  private drawLines(elapsedMs: number): void {
    const g = this.lines.clear();
    const wrap = VIEW.w + 200;
    for (let i = 0; i < LINES; i++) {
      const inBar = noise(i, 1) < 0.7;
      const y = inBar
        ? (noise(i, 2) < 0.5 ? -1 : 1) * (STRIP.h / 2 + 3 + noise(i, 3) * (BAR_H - 4))
        : (noise(i, 3) - 0.5) * STRIP.h;
      const len = 30 + noise(i, 4) * 110;
      const x = wrap / 2 - ((noise(i, 5) * wrap + elapsedMs * (1.2 + noise(i, 6) * 1.8)) % wrap);
      const color = noise(i, 7) < 0.65 ? COLORS.red : COLORS.white;
      g.lineStyle(noise(i, 8) < 0.3 ? 3 : 1.5, color, inBar ? 0.55 + noise(i, 9) * 0.4 : 0.25).lineBetween(x, y, x + len, y);
    }
  }

  // A blade of light drawn from the lower left of the strip to its upper right.
  private drawSlash(slash: number | null): void {
    const g = this.slash.clear();
    if (slash === null) return;
    const from = { x: -STRIP.w / 2, y: STRIP.h * 0.32 };
    const to = { x: STRIP.w / 2, y: -STRIP.h * 0.32 };
    const at = (k: number) => ({ x: Phaser.Math.Linear(from.x, to.x, k), y: Phaser.Math.Linear(from.y, to.y, k) });
    const head = at(Phaser.Math.Easing.Cubic.Out(slash));
    const tail = at(Math.max(0, Phaser.Math.Easing.Cubic.Out(slash) - 0.55));
    g.lineStyle(18, COLORS.pink, 0.35).lineBetween(tail.x, tail.y, head.x, head.y);
    g.lineStyle(8, COLORS.white, 0.6).lineBetween(tail.x, tail.y, head.x, head.y);
    g.lineStyle(3, COLORS.white, 1).lineBetween(tail.x, tail.y, head.x, head.y);
    g.fillStyle(COLORS.white, 1).fillCircle(head.x, head.y, 7);
  }
}
