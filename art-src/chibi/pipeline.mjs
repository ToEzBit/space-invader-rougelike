// Turns raw generations into game-ready pixel sprites, a manifest and review sheets.
// Usage: node pipeline.mjs   (deterministic: same raws in, same bytes out)
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = import.meta.dirname;
const OUT = join(DIR, 'out');
const SHEETS = join(DIR, 'sheets');

// box is the in-game footprint in world units (480x640 world) that today's sprite occupies.
// scale is how many world units one art pixel covers; the game bakes today's art at 2.
export const CHARACTERS = [
  { key: 'player', raw: 'player-v1', box: [42, 48], scale: 1, colors: 20, mirror: true, textureKeys: ['player'] },
  { key: 'optionDrone', raw: 'optionDrone-v1', box: [14, 12], scale: 1, colors: 8, darkWeight: 1, textureKeys: ['optionDrone'] },
  { key: 'familiar', raw: 'familiar-v1', box: [15, 15], scale: 1, colors: 8, darkWeight: 1.5, mirror: true, textureKeys: ['familiar'] },
  { key: 'drone', raw: 'drone-v1', box: [26, 24], scale: 1, colors: 20, textureKeys: ['drone0', 'drone1'] },
  { key: 'gunner', raw: 'gunner-v1', box: [30, 26], scale: 1, colors: 20, darkWeight: 1.5, textureKeys: ['gunner0', 'gunner1'] },
  { key: 'tank', raw: 'tank-v1', box: [30, 28], scale: 1, colors: 20, textureKeys: ['tank0', 'tank1'] },
  { key: 'diver', raw: 'diver-v1', box: [30, 26], scale: 1, colors: 20, textureKeys: ['diver0', 'diver1'] },
  { key: 'crimsonSeraph', raw: 'crimsonSeraph-v2', box: [126, 104], scale: 1, colors: 28, kin: 48, textureKeys: ['crimsonSeraph'] },
  { key: 'voidEmpress', raw: 'voidEmpress-v3', box: [126, 116], scale: 1, colors: 28, textureKeys: ['voidEmpress'] },
  { key: 'crimsonSeraphAscended', form: 'crimsonSeraph', raw: 'crimsonSeraphAscended-v2', box: [132, 128], scale: 1, colors: 28, kin: 0, textureKeys: ['crimsonSeraphAscended'] },
  { key: 'voidEmpressEclipse', form: 'voidEmpress', raw: 'voidEmpressEclipse-v2', box: [132, 128], scale: 1, colors: 28, textureKeys: ['voidEmpressEclipse'] },
  { key: 'crimsonSeraphAscendedCast', raw: 'crimsonSeraphAscendedCast-v1', box: [132, 128], scale: 1, colors: 28, kin: 0, textureKeys: ['crimsonSeraphAscendedCast'] },
  { key: 'voidEmpressEclipseCast', raw: 'voidEmpressEclipseCast-v1', box: [132, 128], scale: 1, colors: 28, textureKeys: ['voidEmpressEclipseCast'] },
];
const BOSS_KEYS = ['crimsonSeraph', 'voidEmpress'];
const CANDIDATE_SCALES = [1, 2];

function readPng(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { w: png.width, h: png.height, data: png.data };
}

export function writePng(file, img) {
  const png = new PNG({ width: img.w, height: img.h });
  img.data.copy ? img.data.copy(png.data) : png.data.set(img.data);
  writeFileSync(file, PNG.sync.write(png, { colorType: 6 }));
}

const blank = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function borderColor(img) {
  const ch = [[], [], []];
  const push = (x, y) => {
    const i = (y * img.w + x) * 4;
    for (let c = 0; c < 3; c++) ch[c].push(img.data[i + c]);
  };
  for (let x = 0; x < img.w; x++) push(x, 0), push(x, img.h - 1);
  for (let y = 0; y < img.h; y++) push(0, y), push(img.w - 1, y);
  return ch.map(median);
}

const KEY_NEAR = 70;
const KEY_FAR = 150;

