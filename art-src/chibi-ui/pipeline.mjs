// Turns raw generations into game-ready UI art (9-slice frames, icons, images), a manifest and a stretch preview.
// Usage: node pipeline.mjs   (deterministic: same raws in, same bytes out)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blank, cleanup, dist, keepMainParts, keyOut, lum, palette, pad, readPng, snap, writePng, outline, N4 } from './pixel.mjs';
import { ASSETS } from './assets.mjs';

const DIR = import.meta.dirname;
const OUT = join(DIR, 'out');

// ---------- color helpers ----------
function toHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    t = ((t % 1) + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(v * 255);
  };
  return [ch(h / 360 + 1 / 3), ch(h / 360), ch(h / 360 - 1 / 3)];
}

const hueGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Recolors one hue family of a palette (the frame's candy band) to a target hue, keeping lightness steps.
export function recolor(pal, { from, to, width = 40, sat, minL = 0.12, light = 1 }) {
  return pal.map((c) => {
    const [h, s, l] = toHsl(c);
    if (s < 0.25 || l < minL || hueGap(h, from) > width) return c;
    return fromHsl([to, sat ?? s, l * light]);
  });
}

const mix = (c, d, t) => c.map((v, i) => Math.round(v + (d[i] - v) * t));

// ---------- 9-slice ----------
function interiorIndex(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const count = new Map();
  for (let y = Math.floor(h * 0.35); y < Math.ceil(h * 0.65); y++)
    for (let x = Math.floor(w * 0.35); x < Math.ceil(w * 0.65); x++) count.set(grid[y][x], (count.get(grid[y][x]) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// Thickness of the border along one line: cells before the first interior cell.
function depth(line, inner) {
  const i = line.indexOf(inner);
  return i < 0 ? line.length : i;
}

function modeOf(list) {
  const count = new Map();
  for (const v of list) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// Insets are where each edge's border profile stops changing: past them the edge is plain and safe to stretch.
function findInsets(grid, inner) {
  const h = grid.length;
  const w = grid[0].length;
  const col = (x) => grid.map((r) => r[x]);
  const top = Array.from({ length: w }, (_, x) => depth(col(x), inner));
  const bottom = Array.from({ length: w }, (_, x) => depth(col(x).reverse(), inner));
  const left = grid.map((r) => depth(r, inner));
  const right = grid.map((r) => depth([...r].reverse(), inner));
  const mid = (arr) => modeOf(arr.slice(Math.floor(arr.length * 0.3), Math.ceil(arr.length * 0.7)));
  const [tm, bm, lm, rm] = [top, bottom, left, right].map(mid);
  // Only the outer quarter of each edge can hold corner art; noise further in is replaced by the edge mode anyway.
  // A line is corner art when 2+ cells on one side differ from the edge's mode pattern; lone snap nubs are ignored.
  const midCols = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
  const xs = midCols(Math.floor(w * 0.3), Math.ceil(w * 0.7));
  const ys = midCols(Math.floor(h * 0.3), Math.ceil(h * 0.7));
  const topPat = Array.from({ length: tm + 1 }, (_, y) => modeOf(xs.map((x) => grid[y][x])));
  const botPat = Array.from({ length: bm + 1 }, (_, y) => modeOf(xs.map((x) => grid[h - 1 - y][x])));
  const leftPat = Array.from({ length: lm + 1 }, (_, x) => modeOf(ys.map((y) => grid[y][x])));
  const rightPat = Array.from({ length: rm + 1 }, (_, x) => modeOf(ys.map((y) => grid[y][w - 1 - x])));
  const misses = (pat, at) => pat.reduce((n, v, i) => n + (at(i) !== v), 0);
  const plainCols = Array.from({ length: w }, (_, x) => Math.max(misses(topPat, (y) => grid[y][x]), misses(botPat, (y) => grid[h - 1 - y][x])) < 2);
  const plainRows = Array.from({ length: h }, (_, y) => Math.max(misses(leftPat, (x) => grid[y][x]), misses(rightPat, (x) => grid[y][w - 1 - x])) < 2);
  const reach = (plain, n, fromEnd) => {
    let last = -1;
    for (let i = 0; i < Math.floor(n / 4); i++) if (!plain[fromEnd ? n - 1 - i : i]) last = i;
    return last + 1;
  };
  const L = reach(plainCols, w, false);
  const R = reach(plainCols, w, true);
  const T = reach(plainRows, h, false);
  const B = reach(plainRows, h, true);
  return { left: Math.max(L, lm), right: Math.max(R, rm), top: Math.max(T, tm), bottom: Math.max(B, bm), border: { top: tm, bottom: bm, left: lm, right: rm } };
}

const MID = 4;

// Corners come straight from the snapped art; each edge is the per-row (or per-column) mode of its plain run.
function canonical(grid, ins, inner) {
  const h = grid.length;
  const w = grid[0].length;
  const { left: L, right: R, top: T, bottom: B } = ins;
  const W = L + MID + R;
  const H = T + MID + B;
  const out = Array.from({ length: H }, () => new Array(W).fill(inner));
  const srcX = (x) => (x < L ? x : x >= L + MID ? w - (W - x) : -1);
  const srcY = (y) => (y < T ? y : y >= T + MID ? h - (H - y) : -1);
  const rowMode = (y) => modeOf(grid[y].slice(L, w - R));
  const colMode = (x) => modeOf(grid.slice(T, h - B).map((r) => r[x]));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = srcX(x);
      const sy = srcY(y);
      if (sx >= 0 && sy >= 0) out[y][x] = grid[sy][sx];
      else if (sy >= 0) out[y][x] = rowMode(sy);
      else if (sx >= 0) out[y][x] = colMode(sx);
    }
  return out;
}

function render(grid, pal, scale, alphaOf = () => 255) {
  const h = grid.length;
  const w = grid[0].length;
  const img = blank(w * scale, h * scale);
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++) {
      const c = grid[(y / scale) | 0][(x / scale) | 0];
      if (c < 0) continue;
      img.data.set([...pal[c], alphaOf(c)], (y * img.w + x) * 4);
    }
  return img;
}

// Generator noise splits one flat fill into near-identical entries; fold them so a fill is one index.
function mergeClose(pal, within) {
  const kept = [];
  for (const c of pal) if (!kept.some((d) => dist(c, d) < within)) kept.push(c);
  return kept;
}

function snapRaw(a) {
  const raw = readPng(join(DIR, 'raw', `${a.raw}.png`));
  const k = keyOut(raw);
  const box = keepMainParts(k);
  const pal = mergeClose(palette(k, box, a.colors), a.merge ?? 14);
  const artW = a.artW ?? Math.round(box.w / a.pitch);
  const artH = a.artH ?? Math.round((box.h * artW) / box.w);
  const grid = cleanup(snap(k, box, pal, artW, artH, a.darkWeight ?? 1, a.kin ?? 0), pal);
  return { raw, k, box, pal, grid };
}

// Variants share the frame's geometry, so hover and branch swaps never shift layout.
function variantPalette(pal, inner, ink, v) {
  if (v.recolor) pal = recolor(pal, v.recolor);
  if (v.lighten) pal = pal.map((c, i) => (i === ink ? c : i === inner ? mix(c, [255, 255, 255], v.lighten / 3) : mix(c, [255, 255, 255], v.lighten)));
  if (v.gray) pal = pal.map((c, i) => (i === ink ? c : mix(c, Array(3).fill(Math.round(lum(c) * 0.8)), v.gray)));
  return pal;
}

function processFrame(a) {
  const s = snapRaw(a);
  const inner = interiorIndex(s.grid);
  const ins = findInsets(s.grid, inner);
  const grid = canonical(s.grid, ins, inner);
  const ink = s.pal.reduce((best, c, i) => (lum(c) < lum(s.pal[best]) ? i : best), 0);
  const centerAlpha = Math.round((a.centerAlpha ?? 1) * 255);
  const alphaOf = (c) => (c === inner ? centerAlpha : 255);
  const files = [];
  for (const v of [{ suffix: '' }, ...(a.variants ?? [])]) {
    const key = a.key + (v.suffix ?? '');
    const pal = variantPalette(s.pal, inner, ink, v);
    const img = render(grid, pal, a.scale, alphaOf);
    writePng(join(OUT, `${key}.png`), img);
    files.push({ key, img, use: v.use ?? a.use });
  }
  const sc = (n) => n * a.scale;
  const insets = { left: sc(ins.left), right: sc(ins.right), top: sc(ins.top), bottom: sc(ins.bottom) };
  return {
    files,
    insets,
    border: Object.fromEntries(Object.entries(ins.border).map(([k, n]) => [k, sc(n)])),
    snapped: { w: s.grid[0].length, h: s.grid.length },
    colors: new Set(grid.flat()).size,
    interior: s.pal[inner],
    keying: { background: s.k.bg, trimmed: [s.box.w, s.box.h], parts: s.box.parts, partsKept: s.box.kept },
    debug: render(s.grid, s.pal, 1),
  };
}

// Phaser NineSlice semantics: corners fixed, edges and center stretched with nearest sampling.
export function nineSlice(img, ins, W, H) {
  const out = blank(W, H);
  const { left: L, right: R, top: T, bottom: B } = ins;
  const map = (d, D, a, b, n) => (d < a ? d : d >= D - b ? n - (D - d) : a + Math.floor(((d - a) * (n - a - b)) / Math.max(1, D - a - b)));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = map(x, W, L, R, img.w);
      const sy = map(y, H, T, B, img.h);
      out.data.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (y * W + x) * 4);
    }
  return out;
}

// ---------- icons ----------
function components(k, minShare) {
  const { w, h, alpha } = k;
  const label = new Int32Array(w * h).fill(-1);
  const parts = [];
  for (let s0 = 0; s0 < w * h; s0++) {
    if (alpha[s0] < 0.5 || label[s0] >= 0) continue;
    const id = parts.length;
    const stack = [s0];
    label[s0] = id;
    let [x0, y0, x1, y1, size] = [w, h, -1, -1, 0];
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      size++;
      x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (alpha[q] >= 0.5 && label[q] < 0) (label[q] = id), stack.push(q);
        }
    }
    parts.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, size });
  }
  const big = Math.max(...parts.map((p) => p.size));
  return parts.filter((p) => p.size >= big * minShare);
}

