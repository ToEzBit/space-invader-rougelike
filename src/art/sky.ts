import Phaser from 'phaser';
import type { DebrisKind, Sector, SetPiece, SetPieceKind } from '../core/sectors';
import { VIEW } from '../view';

// Sector skies are baked on a stage's first visit. Set pieces and debris are painted one art pixel per canvas
// pixel and drawn at the art scale, so they keep the sprites' chunky look. Nothing here may call Math.random:
// gameplay draws from it, and a new draw would shift every later one.

export type Rand = () => number;

export function seeded(seed: number): Rand {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

type Rgb = readonly [number, number, number];

class Pixels {
  readonly cells: (Rgb | null)[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.cells = new Array<Rgb | null>(w * h).fill(null);
  }
  set(x: number, y: number, color: Rgb): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = color;
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)]!;

// Picks one of `count` steps for a 0..1 value, dithering between neighbours like hand-placed pixel shading.
function step(value: number, count: number, x: number, y: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor(value * (count - 1) + dither(x, y))));
}

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function scaled([r, g, b]: Rgb, f: number): Rgb {
  return [Math.round(r * f), Math.round(g * f), Math.round(b * f)];
}

const LIGHT = (() => {
  const [x, y, z] = [-0.6, -0.55, 0.58];
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len] as const;
})();
const SHADE = [0.2, 0.42, 0.68, 1];

type Surface = (nx: number, ny: number, nz: number, x: number, y: number) => string | null;

// A lit ball whose surface picks each pixel's base color from its normal; null leaves a hole.
function sphere(px: Pixels, cx: number, cy: number, r: number, surface: Surface): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r;
      const ny = (y + 0.5 - cy) / r;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const base = surface(nx, ny, nz, x, y);
      if (!base) continue;
      const lit = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      px.set(x, y, scaled(rgb(base), SHADE[step(lit, SHADE.length, x, y)]!));
    }
}

type Crater = { u: number; v: number; r: number };

function craters(rand: Rand, count: number): Crater[] {
  return Array.from({ length: count }, () => ({ u: rand() * 1.6 - 0.8, v: rand() * 1.6 - 0.8, r: 0.06 + rand() * 0.16 }));
}

function crateredSurface(body: string, crater: string, list: readonly Crater[]): Surface {
  return (nx, ny) => {
    for (const c of list) {
      const d = Math.hypot(nx - c.u, ny - c.v) / c.r;
      if (d < 0.75) return crater;
      if (d < 1 && nx - c.u > 0 && ny - c.v > 0) return crater;
    }
    return body;
  };
}

// Plots each pixel of a tilted ellipse ring whose normalized radius e falls in [inner, 1], back or front half.
function ring(px: Pixels, cx: number, cy: number, a: number, b: number, tilt: number, inner: number, front: boolean, color: (e: number, x: number, y: number) => Rgb | null): void {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      if (v >= 0 !== front) continue;
      const e = Math.hypot(u / a, v / b);
      if (e < inner || e > 1) continue;
      const c = color(e, x, y);
      if (c) px.set(x, y, c);
    }
}

function line(px: Pixels, x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= n; i++) px.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
}

type Painter<K extends SetPieceKind> = {
  // Canvas half-size as a multiple of the radius.
  extent: number;
  paint(px: Pixels, piece: Extract<SetPiece, { kind: K }>, rand: Rand): void;
};