// Returns rgb plus a 0..1 alpha per pixel. Colors near the background fade out; the band of
// pixels touching the background is despilled so no key color survives on the edge.
function keyOut(img) {
  const bg = borderColor(img);
  const n = img.w * img.h;
  const rgb = new Float32Array(n * 3);
  const alpha = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const c = [img.data[p * 4], img.data[p * 4 + 1], img.data[p * 4 + 2]];
    rgb.set(c, p * 3);
    const d = dist(c, bg);
    alpha[p] = Math.min(1, Math.max(0, (d - KEY_NEAR) / (KEY_FAR - KEY_NEAR)));
  }
  const dominant = bg.indexOf(Math.max(...bg));
  const others = [0, 1, 2].filter((c) => c !== dominant);
  const band = dilate(alpha.map((a) => (a < 1 ? 1 : 0)), img.w, img.h, 3);
  for (let p = 0; p < n; p++) {
    if (!band[p]) continue;
    const cap = Math.max(rgb[p * 3 + others[0]], rgb[p * 3 + others[1]]);
    rgb[p * 3 + dominant] = Math.min(rgb[p * 3 + dominant], cap);
  }
  return { w: img.w, h: img.h, rgb, alpha, bg };
}

function dilate(mask, w, h, r) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
        }
    }
  return out;
}

// Keeps connected parts at least this share of the largest part, so detached pods and orbs stay
// while stray sparkles go.
const MIN_PART = 0.01;

function keepMainParts(k) {
  const { w, h, alpha } = k;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (alpha[s] < 0.5 || label[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (alpha[q] >= 0.5 && label[q] < 0) (label[q] = id), stack.push(q);
        }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes);
  const keep = sizes.map((s) => s >= biggest * MIN_PART);
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let p = 0; p < w * h; p++) {
    const id = label[p];
    if (id >= 0 && keep[id]) {
      const x = p % w;
      const y = (p / w) | 0;
      x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
    } else if (alpha[p] < 0.5 || id >= 0) alpha[p] = 0;
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, parts: sizes.length, kept: keep.filter(Boolean).length };
}

function palette(k, box, count) {
  const pts = [];
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      const p = y * k.w + x;
      if (k.alpha[p] >= 0.99) pts.push([k.rgb[p * 3], k.rgb[p * 3 + 1], k.rgb[p * 3 + 2]]);
    }
  let boxes = [pts];
  while (boxes.length < count) {
    let best = -1;
    let bestRange = -1;
    let bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of b) (lo = Math.min(lo, p[c])), (hi = Math.max(hi, p[c]));
        if (hi - lo > bestRange) [best, bestRange, bestCh] = [i, hi - lo, c];
      }
    });
    if (best < 0) break;
    const b = boxes[best].sort((p, q) => p[bestCh] - q[bestCh] || p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
    const mid = b.length >> 1;
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
  }
  let pal = boxes.map(mean);
  for (let iter = 0; iter < 6; iter++) {
    const groups = pal.map(() => []);
    for (const p of pts) groups[nearest(pal, p)].push(p);
    pal = groups.map((g, i) => (g.length ? mean(g) : pal[i]));
  }
  return pal.map((c) => c.map(Math.round));
}

function mean(pts) {
  const s = [0, 0, 0];
  for (const p of pts) for (let c = 0; c < 3; c++) s[c] += p[c];
  return s.map((v) => v / pts.length);
}

function nearest(pal, c) {
  let best = 0;
  let bd = Infinity;
  pal.forEach((p, i) => {
    const d = dist(p, c);
    if (d < bd) (bd = d), (best = i);
  });
  return best;
}

const COVERAGE = 0.5;
// Line art and pupils are the first thing a downscale loses, so dark colors win ties and more.
const DARK_LUM = 70;
const DARK_WEIGHT = 2.2;
// Shades of one material split their votes across palette entries; a thin line in a single shade
// then outvotes the surface it crosses. With kin > 0, votes count for every palette color within
// that distance. It cleans large sprites with many shades; small ones look better without it.

// Each art pixel takes the most common palette color of its source block, so outlines and eyes
// stay crisp instead of averaging into mud. -1 is transparent.

