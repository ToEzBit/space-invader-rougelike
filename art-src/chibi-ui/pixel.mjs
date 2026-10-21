// Keying, palette and pixel-grid snapping, lifted verbatim from ../chibi/pipeline.mjs so UI art and characters share one recipe.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
function readPng(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { w: png.width, h: png.height, data: png.data };
}

function writePng(file, img) {
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

function toImage(grid, pal, scale = 1) {
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

export { readPng, writePng, blank, dist, lum, keyOut, dilate, keepMainParts, palette, nearest, snap, cleanup, modeOf, toImage, keyFringe, usedColors, outline, mirror, pad, N4, N8, DARK_LUM };
