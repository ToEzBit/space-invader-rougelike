// Crops the eye band out of each raw and halves it with a box filter. Usage: node pipeline.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { PNG } = createRequire(import.meta.url)('../chibi/node_modules/pngjs');
const DIR = import.meta.dirname;
const OUT = join(DIR, '../../src/assets/cutin');
// The eyes sit in this band of the 1536x1024 raws.
const BAND = { y: 430, h: 400 };
const SCALE = 2;

const read = (name) => PNG.sync.read(readFileSync(join(DIR, 'raw', `${name}.png`)));

// Red is an edit of blue, so outside the irises the two must match or the crossfade would shimmer.
const [blue, red] = [read('eyes-blue'), read('eyes-red')];
let differ = 0;
for (let i = 0; i < blue.data.length; i += 4) {
  const d = Math.abs(blue.data[i] - red.data[i]) + Math.abs(blue.data[i + 1] - red.data[i + 1]) + Math.abs(blue.data[i + 2] - red.data[i + 2]);
  if (d > 60) differ++;
}
console.log(`blue vs red: ${((100 * differ) / (blue.width * blue.height)).toFixed(1)}% of pixels differ`);

mkdirSync(OUT, { recursive: true });
for (const [name, src] of [['eyes-blue', blue], ['eyes-red', red]]) {
  const w = src.width / SCALE;
  const h = BAND.h / SCALE;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < SCALE; dy++)
          for (let dx = 0; dx < SCALE; dx++) sum += src.data[((BAND.y + y * SCALE + dy) * src.width + x * SCALE + dx) * 4 + c];
        out.data[(y * w + x) * 4 + c] = Math.round(sum / (SCALE * SCALE));
      }
  writeFileSync(join(OUT, `${name}.png`), PNG.sync.write(out));
  console.log(`wrote ${name}.png ${w}x${h}`);
}