function span(i, n, len) {
  const a = Math.floor((i * len) / n);
  return [a, Math.max(Math.floor(((i + 1) * len) / n), a + 1)];
}

function snap(k, box, pal, artW, artH, darkWeight = DARK_WEIGHT, kinDist = 0) {
  const grid = Array.from({ length: artH }, () => new Array(artW).fill(-1));
  const cache = new Map();
  const toIdx = (p) => {
    const key = ((k.rgb[p * 3] | 0) << 16) | ((k.rgb[p * 3 + 1] | 0) << 8) | (k.rgb[p * 3 + 2] | 0);
    let idx = cache.get(key);
    if (idx === undefined) cache.set(key, (idx = nearest(pal, [k.rgb[p * 3], k.rgb[p * 3 + 1], k.rgb[p * 3 + 2]])));
    return idx;
  };
  const weight = pal.map((c) => (lum(c) < DARK_LUM ? darkWeight : 1));
  const kin = pal.map((c) => pal.flatMap((d, n) => (dist(c, d) <= kinDist ? [n] : [])));
  for (let j = 0; j < artH; j++)
    for (let i = 0; i < artW; i++) {
      const [x0, x1] = span(i, artW, box.w).map((v) => v + box.x);
      const [y0, y1] = span(j, artH, box.h).map((v) => v + box.y);
      const votes = new Float64Array(pal.length);
      let cover = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const p = y * k.w + x;
          if (k.alpha[p] <= 0) continue;
          cover += k.alpha[p];
          votes[toIdx(p)] += k.alpha[p];
        }
      if (cover / ((x1 - x0) * (y1 - y0)) < COVERAGE) continue;
      const support = votes.map((v, c) => (v > 0 ? kin[c].reduce((sum, n) => sum + votes[n], 0) * weight[c] + v * 1e-3 : -1));
      let best = 0;
      support.forEach((v, c) => v > support[best] && (best = c));
      grid[j][i] = best;
    }
  return grid;
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
// A lone pixel this close to its surroundings is noise; a high-contrast one (an eye glint) stays.
const NOISE_DELTA = 70;

function cleanup(grid, pal) {
  const h = grid.length;
  const w = grid[0].length;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : grid[y][x]);
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      const n4 = N4.map(([dx, dy]) => at(x + dx, y + dy));
      if (c >= 0 && n4.every((n) => n < 0)) {
        out[y][x] = -1;
        continue;
      }
      if (c < 0) {
        if (n4.filter((n) => n >= 0).length === 4) out[y][x] = modeOf(n4);
        continue;
      }
      if (n4.some((n) => n === c)) continue;
      const around = N8.map(([dx, dy]) => at(x + dx, y + dy)).filter((n) => n >= 0);
      const m = modeOf(around);
      if (m >= 0 && dist(pal[m], pal[c]) < NOISE_DELTA) out[y][x] = m;
    }
  return out;
}

function modeOf(list) {
  const count = new Map();
  for (const v of list) if (v >= 0) count.set(v, (count.get(v) ?? 0) + 1);
  let best = -1;
  let bc = 0;
  for (const [v, c] of [...count].sort((a, b) => a[0] - b[0])) if (c > bc) (best = v), (bc = c);
  return best;
}

export function toImage(grid, pal, scale = 1) {
  const h = grid.length;
  const w = grid[0].length;
  const img = blank(w * scale, h * scale);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      const c = grid[(y / scale) | 0][(x / scale) | 0];
      if (c < 0) continue;
      const i = (y * img.w + x) * 4;
      img.data[i] = pal[c][0];
      img.data[i + 1] = pal[c][1];
      img.data[i + 2] = pal[c][2];
      img.data[i + 3] = 255;
    }
  return img;
}

// Opaque pixels leaning toward the key color; a clean key leaves zero.
function keyFringe(grid, pal, bg) {
  const dominant = bg.indexOf(Math.max(...bg));
  return grid.flat().filter((c) => c >= 0 && pal[c][dominant] > Math.max(...pal[c].filter((_, i) => i !== dominant)) + 30).length;
}

function usedColors(grid) {
  return new Set(grid.flat().filter((c) => c >= 0)).size;
}

