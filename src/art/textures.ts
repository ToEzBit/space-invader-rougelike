import Phaser from 'phaser';
import { PALETTE } from './palette';
import { ART_SCALE, SPRITES, type SpriteKey } from './sprites';
import { VIEW } from '../view';

export const STAR_LAYERS = ['stars0', 'stars1', 'stars2'] as const;

export function buildTextures(scene: Phaser.Scene): void {
  for (const key of Object.keys(SPRITES) as SpriteKey[]) bake(scene, key);
  STAR_LAYERS.forEach((key, layer) => stars(scene, key, layer));
  nebula(scene);
}

function bake(scene: Phaser.Scene, key: SpriteKey): void {
  if (scene.textures.exists(key)) return;
  const grid = SPRITES[key];
  const tex = scene.textures.createCanvas(key, grid[0]!.length * ART_SCALE, grid.length * ART_SCALE);
  if (!tex) throw new Error(`Could not create texture ${key}`);
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const color = PALETTE[ch];
      if (!color) return;
      tex.context.fillStyle = color;
      tex.context.fillRect(x * ART_SCALE, y * ART_SCALE, ART_SCALE, ART_SCALE);
    }),
  );
  tex.refresh();
}

const STAR_STYLE = [
  { count: 140, size: 1, colors: ['#3a3f7a', '#4b4f8f', '#2d6c9a'] },
  { count: 60, size: 1, colors: ['#9aa6ff', '#7fe6ff', '#ffb6e6'] },
  { count: 24, size: 2, colors: ['#ffffff', '#c9f6ff', '#ffe84a'] },
] as const;

function stars(scene: Phaser.Scene, key: string, layer: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, VIEW.w, VIEW.h);
  if (!tex) throw new Error(`Could not create texture ${key}`);
  const style = STAR_STYLE[layer]!;
  let seed = 1234 + layer * 977;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < style.count; i++) {
    const x = Math.floor(rand() * VIEW.w);
    const y = Math.floor(rand() * VIEW.h);
    tex.context.fillStyle = style.colors[i % style.colors.length]!;
    tex.context.fillRect(x, y, style.size, style.size);
    if (style.size > 1 && i % 3 === 0) {
      tex.context.fillRect(x - 2, y, style.size + 4, 1);
      tex.context.fillRect(x, y - 2, 1, style.size + 4);
    }
  }
  tex.refresh();
}

function nebula(scene: Phaser.Scene): void {
  if (scene.textures.exists('nebula')) return;
  const tex = scene.textures.createCanvas('nebula', VIEW.w, VIEW.h);
  if (!tex) throw new Error('Could not create texture nebula');
  const ctx = tex.context;
  const g = ctx.createLinearGradient(0, 0, 0, tex.height);
  g.addColorStop(0, '#120b3a');
  g.addColorStop(0.55, '#07061a');
  g.addColorStop(1, '#0a0f2e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tex.width, tex.height);
  for (const [x, y, r, color] of [
    [80, 120, 160, 'rgba(216,27,140,0.16)'],
    [400, 280, 180, 'rgba(70,240,255,0.08)'],
    [240, 520, 200, 'rgba(166,107,255,0.12)'],
  ] as const) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, tex.width, tex.height);
  }
  tex.refresh();
}
