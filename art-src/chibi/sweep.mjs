// Renders one character under several pipeline knob sets at 4x on navy. Usage: node sweep.mjs <key> '<json list of overrides>'
import { CHARACTERS, processCharacter, toImage, canvas, blit, text, writePng } from './pipeline.mjs';
const [key, list] = process.argv.slice(2);
const base = CHARACTERS.find((c) => c.key === key);
const variants = JSON.parse(list).map((o) => ({ ...base, ...o }));
const imgs = variants.map((c) => { const r = processCharacter(c); return toImage(r.results[1].grid, r.pal); });
const W = Math.max(...imgs.map((i) => i.w)), H = Math.max(...imgs.map((i) => i.h));
const sheet = canvas(imgs.length * (W * 4 + 20) + 20, H * 4 + 60);
imgs.forEach((img, i) => { text(sheet, JSON.stringify(JSON.parse(list)[i]).replace(/[{}"]/g, ''), 20 + i * (W * 4 + 20), 16); blit(sheet, img, 20 + i * (W * 4 + 20), 44, 4); });
writePng(`review/sweep-${key}.png`, sheet);