// Fits the trimmed sprite inside the footprint, keeping its aspect, plus 1 px of transparent pad.
function artSize(box, footprint, scale) {
  const maxW = Math.floor(footprint[0] / scale) - 2;
  const maxH = Math.floor(footprint[1] / scale) - 2;
  const f = Math.min(maxW / box.w, maxH / box.h);
  return [Math.max(1, Math.round(box.w * f)), Math.max(1, Math.round(box.h * f))];
}

// Rings the silhouette with the darkest palette color where its edge is not already dark.
function outline(grid, pal) {
  const ink = pal.reduce((best, c, i) => (lum(c) < lum(pal[best]) ? i : best), 0);
  const h = grid.length;
  const w = grid[0].length;
  return grid.map((row, y) =>
    row.map((c, x) => {
      if (c >= 0) return c;
      const edge = N4.some(([dx, dy]) => {
        const n = grid[y + dy]?.[x + dx] ?? -1;
        return n >= 0 && lum(pal[n]) >= DARK_LUM;
      });
      return edge && x >= 0 && x < w && y < h ? ink : c;
    }),
  );
}

// Every character is designed symmetric; mirroring the left half removes the generator's drift.
function mirror(grid) {
  return grid.map((row) => row.map((c, x) => (x < row.length / 2 ? c : row[row.length - 1 - x])));
}

function pad(grid) {
  const w = grid[0].length;
  const row = () => new Array(w + 2).fill(-1);
  return [row(), ...grid.map((r) => [-1, ...r, -1]), row()];
}

export function processCharacter(c) {
  const raw = readPng(join(DIR, 'raw', `${c.raw}.png`));
  const k = keyOut(raw);
  const box = keepMainParts(k);
  const pal = palette(k, box, c.colors);
  const results = {};
  for (const scale of CANDIDATE_SCALES) {
    const [aw, ah] = artSize(box, c.box, scale);
    const snapped = cleanup(snap(k, box, pal, aw, ah, c.darkWeight, c.kin), pal);
    const grid = outline(pad(c.mirror ? mirror(snapped) : snapped), pal);
    results[scale] = { grid, w: aw + 2, h: ah + 2, colors: usedColors(grid), fringe: keyFringe(grid, pal, k.bg) };
  }
  return { raw, k, box, pal, results };
}

const NAVY = [10, 15, 46];

export function canvas(w, h, color = NAVY) {
  const img = blank(w, h);
  for (let p = 0; p < w * h; p++) img.data.set([...color, 255], p * 4);
  return img;
}

export function blit(dst, src, x0, y0, scale = 1) {
  for (let y = 0; y < src.h * scale; y++)
    for (let x = 0; x < src.w * scale; x++) {
      const dx = x0 + x;
      const dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      const s = (((y / scale) | 0) * src.w + ((x / scale) | 0)) * 4;
      const a = src.data[s + 3] / 255;
      if (!a) continue;
      const d = (dy * dst.w + dx) * 4;
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round(src.data[s + c] * a + dst.data[d + c] * (1 - a));
    }
}

function fillRect(img, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.data.set(color, (y * img.w + x) * 4);
}

// 3x5 pixel font for sheet labels.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', x: '000101010101000', '.': '000000000000010', '@': '010101111100011',
  '-': '000000111000000', '/': '001001010100100',
};

export function text(img, str, x, y, s = 2, color = [200, 210, 255, 255]) {
  for (const ch of str.toUpperCase().replace(/X(?=\d)/g, 'x')) {
    const g = FONT[ch] ?? FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') fillRect(img, x + (i % 3) * s, y + ((i / 3) | 0) * s, s, s, color);
    x += 4 * s;
  }
}

