// The game's backdrop approximation from ../chibi/pipeline.mjs (nebula gradient, glows, seeded stars).
import { blank } from './pixel.mjs';
function fillRect(img, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++)
      if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.data.set(color, (y * img.w + x) * 4);
}
// The game's backdrop: nebula gradient, three soft glows and the seeded star layers.
export function stageBackdrop() {
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
