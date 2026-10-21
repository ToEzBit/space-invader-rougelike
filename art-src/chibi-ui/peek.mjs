// Review helper: node peek.mjs out.png scale in1.png [in2.png ...] stacks raws vertically, nearest-downscaled.
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [out, s, ...ins] = process.argv.slice(2);
const k = +s;
const ims = ins.map((f) => PNG.sync.read(readFileSync(f)));
const W = Math.max(...ims.map((i) => Math.round(i.width * k)));
const H = ims.reduce((a, i) => a + Math.round(i.height * k) + 8, 0);
const o = new PNG({ width: W, height: H });
let y0 = 0;
for (const im of ims) {
  const w = Math.round(im.width * k);
  const h = Math.round(im.height * k);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = (Math.floor(y / k) * im.width + Math.floor(x / k)) * 4;
      const di = ((y + y0) * W + x) * 4;
      for (let c = 0; c < 4; c++) o.data[di + c] = im.data[si + c];
    }
  y0 += h + 8;
}
writeFileSync(out, PNG.sync.write(o));