// Sheet (a): every candidate at in-game display size and at 4x, on navy.
function spriteSheet(all) {
  const PADX = 16;
  const rows = all.map(({ c, res }) =>
    CANDIDATE_SCALES.map((s) => ({ s, img: toImage(res.results[s].grid, res.pal, s), r: res.results[s] })),
  );
  const rowH = rows.map((r) => Math.max(...r.map((v) => v.img.h * 4)) + 40);
  const colW = Math.max(...rows.flat().map((v) => v.img.w * 5)) + PADX * 3;
  const sheet = canvas(220 + colW * CANDIDATE_SCALES.length, rowH.reduce((a, b) => a + b, 0) + 40);
  text(sheet, 'CANDIDATES. EACH CELL - DISPLAY SIZE THEN 4x', 16, 12);
  let y = 40;
  rows.forEach((r, i) => {
    const { c } = all[i];
    text(sheet, c.key, 16, y + 8);
    text(sheet, `BOX ${c.box[0]}x${c.box[1]}`, 16, y + 24);
    text(sheet, `PICK S${c.scale}`, 16, y + 40, 2, [255, 232, 74, 255]);
    r.forEach((v, j) => {
      const x = 220 + j * colW;
      text(sheet, `S${v.s} ART ${v.r.w}x${v.r.h} ${v.r.colors}C`, x, y + 2, 2, v.s === c.scale ? [255, 232, 74, 255] : undefined);
      blit(sheet, v.img, x, y + 20);
      blit(sheet, v.img, x + v.img.w + PADX, y + 20, 4);
    });
    y += rowH[i];
  });
  return sheet;
}

// The game's backdrop: nebula gradient, three soft glows and the seeded star layers.
function stageBackdrop() {
  const W = 480;
  const H = 640;
  const img = blank(W, H);
  const stops = [[0, [0x12, 0x0b, 0x3a]], [0.55, [0x07, 0x06, 0x1a]], [1, [0x0a, 0x0f, 0x2e]]];
  const glows = [[80, 120, 160, [216, 27, 140], 0.16], [400, 280, 180, [70, 240, 255], 0.08], [240, 520, 200, [166, 107, 255], 0.12]];
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const [a, b] = t < 0.55 ? [stops[0], stops[1]] : [stops[1], stops[2]];
    const u = (t - a[0]) / (b[0] - a[0]);
    const base = a[1].map((v, c) => v + (b[1][c] - v) * u);
    for (let x = 0; x < W; x++) {
      let col = [...base];
      for (const [gx, gy, r, gc, ga] of glows) {
        const f = Math.max(0, 1 - Math.hypot(x - gx, y - gy) / r) * ga;
        col = col.map((v, c) => v * (1 - f) + gc[c] * f);
      }
      img.data.set([...col.map(Math.round), 255], (y * W + x) * 4);
    }
  }
  const styles = [
    { count: 140, size: 1, colors: [[58, 63, 122], [75, 79, 143], [45, 108, 154]] },
    { count: 60, size: 1, colors: [[154, 166, 255], [127, 230, 255], [255, 182, 230]] },
    { count: 24, size: 2, colors: [[255, 255, 255], [201, 246, 255], [255, 232, 74]] },
  ];
  styles.forEach((st, layer) => {
    let seed = 1234 + layer * 977;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < st.count; i++) {
      const x = Math.floor(rand() * W);
      const y = Math.floor(rand() * H);
      const c = [...st.colors[i % st.colors.length], 255];
      fillRect(img, x, y, st.size, st.size, c);
      if (st.size > 1 && i % 3 === 0) fillRect(img, x - 2, y, st.size + 4, 1, c), fillRect(img, x, y - 2, 1, st.size + 4, c);
    }
  });
  return img;
}

const centered = (dst, img, cx, cy) => blit(dst, img, Math.round(cx - img.w / 2), Math.round(cy - img.h / 2));