// Merges boxes that overlap or nearly touch, so an icon's detached sparkle stays with it.
function mergeBoxes(boxes, gap) {
  let list = boxes.map((b) => ({ ...b }));
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.x - gap > b.x + b.w || b.x - gap > a.x + a.w || a.y - gap > b.y + b.h || b.y - gap > a.y + a.h) continue;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        list[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, size: a.size + b.size };
        list.splice(j, 1);
        changed = true;
        break outer;
      }
  }
  return list;
}

// Reading order: rows by center y (a row is anything within half a cell height), then x.
function readingOrder(boxes) {
  const cy = (b) => b.y + b.h / 2;
  const sorted = [...boxes].sort((a, b) => cy(a) - cy(b));
  const rows = [];
  for (const b of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(cy(row[0]) - cy(b)) < row[0].h / 2) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

function fitSize(box, [mw, mh]) {
  const f = Math.min(mw / box.w, mh / box.h);
  return [Math.max(1, Math.round(box.w * f)), Math.max(1, Math.round(box.h * f))];
}

function centerIn(grid, [W, H]) {
  const h = grid.length;
  const w = grid[0].length;
  const ox = Math.floor((W - w) / 2);
  const oy = Math.floor((H - h) / 2);
  return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => grid[y - oy]?.[x - ox] ?? -1));
}

