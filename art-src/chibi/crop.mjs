import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [src, dst, x0, y0, w, h, s = 1] = process.argv.slice(2).map((v, i) => (i < 2 ? v : +v));
const p = PNG.sync.read(readFileSync(src));
const o = new PNG({ width: w * s, height: h * s });
for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
  const si = ((y0 + ((y / s) | 0)) * p.width + x0 + ((x / s) | 0)) * 4, di = (y * o.width + x) * 4;
  for (let c = 0; c < 4; c++) o.data[di + c] = p.data[si + c];
}
writeFileSync(dst, PNG.sync.write(o));