// Sheet (b): a wave frame and a boss frame at real world coordinates, shown at x2.
function stageSheet(sprites, scaleOf, label) {
  const at = (key) => sprites[key][scaleOf(key)];
  const frames = [];
  const wave = stageBackdrop();
  const rows = [['tank'], ['gunner'], ['drone', 'diver']];
  const originX = (480 - 7 * 36) / 2;
  rows.forEach((kinds, row) => {
    for (let col = 0; col < 8; col++) centered(wave, at(kinds[col % kinds.length]), originX + col * 36, 96 + row * 30);
  });
  centered(wave, at('diver'), 300, 330);
  const shipY = 572;
  centered(wave, at('player'), 240, shipY);
  for (const dx of [-36, 36]) centered(wave, at('optionDrone'), 240 + dx, shipY + 8);
  frames.push(wave);
  for (const boss of ['crimsonSeraph', 'voidEmpress']) {
    const f = stageBackdrop();
    centered(f, at(boss), 240, 138);
    for (const [x, y] of [[90, 250], [390, 270], [200, 290]]) centered(f, at('drone'), x, y);
    centered(f, at('player'), 240, shipY);
    for (const dx of [-36, 36]) centered(f, at('optionDrone'), 240 + dx, shipY + 8);
    frames.push(f);
  }
  const sheet = canvas(frames.length * (960 + 20) + 20, 1280 + 60);
  text(sheet, label, 20, 20, 3);
  frames.forEach((f, i) => blit(sheet, f, 20 + i * 980, 60, 2));
  return sheet;
}

// Sheet (c): a boss's first form next to its second, at in-game size and at 4x, on navy.
function formsSheet(one, two, f) {
  const GAP = 24;
  const w1 = Math.max(one.w, two.w);
  const h1 = Math.max(one.h, two.h);
  const sheet = canvas(GAP * 5 + w1 * 2 + one.w * 4 + two.w * 4, 70 + h1 * 4 + GAP);
  text(sheet, `${f.form} -> ${f.key}. 1x THEN 4x`, GAP, 14);
  text(sheet, `${one.w}x${one.h}`, GAP, 40);
  text(sheet, `${two.w}x${two.h}`, GAP * 2 + w1, 40, 2, [255, 232, 74, 255]);
  blit(sheet, one, GAP, 60);
  blit(sheet, two, GAP * 2 + w1, 60);
  blit(sheet, one, GAP * 3 + w1 * 2, 60, 4);
  blit(sheet, two, GAP * 4 + w1 * 2 + one.w * 4, 60, 4);
  return sheet;
}

// Sheet (d): boss frames at real world coordinates (boss at HOME_Y 138, ship at 572), shown at x2.
function bossStageSheet(at, bosses) {
  const shipY = 572;
  const frames = bosses.map((boss) => {
    const f = stageBackdrop();
    centered(f, at(boss), 240, 138);
    for (const [x, y] of [[90, 250], [390, 270], [200, 290]]) centered(f, at('drone'), x, y);
    centered(f, at('player'), 240, shipY);
    for (const dx of [-36, 36]) centered(f, at('optionDrone'), 240 + dx, shipY + 8);
    return f;
  });
  const sheet = canvas(frames.length * 980 + 20, 1280 + 60);
  text(sheet, `${bosses.join(' / ')}. WORLD x2`, 20, 20, 3);
  frames.forEach((f, i) => blit(sheet, f, 20 + i * 980, 60, 2));
  return sheet;
}