const PAINTERS: { [K in SetPieceKind]: Painter<K> } = {
  ringedPlanet: {
    extent: 1.9,
    paint(px, p) {
      const c = px.w / 2;
      const a = p.radius * 1.85;
      const b = a * 0.26;
      const ringColor = (e: number, x: number, y: number) => {
        if (e > 0.79 && e < 0.83) return null;
        const f = e < 0.79 ? 0.75 : 0.5 + (1 - e) * 2.5;
        return scaled(rgb(p.ring), [0.35, 0.6, 0.85][step(f, 3, x, y)]!);
      };
      ring(px, c, c, a, b, p.tilt, 0.62, false, ringColor);
      sphere(px, c, c, p.radius, (nx, ny) => (Math.sin(ny * 9 + nx * 0.8) > 0.35 ? p.band : p.body));
      ring(px, c, c, a, b, p.tilt, 0.62, true, ringColor);
    },
  },
  moon: {
    extent: 1.05,
    paint(px, p, rand) {
      const c = px.w / 2;
      sphere(px, c, c, p.radius, crateredSurface(p.body, p.crater, craters(rand, 14)));
    },
  },
  gasGiant: {
    extent: 1.05,
    paint(px, p) {
      const c = px.w / 2;
      sphere(px, c, c, p.radius, (nx, ny) => {
        const storm = Math.hypot((nx - 0.3) / 0.24, (ny - 0.28) / 0.12);
        if (storm < 0.75) return p.storm;
        if (storm < 1) return p.bands[2]!;
        const lat = ny + 0.05 * Math.sin(nx * 8 + ny * 5);
        return p.bands[Math.floor((lat + 1) * p.bands.length * 0.9) % p.bands.length]!;
      });
    },
  },
  shatteredMoon: {
    extent: 1.6,
    paint(px, p, rand) {
      const c = px.w / 2;
      const r = p.radius;
      const bite = { x: 0.75, y: 0.35, r: 0.6 };
      const surface = crateredSurface(p.body, p.crater, craters(rand, 8));
      sphere(px, c - r * 0.15, c, r, (nx, ny, nz, x, y) => {
        const a = Math.atan2(ny - bite.y, nx - bite.x);
        const jag = bite.r * (1 + 0.18 * Math.sin(a * 7) + 0.08 * Math.sin(a * 13));
        return Math.hypot(nx - bite.x, ny - bite.y) < jag ? null : surface(nx, ny, nz, x, y);
      });
      for (let i = 0; i < 7; i++) {
        const angle = -0.5 + rand() * 1.6;
        const dist = r * (0.95 + rand() * 0.55);
        sphere(px, c - r * 0.15 + Math.cos(angle) * dist, c + Math.sin(angle) * dist * 0.9, 1.5 + rand() * r * 0.14, () => p.body);
      }
    },
  },
  star: {
    extent: 1.45,
    paint(px, p) {
      const c = px.w / 2;
      const r = p.radius;
      const ramp = [p.rim, p.body, p.core].map(rgb);
      const corona = rgb(p.corona);
      const rim = rgb(p.rim);
      for (let y = 0; y < px.h; y++)
        for (let x = 0; x < px.w; x++) {
          const dx = (x + 0.5 - c) / r;
          const dy = (y + 0.5 - c) / r;
          const d = Math.hypot(dx, dy);
          if (d <= 1) {
            const grain = 0.12 * Math.sin(x * 1.7 + Math.sin(y * 0.9) * 3) * Math.sin(y * 1.3 + x * 0.4);
            px.set(x, y, ramp[step(Math.sqrt(1 - d * d) + grain, ramp.length, x, y)]!);
          } else if (d < 1.06) px.set(x, y, rim);
          else {
            const flare = 0.75 + 0.25 * Math.sin(Math.atan2(dy, dx) * 5);
            if ((1.45 - d) / 0.4 * flare > dither(x, y)) px.set(x, y, corona);
          }
        }
    },
  },
  station: {
    extent: 1.1,
    paint(px, p, rand) {
      const c = px.w / 2;
      const r = p.radius;
      const hull = rgb(p.hull);
      const edge = rgb(p.edge);
      const light = rgb(p.light);
      const a = r;
      const b = r * 0.36;
      // A broken arc of the ring is missing, and its stubs catch the light.
      const ringColor = (e: number, x: number, y: number) => {
        const angle = Math.atan2((y + 0.5 - c) / b, (x + 0.5 - c) / a);
        if (angle > 0.15 && angle < 0.75) return null;
        if (angle > 0.75 && angle < 0.85) return edge;
        return e > 0.93 && y < c ? edge : hull;
      };
      ring(px, c, c, a, b, 0, 0.8, false, ringColor);
      for (const angle of [0.6, 2.2, 3.6, 5.0]) line(px, c, c, c + Math.cos(angle) * a * 0.82, c + Math.sin(angle) * b * 0.82, hull);
      for (let y = Math.round(c - r * 0.8); y < Math.round(c + r * 0.62); y++) {
        px.set(Math.round(c) - 1, y, edge);
        px.set(Math.round(c), y, hull);
        px.set(Math.round(c) + 1, y, hull);
      }
      line(px, c - 4, c - r * 0.8, c + 4, c - r * 0.8, edge);
      sphere(px, c, c, r * 0.2, () => p.hull);
      ring(px, c, c, a, b, 0, 0.8, true, ringColor);
      for (let i = 0; i < 9; i++) {
        const angle = rand() * Math.PI * 2;
        if (angle > 0.15 && angle < 0.85) continue;
        px.set(Math.round(c + Math.cos(angle) * a * 0.9), Math.round(c + Math.sin(angle) * b * 0.9), light);
      }
      px.set(Math.round(c), Math.round(c - r * 0.8) - 1, light);
    },
  },
  eclipse: {
    extent: 1.75,
    paint(px, p) {
      const c = px.w / 2;
      const r = p.radius;
      const ramp = p.corona.map(rgb);
      const disc = rgb('#030108');
      for (let y = 0; y < px.h; y++)
        for (let x = 0; x < px.w; x++) {
          const dx = (x + 0.5 - c) / r;
          const dy = (y + 0.5 - c) / r;
          const d = Math.hypot(dx, dy);
          if (d <= 1) {
            px.set(x, y, disc);
            continue;
          }
          const angle = Math.atan2(dy, dx);
          const streamer = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(angle * 3 + 1)) * (0.7 + 0.3 * Math.sin(angle * 8));
          const glow = 1 - (d - 1) / (0.75 * streamer);
          if (glow <= 0) continue;
          const level = glow ** 3 * ramp.length;
          if (level < dither(x, y)) continue;
          px.set(x, y, ramp[Math.min(ramp.length - 1, Math.floor(level))]!);
        }
      // The diamond ring: one bead of sunlight slipping past the rim.
      const [bx, by] = [Math.round(c + Math.cos(-2.3) * r * 1.02), Math.round(c + Math.sin(-2.3) * r * 1.02)];
      const bright = rgb('#dcd8f0');
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, -2], [0, 2]] as const) px.set(bx + ox, by + oy, ox || oy ? ramp[ramp.length - 1]! : bright);
    },
  },
};

