import Phaser from 'phaser';
import { wrapWords } from './wrap';

export const FONT = "Tahoma, 'Noto Sans Thai', Thonburi, 'Leelawadee UI', sans-serif";

export type LabelStyle = {
  size?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  stroke?: string;
};

const measureCtx = document.createElement('canvas').getContext('2d');

export function label(scene: Phaser.Scene, x: number, y: number, text: string, style: LabelStyle = {}): Phaser.GameObjects.Text {
  const { size = 14, color = '#ffffff', bold = false, align = 'left', wrap, stroke } = style;
  const font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  const obj = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color,
    align,
    resolution: scene.cameras.main.zoom,
    // Thai tone marks sit above the em box and get clipped without top padding.
    padding: { top: Math.ceil(size * 0.35), bottom: Math.ceil(size * 0.2) },
    stroke: stroke ?? '#000000',
    strokeThickness: stroke ? Math.max(2, Math.round(size / 6)) : 0,
    lineSpacing: Math.round(size * 0.15),
    wordWrap: wrap
      ? {
          width: wrap,
          callback: (t: string) => {
            if (measureCtx) measureCtx.font = font;
            return wrapWords(t, wrap, (s) => measureCtx?.measureText(s).width ?? s.length * size);
          },
        }
      : undefined,
  });
  obj.setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0);
  return obj;
}

// Text is rasterized at its resolution, so it follows the camera zoom to stay one texel per device pixel.
export function sharpenLabels(objects: readonly Phaser.GameObjects.GameObject[], zoom: number): void {
  for (const obj of objects) {
    if (obj instanceof Phaser.GameObjects.Text && obj.style.resolution !== zoom) obj.setResolution(zoom);
    else if (obj instanceof Phaser.GameObjects.Container) sharpenLabels(obj.list, zoom);
  }
}
