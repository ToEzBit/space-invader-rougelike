import { CHARACTERS, processCharacter, toImage, canvas, blit, writePng } from './pipeline.mjs';
const base = CHARACTERS.find((c) => c.key === 'crimsonSeraphAscended');
const sheet = canvas(JSON.parse(process.argv[2]).length * (40 * 8 + 20) + 20, 36 * 8 + 40);
JSON.parse(process.argv[2]).forEach((o, i) => {
  const r = processCharacter({ ...base, ...o });
  const img = toImage(r.results[1].grid, r.pal);
  const crop = { w: 40, h: 36, data: Buffer.alloc(40 * 36 * 4) };
  for (let y = 0; y < 36; y++) img.data.copy(crop.data, y * 160, ((y + 8) * img.w + 45) * 4, ((y + 8) * img.w + 85) * 4);
  blit(sheet, crop, 20 + i * 340, 20, 8);
});
writePng('review/face-seraph.png', sheet);
