// Review helper: node inspect.mjs raw/x.png  prints the keyed trim box and the generator's pixel pitch estimate.
import { readPng, keyOut, keepMainParts, dist } from './pixel.mjs';

const k = keyOut(readPng(process.argv[2]));
const box = keepMainParts(k);
console.log('raw', k.w, k.h, 'bg', k.bg, 'trim', box);
// Distances between color steps along rows and columns inside the trim; a pixel-art grid shows peaks at its pitch.
const hist = new Map();
const px = (x, y) => [k.rgb[(y * k.w + x) * 3], k.rgb[(y * k.w + x) * 3 + 1], k.rgb[(y * k.w + x) * 3 + 2]];
for (let y = box.y; y < box.y + box.h; y += 7) {
  let last = box.x;
  for (let x = box.x + 1; x < box.x + box.w; x++)
    if (dist(px(x, y), px(x - 1, y)) > 40) {
      const d = x - last;
      if (d > 1 && d < 40) hist.set(d, (hist.get(d) ?? 0) + 1);
      last = x;
    }
}
console.log('step histogram (top):', [...hist].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `${d}:${n}`).join(' '));
