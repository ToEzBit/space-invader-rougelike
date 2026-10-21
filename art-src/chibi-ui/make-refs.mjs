// Builds the -i reference images: the shipped chibi cast at x6 nearest on navy, and a copy of the chibi style sheet.
import { PNG } from 'pngjs';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
const CHARACTERS = join(DIR, '../../src/assets/characters');
const K = 6;
const cast = ['player', 'optionDrone', 'drone', 'gunner', 'tank', 'diver', 'crimsonSeraph', 'voidEmpress'];
const imgs = cast.map((k) => PNG.sync.read(readFileSync(join(CHARACTERS, `${k}.png`))));
const small = imgs.slice(0, 6);
const big = imgs.slice(6);
const rowW = (list) => list.reduce((a, i) => a + i.width * K + 24, 24);
const W = Math.max(rowW(small), rowW(big));
const H = 24 + Math.max(...small.map((i) => i.height)) * K + 24 + Math.max(...big.map((i) => i.height)) * K + 24;
const o = new PNG({ width: W, height: H });
for (let p = 0; p < W * H; p++) o.data.set([10, 15, 46, 255], p * 4);
function put(im, x0, y0) {
  for (let y = 0; y < im.height * K; y++)
    for (let x = 0; x < im.width * K; x++) {
      const si = (((y / K) | 0) * im.width + ((x / K) | 0)) * 4;
      if (!im.data[si + 3]) continue;
      o.data.set([im.data[si], im.data[si + 1], im.data[si + 2], 255], ((y0 + y) * W + x0 + x) * 4);
    }
}
let x = 24;
for (const im of small) put(im, x, 24), (x += im.width * K + 24);
const y2 = 48 + Math.max(...small.map((i) => i.height)) * K;
x = 24;
for (const im of big) put(im, x, y2), (x += im.width * K + 24);
writeFileSync(join(DIR, 'ref/cast.png'), PNG.sync.write(o));
copyFileSync(join(DIR, '../chibi/ref/sheet.png'), join(DIR, 'ref/style.png'));
console.log('ref/cast.png', W, H);
