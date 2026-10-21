import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [src, dst, s, bg] = process.argv.slice(2);
const p = PNG.sync.read(readFileSync(src)); const k = +s;
const o = new PNG({ width: p.width * k, height: p.height * k });
const col = bg ? bg.split(',').map(Number) : null;
for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
  const si = (((y / k) | 0) * p.width + ((x / k) | 0)) * 4, di = (y * o.width + x) * 4;
  if (col && p.data[si + 3] < 128) { o.data.set([...col, 255], di); continue; }
  for (let c = 0; c < 4; c++) o.data[di + c] = p.data[si + c];
}
writeFileSync(dst, PNG.sync.write(o));