function iconGrid(k, box, pal, size, darkWeight) {
  const [aw, ah] = fitSize(box, [size[0] - 2, size[1] - 2]);
  const sub = { ...k };
  const g = cleanup(snap(sub, box, pal, aw, ah, darkWeight, 0), pal);
  return centerIn(outline(pad(g), pal), size);
}

function processIconSheet(a) {
  const raw = readPng(join(DIR, 'raw', `${a.raw}.png`));
  const k = keyOut(raw);
  const boxes = readingOrder(mergeBoxes(components(k, a.minShare ?? 0.05), a.mergeGap ?? 12));
  if (boxes.length !== a.icons.length) throw new Error(`${a.raw}: found ${boxes.length} icons, expected ${a.icons.length}: ${JSON.stringify(boxes)}`);
  const out = [];
  a.icons.forEach((icon, i) => {
    const box = boxes[i];
    const pal = palette(k, box, icon.colors ?? a.colors);
    for (const v of icon.sizes) {
      const grid = iconGrid(k, box, pal, v.size, icon.darkWeight ?? a.darkWeight ?? 1.5);
      out.push({ key: v.key, icon, v, grid, pal, box });
    }
  });
  return { k, boxes, out };
}

// Derived icons: an empty heart is the full heart's silhouette in the HUD's dim slot colors; a spin frame is a squash.
function deriveIcon(src, d) {
  const h = src.grid.length;
  const w = src.grid[0].length;
  if (d.kind === 'hollow') {
    const pal = [...src.pal, [42, 38, 80], [74, 66, 120]];
    const ink = src.pal.reduce((b, c, i) => (lum(c) < lum(src.pal[b]) ? i : b), 0);
    const fill = pal.length - 2;
    const rim = pal.length - 1;
    const grid = src.grid.map((r, y) =>
      r.map((c, x) => {
        if (c < 0 || c === ink) return c;
        const nearInk = N4.some(([dx, dy]) => src.grid[y + dy]?.[x + dx] === ink);
        return nearInk && y < h / 2 ? rim : fill;
      }),
    );
    return { grid, pal };
  }
  if (d.kind === 'squash') {
    const nw = Math.max(1, Math.round(w * d.ratio));
    const ox = Math.floor((w - nw) / 2);
    const grid = src.grid.map((r) => r.map((_, x) => (x < ox || x >= ox + nw ? -1 : r[Math.min(w - 1, Math.floor(((x - ox) * w) / nw))])));
    return { grid, pal: src.pal };
  }
  throw new Error(d.kind);
}