function paintPiece(piece: SetPiece, rand: Rand): Pixels {
  const painter = PAINTERS[piece.kind] as Painter<SetPieceKind>;
  const size = Math.ceil(piece.radius * painter.extent) * 2;
  const px = new Pixels(size, size);
  painter.paint(px, piece as never, rand);
  return px;
}

function bakePixels(scene: Phaser.Scene, key: string, px: Pixels): void {
  const tex = scene.textures.createCanvas(key, px.w, px.h);
  if (!tex) throw new Error(`Could not create texture ${key}`);
  px.cells.forEach((cell, i) => {
    if (!cell) return;
    tex.context.fillStyle = `rgb(${cell[0]},${cell[1]},${cell[2]})`;
    tex.context.fillRect(i % px.w, Math.floor(i / px.w), 1, 1);
  });
  tex.refresh();
}

function bakeNebula(scene: Phaser.Scene, key: string, { stops, glows }: Sector['sky']): void {
  const tex = scene.textures.createCanvas(key, VIEW.w, VIEW.h);
  if (!tex) throw new Error(`Could not create texture ${key}`);
  const ctx = tex.context;
  const g = ctx.createLinearGradient(0, 0, 0, tex.height);
  stops.forEach((color, i) => g.addColorStop([0, 0.55, 1][i]!, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, tex.width, tex.height);
  for (const [x, y, r, color] of glows) {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, tex.width, tex.height);
  }
  tex.refresh();
}

export type SkyKeys = { nebula: string; piece: string };

export function bakeSector(scene: Phaser.Scene, sector: Sector): SkyKeys {
  const keys = { nebula: `nebula-${sector.name}`, piece: `setPiece-${sector.name}` };
  if (!scene.textures.exists(keys.nebula)) bakeNebula(scene, keys.nebula, sector.sky);
  if (!scene.textures.exists(keys.piece)) bakePixels(scene, keys.piece, paintPiece(sector.piece, seeded(seedOf(sector.name))));
  return keys;
}

function seedOf(text: string): number {
  return [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2147483646, 7) + 1;
}

const DEBRIS_VARIANTS = 3;
const DEBRIS_SHADES = [rgb('#5a5a5a'), rgb('#9a9a9a'), rgb('#e0e0e0')];

// Grey so a sector's tint colors it. A lumpy disc lit from the upper left, with the outline per kind.
const DEBRIS_SHAPES: Record<DebrisKind, (rand: Rand) => { size: number; inside: (dx: number, dy: number) => boolean }> = {
  rock: (rand) => {
    const size = 7 + Math.floor(rand() * 6);
    const [k1, k2, p1, p2] = [0.18 * rand(), 0.12 * rand(), rand() * 6, rand() * 6];
    return { size, inside: (dx, dy) => Math.hypot(dx, dy) < 1 - k1 * (1 + Math.sin(Math.atan2(dy, dx) * 3 + p1)) - k2 * (1 + Math.sin(Math.atan2(dy, dx) * 5 + p2)) };
  },
  shard: (rand) => {
    const size = 8 + Math.floor(rand() * 6);
    const lean = rand() * 0.6 - 0.3;
    return { size, inside: (dx, dy) => Math.abs(dx - lean * dy) * 2.6 + Math.abs(dy) < 1 };
  },
  scrap: (rand) => {
    const size = 8 + Math.floor(rand() * 6);
    const notch = 0.2 + rand() * 0.3;
    return { size, inside: (dx, dy) => Math.abs(dx) < 0.9 && Math.abs(dy) < 0.55 && !(dx > notch && dy < 0) && !(Math.abs(dx + 0.3) < 0.12 && Math.abs(dy) < 0.2) };
  },
};

export function bakeDebris(scene: Phaser.Scene, kind: DebrisKind): string[] {
  return Array.from({ length: DEBRIS_VARIANTS }, (_, variant) => {
    const key = `debris-${kind}-${variant}`;
    if (scene.textures.exists(key)) return key;
    const rand = seeded(4049 + variant * 131);
    const { size, inside } = DEBRIS_SHAPES[kind](rand);
    const px = new Pixels(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        if (!inside(dx, dy)) continue;
        const lit = 0.5 - 0.45 * (dx + dy) * 0.7;
        px.set(x, y, DEBRIS_SHADES[step(lit, DEBRIS_SHADES.length, x, y)]!);
      }
    bakePixels(scene, key, px);
    return key;
  });
}
