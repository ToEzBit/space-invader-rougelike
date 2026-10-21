// Renders every sprite grid into one PNG sheet so pixel art can be reviewed without the browser.
// Usage: npm run art -- <out.png> [scale] [key...]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../src/art/palette';
import { SPRITES, type SpriteKey } from '../src/art/sprites';

const [out = 'art-preview.png', scaleArg = '6', ...only] = process.argv.slice(2);
const scale = Number(scaleArg);
const keys = (only.length ? only : Object.keys(SPRITES)) as SpriteKey[];
const pad = 4;
const bg = [0x07, 0x06, 0x1a];

const cells = keys.map((key) => ({ key, grid: SPRITES[key] }));
const width = cells.reduce((w, c) => w + (c.grid[0]!.length * scale + pad * 2), 0);
const height = Math.max(...cells.map((c) => c.grid.length * scale)) + pad * 2;
const rgb = new Uint8Array(width * height * 3);
for (let i = 0; i < width * height; i++) rgb.set(bg, i * 3);

let x0 = 0;
for (const { key, grid } of cells) {
  const w = grid[0]!.length;
  console.log(`${key} ${w}x${grid.length} at x=${x0}`);
  grid.forEach((row, y) => {
    if (row.length !== w) console.log(`  ! ${key} row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const hex = PALETTE[ch];
      if (!hex) return console.log(`  ! ${key} unknown char '${ch}'`);
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) rgb.set(c, ((pad + y * scale + dy) * width + x0 + pad + x * scale + dx) * 3);
    });
  });
  x0 += w * scale + pad * 2;
}

const raw = new Uint8Array(height * (width * 3 + 1));
for (let y = 0; y < height; y++) raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr.set([8, 2, 0, 0, 0], 8);
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]),
);
console.log(`wrote ${out} (${width}x${height})`);