// ---------- images ----------
function processImage(a) {
  const raw = readPng(join(DIR, 'raw', `${a.raw}.png`));
  const [tw, th] = a.size;
  // Deterministic crop to the target aspect, anchored by a.anchor (0 top/left, 1 bottom/right).
  const target = tw / th;
  let box = { x: 0, y: 0, w: raw.w, h: raw.h };
  if (raw.w / raw.h > target) {
    const w = Math.round(raw.h * target);
    box = { x: Math.round((raw.w - w) * (a.anchorX ?? 0.5)), y: 0, w, h: raw.h };
  } else {
    const h = Math.round(raw.w / target);
    box = { x: 0, y: Math.round((raw.h - h) * (a.anchorY ?? 0.5)), w: raw.w, h };
  }
  const n = raw.w * raw.h;
  const rgb = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) rgb.set([raw.data[p * 4], raw.data[p * 4 + 1], raw.data[p * 4 + 2]], p * 3);
  const k = { w: raw.w, h: raw.h, rgb, alpha: new Float32Array(n).fill(1), bg: [0, 0, 0] };
  if (a.keyed) Object.assign(k, keyOut(raw));
  const pal = palette(k, box, a.colors);
  const aw = Math.round(tw / a.scale);
  const ah = Math.round(th / a.scale);
  const grid = snap(k, box, pal, aw, ah, a.darkWeight ?? 1, 0);
  return { grid, pal, box, raw };
}