function main() {
  mkdirSync(join(OUT, 'candidates'), { recursive: true });
  mkdirSync(SHEETS, { recursive: true });
  const all = [];
  const sprites = {};
  const manifest = [];
  for (const c of CHARACTERS) {
    if (!existsSync(join(DIR, 'raw', `${c.raw}.png`))) {
      console.log(`${c.key}: missing raw/${c.raw}.png, skipped`);
      continue;
    }
    const res = processCharacter(c);
    all.push({ c, res });
    sprites[c.key] = {};
    for (const s of CANDIDATE_SCALES) {
      const r = res.results[s];
      writePng(join(OUT, 'candidates', `${c.key}@s${s}.png`), toImage(r.grid, res.pal));
      sprites[c.key][s] = toImage(r.grid, res.pal, s);
    }
    const pick = res.results[c.scale];
    writePng(join(OUT, `${c.key}.png`), toImage(pick.grid, res.pal));
    writePng(join(OUT, `${c.key}@display.png`), toImage(pick.grid, res.pal, c.scale));
    const [dw, dh] = [pick.w * c.scale, pick.h * c.scale];
    manifest.push({
      key: c.key,
      textureKeys: c.textureKeys,
      file: `out/${c.key}.png`,
      displayFile: `out/${c.key}@display.png`,
      raw: `raw/${c.raw}.png`,
      artW: pick.w,
      artH: pick.h,
      displayScale: c.scale,
      suggestedDisplayW: dw,
      suggestedDisplayH: dh,
      currentFootprint: c.box,
      colors: pick.colors,
      hitRadius: hitRadius(c, dw, dh),
      keying: { background: res.k.bg, fringePixels: pick.fringe, parts: res.box.parts, partsKept: res.box.kept, trimmed: [res.box.w, res.box.h] },
      notes: notesFor(c),
    });
    console.log(`${c.key}: raw ${res.raw.w}x${res.raw.h} trim ${res.box.w}x${res.box.h} parts ${res.box.kept}/${res.box.parts} -> ${CANDIDATE_SCALES.map((s) => `s${s} ${res.results[s].w}x${res.results[s].h} fringe ${res.results[s].fringe}`).join(', ')}`);
  }
  writeFileSync(
    join(DIR, 'manifest.json'),
    JSON.stringify(
      {
        world: [480, 640],
        idle: 'Single frame per character. Idle motion comes from code (bob, squash, blink tint); map both *0/*1 frame keys to the same texture.',
        bake: 'Load displayFile, or bake file with an integer nearest-neighbour upscale of displayScale, so frame size equals display size (World.addFoe derives hit radius from frame size).',
        sprites: manifest,
      },
      null,
      2,
    ) + '\n',
  );
  writePng(join(SHEETS, 'a-sprites.png'), spriteSheet(all));
  const pick = (k) => sprites[k]?.[CHARACTERS.find((c) => c.key === k).scale];
  for (const f of CHARACTERS.filter((c) => c.form && sprites[c.key] && sprites[c.form])) {
    writePng(join(SHEETS, `c-forms-${f.form}.png`), formsSheet(pick(f.form), pick(f.key), f));
    if (sprites.player && sprites.optionDrone && sprites.drone) writePng(join(SHEETS, `d-stage-${f.key}.png`), bossStageSheet(pick, [f.form, f.key]));
  }
  if (all.length < CHARACTERS.length) return console.log('stage sheets need every character');
  writePng(join(SHEETS, 'b-stage-picked.png'), stageSheet(sprites, (k) => CHARACTERS.find((c) => c.key === k).scale, 'PICKED SCALES. WAVE / SERAPH / EMPRESS. WORLD x2'));
  for (const s of CANDIDATE_SCALES) writePng(join(SHEETS, `b-stage-s${s}.png`), stageSheet(sprites, () => s, `ALL AT S${s}. WORLD x2`));
}

// What the game would use as the collision radius with this sprite, and what it uses today.
function hitRadius(c, dw, dh) {
  if (c.key === 'player') return { fixed: 'Player.coreRadius 5 and bodyRadius 14, independent of the sprite' };
  if (c.key === 'optionDrone') return { fixed: 'none, option drones do not collide' };
  if (BOSS_KEYS.some((b) => c.key.startsWith(b))) return { fixed: 'Boss sets foe.radius = 42' };
  return { now: +(Math.min(...c.box) * 0.45).toFixed(1), withThisSprite: +(Math.min(dw, dh) * 0.45).toFixed(1), rule: 'min(frame w, h) * 0.45' };
}

function notesFor(c) {
  const notes = [];
  if (c.textureKeys.length > 1) notes.push(`Replaces ${c.textureKeys.join(' and ')}; no second frame, so bob or squash in code.`);
  if (c.key === 'player') notes.push('No exhaust in the art. The flame sprite attaches at PLAYER_Y+24 (half of the old 48 px height); this ship is 35 tall, so attach it at displayHeight/2 to close the gap.');
  if (c.key.startsWith('crimson') || c.key.startsWith('void')) notes.push('Boss radius stays hardcoded at 42; the halo copy is a tinted 1.08x of this texture.');
  if (c.scale === 1) notes.push('Scale 1 means finer pixels than bullets, icons and HUD, which stay baked at ART_SCALE 2.');
  return notes;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