// ---------- main ----------
function main() {
  mkdirSync(join(OUT, 'debug'), { recursive: true });
  mkdirSync(join(DIR, 'sheets'), { recursive: true });
  const manifest = [];
  const icons = new Map();
  for (const a of ASSETS.filter((x) => x.kind !== 'derivedIcon')) {
    if (!existsSync(join(DIR, 'raw', `${a.raw}.png`))) {
      console.log(`${a.key ?? a.raw}: missing raw/${a.raw}.png, skipped`);
      continue;
    }
    if (a.kind === 'nineSlice') {
      const r = processFrame(a);
      writePng(join(OUT, 'debug', `${a.key}-snapped.png`), r.debug);
      for (const f of r.files)
        manifest.push({ key: f.key, file: `out/${f.key}.png`, kind: 'nineSlice', w: f.img.w, h: f.img.h, insets: r.insets, border: r.border, suggestedUse: f.use, raw: `raw/${a.raw}.png`, colors: r.colors, keying: r.keying });
      console.log(`${a.key}: snapped ${r.snapped.w}x${r.snapped.h} -> ${r.files[0].img.w}x${r.files[0].img.h} insets ${JSON.stringify(r.insets)} border ${JSON.stringify(r.border)} interior ${r.interior} colors ${r.colors}`);
    } else if (a.kind === 'iconSheet') {
      const r = processIconSheet(a);
      for (const o of r.out) {
        const img = render(o.grid, o.pal, o.v.scale ?? 1);
        writePng(join(OUT, `${o.key}.png`), img);
        icons.set(o.key, o);
        manifest.push({ key: o.key, file: `out/${o.key}.png`, kind: o.v.kind ?? 'icon', w: img.w, h: img.h, suggestedUse: o.v.use, replaces: o.v.replaces, raw: `raw/${a.raw}.png`, colors: new Set(o.grid.flat().filter((c) => c >= 0)).size });
      }
      console.log(`${a.raw}: ${r.boxes.length} icons -> ${r.out.map((o) => `${o.key} ${o.grid[0].length}x${o.grid.length}`).join(', ')}`);
    } else if (a.kind === 'image') {
      const r = processImage(a);
      const img = render(r.grid, r.pal, a.scale);
      writePng(join(OUT, `${a.key}.png`), img);
      manifest.push({ key: a.key, file: `out/${a.key}.png`, kind: 'image', w: img.w, h: img.h, suggestedUse: a.use, raw: `raw/${a.raw}.png`, colors: r.pal.length, crop: r.box });
      console.log(`${a.key}: crop ${JSON.stringify(r.box)} -> ${img.w}x${img.h}`);
    }
  }
  for (const a of ASSETS.filter((x) => x.kind === 'derivedIcon')) {
    const src = icons.get(a.from);
    if (!src) continue;
    const d = deriveIcon(src, { ...a, kind: a.kind2 });
    const img = render(d.grid, d.pal, 1);
    writePng(join(OUT, `${a.key}.png`), img);
    manifest.push({ key: a.key, file: `out/${a.key}.png`, kind: 'icon', w: img.w, h: img.h, suggestedUse: a.use, replaces: a.replaces, derivedFrom: a.from });
  }
  writeFileSync(join(DIR, 'manifest.json'), JSON.stringify({ world: [480, 640], notes: NOTES, assets: manifest }, null, 2) + '\n');
  writeFileSync(join(OUT, 'debug', 'manifest-keys.txt'), manifest.map((m) => m.key).join('\n') + '\n');
  writePng(join(DIR, 'sheets', 'stretch.png'), stretchSheet(manifest.filter((m) => m.kind === 'nineSlice')));
}

// Each frame at every real size it is used at (from layout.json), on the game's navy, shown at x2.
const SIZES = { perkCard: [[440, 116]], itemCard: [[440, 116]], panel: [[440, 124], [400, 164], [480, 84]], hudBar: [[480, 36]], button: [[200, 40]], buttonAccent: [[200, 40]], chip: [[60, 16], [112, 16]] };
function stretchSheet(frames) {
  const Z = 2;
  const rows = frames.map((m) => {
    const base = Object.keys(SIZES).filter((k) => m.key.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    const img = readPng(join(DIR, m.file));
    return (SIZES[base] ?? [[200, 60]]).map(([w, h]) => nineSlice(img, m.insets, w, h));
  });
  const W = Math.max(...rows.map((r) => r.reduce((a, i) => a + i.w * Z + 16, 16)));
  const H = rows.reduce((a, r) => a + Math.max(...r.map((i) => i.h)) * Z + 16, 16);
  const sheet = blank(W, H);
  for (let p = 0; p < W * H; p++) sheet.data.set([10, 15, 46, 255], p * 4);
  let y = 16;
  for (const r of rows) {
    let x = 16;
    for (const im of r) {
      for (let j = 0; j < im.h * Z; j++)
        for (let i = 0; i < im.w * Z; i++) {
          const s = (((j / Z) | 0) * im.w + ((i / Z) | 0)) * 4;
          const a = im.data[s + 3] / 255;
          const d = ((y + j) * W + x + i) * 4;
          for (let c = 0; c < 3; c++) sheet.data[d + c] = Math.round(im.data[s + c] * a + sheet.data[d + c] * (1 - a));
        }
      x += im.w * Z + 16;
    }
    y += Math.max(...r.map((i) => i.h)) * Z + 16;
  }
  return sheet;
}

const NOTES = [
  'Every file is baked at display size: one texture pixel is one world unit. Load with pixelArt (nearest) filtering and never scale by a non-integer.',
  'nineSlice: scene.add.nineslice(x, y, key, undefined, width, height, insets.left, insets.right, insets.top, insets.bottom). Edges and center stretch (default tileX/tileY false); the art keeps edges uniform so stretching is lossless.',
  'Frame interiors carry the translucency the code used to set with fill alpha, so do not also set alpha on the frame.',
  'All text stays code-rendered with ui/text.ts label().',
];

main();
