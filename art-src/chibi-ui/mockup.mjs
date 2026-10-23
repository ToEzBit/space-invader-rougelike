// Renders review mockups at the game's real layout (layout.json) with the real chibi sprites and the UI art in out/.
// Usage: node mockup.mjs [title shop hud end icons]   writes mockups/*.png at 480x640 x2.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { stageBackdrop } from './backdrop.mjs';

const DIR = import.meta.dirname;
const { chromium } = await import(join(DIR, '../../node_modules/playwright/index.mjs'));
const layout = JSON.parse(readFileSync(join(DIR, 'layout.json'), 'utf8'));
const manifest = existsSync(join(DIR, 'manifest.json')) ? JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) : { assets: [] };
mkdirSync(join(DIR, 'mockups'), { recursive: true });

const uri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const images = {};
const CHARACTERS = join(DIR, '../../src/assets/characters');
for (const f of readdirSync(CHARACTERS).filter((f) => f.endsWith('.png'))) images[`chibi:${f.slice(0, -4)}`] = uri(join(CHARACTERS, f));
for (const a of manifest.assets) images[a.key] = uri(join(DIR, a.file));
const bd = stageBackdrop();
const bdPng = new PNG({ width: bd.w, height: bd.h });
bd.data.copy(bdPng.data);
images.backdrop = `data:image/png;base64,${PNG.sync.write(bdPng).toString('base64')}`;
const insets = Object.fromEntries(manifest.assets.filter((a) => a.kind === 'nineSlice').map((a) => [a.key, a.insets]));

const screens = process.argv.slice(2).length ? process.argv.slice(2) : ['title', 'shop', 'hud', 'end', 'icons'];
const opts = JSON.parse(process.env.MOCK_OPTS ?? '{}');

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent('<html><body style="margin:0;background:#000"><canvas id="c"></canvas></body></html>');
for (const screen of screens) {
  const dataUrl = await page.evaluate(draw, { screen, images, insets, layout, opts });
  const out = join(DIR, 'mockups', `${screen}${opts.suffix ?? ''}.png`);
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(out);
}
await browser.close();

// Runs in Chrome. World units; the canvas is 2 device pixels per world unit.
async function draw({ screen, images, insets, layout, opts }) {
  const Z = 2;
  const c = document.getElementById('c');
  const W = screen === 'icons' ? 640 : 480;
  const H = screen === 'icons' ? 660 : 640;
  c.width = W * Z;
  c.height = H * Z;
  const g = c.getContext('2d');
  g.setTransform(Z, 0, 0, Z, 0, 0);
  g.imageSmoothingEnabled = false;
  const FONT = layout.font;
  const img = {};
  await Promise.all(
    Object.entries(images).map(
      ([k, src]) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => ((img[k] = im), res());
          im.src = src;
        }),
    ),
  );
  await document.fonts.load(`bold 16px Thonburi`, 'ทดสอบ');
  const has = (k) => !!img[k];
  const css = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const C = { ink: 0x0d0b26, white: 0xffffff, cyan: 0x46f0ff, pink: 0xff6ec7, red: 0xff3d5a, orange: 0xff9b30, yellow: 0xffe84a, gold: 0xffb31a, green: 0x5dff9b, violet: 0xa66bff, steel: 0x8a96c8, lime: 0x90ff40, cornflower: 0x7094ff };

  // ui/text.ts label(): y is the top of the text box, which carries ceil(size*0.35) of top padding.
  function label(x, y, text, { size = 14, color = '#ffffff', bold = false, align = 'left', stroke, wrap } = {}) {
    g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
    g.textBaseline = 'top';
    const lines = wrap ? wrapText(text, wrap) : [text];
    const top = y + Math.ceil(size * 0.35);
    const lh = size * 1.2 + Math.round(size * 0.15);
    let width = 0;
    lines.forEach((line, i) => {
      const w = g.measureText(line).width;
      width = Math.max(width, w);
      const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      if (stroke) {
        g.lineWidth = Math.max(2, Math.round(size / 6));
        g.strokeStyle = stroke;
        g.lineJoin = 'round';
        g.strokeText(line, lx, top + i * lh);
      }
      g.fillStyle = color;
      g.fillText(line, lx, top + i * lh);
    });
    return { width };
  }
  function wrapText(text, max) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width > max && cur) lines.push(cur), (cur = w);
      else cur = next;
    }
    lines.push(cur);
    return lines;
  }
  function sprite(key, cx, cy, scale = 1, alpha = 1) {
    const im = img[key];
    if (!im) return;
    g.globalAlpha = alpha;
    const w = im.width * scale;
    const h = im.height * scale;
    g.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    g.globalAlpha = 1;
  }
  // Phaser NineSlice: corners fixed, edges and center stretched.
  function nine(key, x, y, w, h) {
    const im = img[key];
    const s = insets[key];
    if (!im || !s) return false;
    const { left: L, right: R, top: T, bottom: B } = s;
    const sx = [0, L, im.width - R, im.width];
    const sy = [0, T, im.height - B, im.height];
    const dx = [x, x + L, x + w - R, x + w];
    const dy = [y, y + T, y + h - B, y + h];
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 3; i++) {
        const sw = sx[i + 1] - sx[i];
        const sh = sy[j + 1] - sy[j];
        const dw = dx[i + 1] - dx[i];
        const dh = dy[j + 1] - dy[j];
        if (sw > 0 && sh > 0 && dw > 0 && dh > 0) g.drawImage(im, sx[i], sy[j], sw, sh, dx[i], dy[j], dw, dh);
      }
    return true;
  }
  function rrect(x, y, w, h, r, fill, stroke, lw = 2) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    if (fill) (g.fillStyle = fill), g.fill();
    if (stroke) (g.lineWidth = lw), (g.strokeStyle = stroke), g.stroke();
  }
  const rgba = (n, a) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

  function backdrop() {
    if (opts.keyArt && img.titleBg && screen === 'title') g.drawImage(img.titleBg, 0, 0, 480, 640), sprite('titleScene', 240, 312);
    else g.drawImage(img.backdrop, 0, 0, 480, 640);
  }

  const L = layout;
  const BRANCH = { rapid: { color: C.orange, icon: 'iconRapid', frame: (opts.perk ?? 'perkCard') + 'Rapid' }, laser: { color: C.cyan, icon: 'iconLaser', frame: (opts.perk ?? 'perkCard') + 'Laser' }, ram: { color: C.pink, icon: 'iconRam', frame: opts.perk ?? 'perkCard' }, graze: { color: C.lime, icon: 'iconGraze', frame: 'perkCardGraze' }, summon: { color: C.cornflower, icon: 'iconSummon', frame: 'perkCardSummon' } };
  const ITEM = { repairKit: { color: C.green, icon: 'itemRepairKit' }, nitro: { color: C.violet, icon: 'itemNitro' }, powerCell: { color: C.red, icon: 'itemPowerCell' }, overclock: { color: C.yellow, icon: 'itemOverclock' }, barrierCapsule: { color: C.cyan, icon: 'itemBarrier' } };
  const iconKey = (k, small) => (small && has(`${k}Small`) ? `${k}Small` : k);

  function perkCard(slot, p) {
    const { x, w, h, top: t0, gap } = L.shop.card;
    const top = t0 + slot * (h + gap);
    const look = BRANCH[p.branch];
    if (!nine(look.frame, x, top, w, h)) rrect(x, top, w, h, 10, 'rgba(13,11,38,.92)', css(look.color));
    const b = insets[look.frame] ? Math.min(insets[look.frame].top - 3, 8) : 0;
    g.fillStyle = rgba(look.color, 0.16);
    g.fillRect(x + b + 1, top + b + 1, 52 - b, h - 2 * b - 2);
    g.fillStyle = rgba(look.color, 0.55);
    g.fillRect(x + 52, top + b + 1, 1, h - 2 * b - 2);
    sprite(iconKey(look.icon, true), x + 26, top + 36);
    label(x + 26, top + 66, `T${p.tier}`, { size: 15, bold: true, color: css(look.color), align: 'center', stroke: '#0d0b26' });
    const tx = x + 66;
    const name = label(tx, top + 6, p.name, { size: 17, bold: true, color: css(look.color) });
    label(tx + name.width + 10, top + 10, p.level ? `Lv ${p.level} → ${p.level + 1}` : 'NEW · Lv 1', { size: 12, bold: true, color: p.level ? '#ffffff' : css(C.green) });
    label(tx, top + 30, p.branchLabel, { size: 11, color: '#8a96c8' });
    label(tx, top + 50, p.desc, { size: 13, wrap: w - 66 - 96 });
    price(x, top, w, h, p.cost, p.affordable);
    label(x + w - 14, top + 8, `[${slot + 1}]`, { size: 12, bold: true, color: '#8a96c8', align: 'right' });
  }
  function price(x, top, w, h, cost, ok) {
    sprite(has('coinLarge') ? 'coinLarge' : 'coin0', x + w - 22, top + h - 24);
    label(x + w - 36, top + h - 38, String(cost), { size: 20, bold: true, color: css(ok ? C.yellow : C.red), align: 'right' });
    if (!ok) label(x + w - 14, top + h - 56, 'เงินไม่พอ', { size: 11, color: css(C.red), align: 'right' });
  }
  function itemCard(slot, it) {
    const { x, w, h, top: t0, gap } = L.shop.card;
    const top = t0 + slot * (h + gap);
    const look = ITEM[it.id];
    if (!nine('itemCard', x, top, w, h)) rrect(x, top, w, h, 10, 'rgba(31,22,6,.94)', css(C.gold));
    const wx = x + 36;
    const wy = top + h / 2 + 4;
    g.fillStyle = rgba(C.ink, 0.9);
    g.beginPath(), g.arc(wx, wy, 25, 0, 7), g.fill();
    g.fillStyle = rgba(look.color, 0.3);
    g.beginPath(), g.arc(wx, wy, 22, 0, 7), g.fill();
    g.strokeStyle = css(look.color);
    g.lineWidth = 2;
    g.beginPath(), g.arc(wx, wy, 22, 0, 7), g.stroke();
    sprite(look.icon, wx, wy);
    if (opts.ribbon) {
      g.fillStyle = css(C.gold);
      g.beginPath(), g.moveTo(x + 2, top + 26), g.lineTo(x + 26, top + 2), g.lineTo(x + 46, top + 2), g.lineTo(x + 2, top + 46), g.closePath(), g.fill();
      g.save(), g.translate(x + 18, top + 18), g.rotate(-Math.PI / 4);
      label(0, -9, 'ITEM', { size: 10, bold: true, color: '#0d0b26', align: 'center' });
      g.restore();
    }
    const tx = x + 76;
    const name = label(tx, top + 6, it.name, { size: 17, bold: true, color: css(C.gold) });
    label(tx + name.width + 10, top + 10, `ถืออยู่ ${it.held}/3`, { size: 12, bold: true, color: it.held ? '#ffffff' : css(C.green) });
    label(tx, top + 30, `ไอเทมกดใช้ · ปุ่ม ${it.key} ระหว่างด่าน`, { size: 11, color: '#c9a86a' });
    label(tx, top + 50, it.desc, { size: 13, wrap: w - 76 - 96 });
    price(x, top, w, h, it.cost, it.affordable);
    label(x + w - 14, top + 8, `[${slot + 1}]`, { size: 12, bold: true, color: '#8a96c8', align: 'right' });
  }
  function button(cx, text, key, fallback) {
    const [w, h] = L.shop.buttons.size;
    const y = L.shop.buttons.y;
    if (!nine(key, cx - w / 2, y - h / 2, w, h)) rrect(cx - w / 2, y - h / 2, w, h, 8, rgba(fallback, 0.25), css(fallback));
    label(cx, y - 12, text, { size: 15, bold: true, align: 'center', stroke: opts.buttonStroke ? '#0d0b26' : undefined });
  }
  function hearts(x0, y, hp, max) {
    for (let i = 0; i < max; i++) {
      const k = i < hp ? 'heart' : 'heartEmpty';
      if (has(k)) sprite(k, x0 + i * 18, y);
      else (g.fillStyle = i < hp ? css(C.red) : '#2a2650'), g.fillRect(x0 + i * 18 - 7, y - 7, 14, 14);
    }
  }
  function coin(cx, cy) {
    if (has('coin0')) sprite('coin0', cx, cy);
    else (g.fillStyle = css(C.yellow)), g.fillRect(cx - 5, cy - 7, 10, 14);
  }
  function panel(x, y, w, h, key = 'panel') {
    if (!nine(key, x, y, w, h)) rrect(x, y, w, h, 10, 'rgba(13,11,38,.82)', 'rgba(166,107,255,.9)');
  }
  function chip(x, y, text, color) {
    g.font = `bold 10px ${FONT}`;
    const w = g.measureText(text).width + 10;
    const key = opts.chipKey ? opts.chipKey(color) : chipFrame(color);
    if (!nine(key, x, y + 2, w, 16)) (g.fillStyle = rgba(color, 0.15)), g.fillRect(x, y + 2, w, 16), (g.strokeStyle = rgba(color, 0.7)), (g.lineWidth = 1), g.strokeRect(x + 0.5, y + 2.5, w - 1, 15);
    label(x + 5, y, text, { size: 10, bold: true, color: css(color) });
    return w;
  }
  function chipFrame(color) {
    return { [C.orange]: 'chipRapid', [C.cyan]: 'chipLaser', [C.pink]: 'chipRam', [C.lime]: 'chipGraze', [C.cornflower]: 'chipSummon', [C.gold]: 'chipGold' }[color] ?? 'chip';
  }

  function slot(x, y, def, state) {
    const r = 22;
    g.fillStyle = rgba(C.ink, 0.85), g.beginPath(), g.arc(x, y, r + 2, 0, 7), g.fill();
    g.fillStyle = '#1b1840', g.beginPath(), g.arc(x, y, r - 1, 0, 7), g.fill();
    g.fillStyle = rgba(def.color, 0.3), g.beginPath(), g.arc(x, y, r - 1, 0, 7), g.fill();
    sprite(def.icon, x, y, 1, state.kind === 'cooling' || state.count === 0 ? 0.55 : 1);
    const a0 = -Math.PI / 2;
    if (state.kind === 'cooling') {
      const edge = a0 + state.progress * Math.PI * 2;
      g.fillStyle = 'rgba(5,4,15,.8)', g.beginPath(), g.moveTo(x, y), g.arc(x, y, r - 1, edge, a0 + Math.PI * 2), g.closePath(), g.fill();
      g.lineWidth = 2, g.strokeStyle = '#3a3566', g.beginPath(), g.arc(x, y, r, 0, 7), g.stroke();
      g.strokeStyle = rgba(def.color, 0.9), g.beginPath(), g.arc(x, y, r, a0, edge), g.stroke();
      label(x, y - 9 - 6, state.text, { size: 15, bold: true, align: 'center', stroke: '#0d0b26' });
    } else {
      g.lineWidth = 2, g.strokeStyle = css(def.color), g.beginPath(), g.arc(x, y, r, 0, 7), g.stroke();
    }
    label(x, y + r - 4 - 3, def.hint, { size: 8, bold: true, color: css(def.color), align: 'center', stroke: '#0d0b26' });
    if (state.count !== undefined) label(x + r + 4, y - r - 4, `x${state.count}`, { size: 11, bold: true, align: 'right', stroke: '#0d0b26', color: state.count ? '#fff' : css(C.red) });
  }

  if (screen === 'shop') {
    backdrop();
    label(240, 12, 'UPGRADE SHOP', { size: 26, bold: true, color: css(C.yellow), align: 'center', stroke: '#5a22b0' });
    label(240, 54, 'ร้านอัปเกรด · ผ่านด่าน 2 แล้ว', { size: 13, color: '#e3c6ff', align: 'center' });
    if (opts.perks) opts.perks.forEach((p, i) => perkCard(i, p));
    else {
      perkCard(0, { branch: 'rapid', tier: 1, name: 'Hair Trigger', level: 0, branchLabel: 'Bullet Storm · สายยิงรัว', desc: 'ยิงเร็วขึ้น ช่วงห่างกระสุนเหลือ 85%', cost: 20, affordable: true });
      perkCard(1, { branch: 'laser', tier: 1, name: 'Prism Lance', level: 1, branchLabel: 'Prism Lance · สายเลเซอร์', desc: 'ปลดล็อกเลเซอร์ ยิงลำแสงทะลุทั้งแนวอัตโนมัติ ทุก 3.4 วิ', cost: 30, affordable: true });
      itemCard(2, { id: 'repairKit', name: 'Repair Kit', held: 1, key: 1, desc: 'ซ่อมยาน ฟื้น 1 HP (ใช้ไม่ได้ตอน HP เต็ม)', cost: 25, affordable: false });
    }
    button(130, 'R · รีเฟรช  5', 'button', C.violet);
    button(350, 'ENTER · ไปต่อ ▶', 'buttonAccent', C.green);
    const [px, py, pw, ph] = L.shop.status.rect;
    panel(px, py, pw, ph);
    hearts(38, py + 18, 3, 4);
    sprite(has('coinLarge') ? 'coinLarge' : 'coin0', 440, py + 18);
    label(426, py + 7, '23', { size: 17, bold: true, color: css(C.yellow), align: 'right' });
    let cx = 34;
    let cy = py + 36;
    const owned = opts.chips?.map(([t, col]) => [t, C[col]]) ?? [['Heavy Caliber 2', C.orange], ['Twin Cannons 1', C.orange], ['Prism Lance 1', C.cyan], ['Reinforced Hull 1', C.pink], ['Afterburner Dash 1', C.pink], ['Repair Kit x1', C.gold], ['Nitro x2', C.gold]];
    for (const [t, col] of owned) {
      g.font = `bold 10px ${FONT}`;
      const w = g.measureText(t).width + 10;
      if (cx + w > 450) (cx = 34), (cy += 18);
      chip(cx, cy, t, col);
      cx += w + 4;
    }
  }

  if (screen === 'hud') {
    backdrop();
    const rows = ['gunner', 'drone', 'drone'];
    const ox = (480 - 7 * 36) / 2;
    rows.forEach((k, r) => {
      for (let col = 0; col < 8; col++) if (!(r === 2 && col === 5)) sprite(`chibi:${k}`, ox + col * 36 + 10, 96 + 40 + r * 30);
    });
    sprite('chibi:diver', 300, 330);
    const fx = ox + 3 * 36 + 10;
    g.fillStyle = 'rgba(13,11,38,.9)', g.fillRect(fx - 16, 96 + 40 - 13 - 6 - 1, 32, 5);
    g.fillStyle = '#2a2650', g.fillRect(fx - 15, 96 + 40 - 19, 30, 3);
    g.fillStyle = css(C.yellow), g.fillRect(fx - 15, 96 + 40 - 19, 15, 3);
    for (const [x, y] of [[240, 520], [240, 488], [228, 456]]) (g.fillStyle = '#46f0ff'), g.fillRect(x - 1, y - 5, 3, 10);
    for (const [x, y] of [[170, 300], [330, 260]]) (g.fillStyle = '#ff6ec7'), g.beginPath(), g.arc(x, y, 3, 0, 7), g.fill();
    sprite('chibi:player', 240, 572);
    sprite('chibi:optionDrone', 204, 580), sprite('chibi:optionDrone', 276, 580);
    for (const [x, y] of opts.familiars ?? []) sprite('chibi:familiar', x, y);
    const bar = L.hud.topBar.rect;
    if (!nine('hudBar', -2, -2, bar[2] + 4, bar[3] + 4)) {
      g.fillStyle = 'rgba(13,11,38,.72)', g.fillRect(0, 0, 480, 34);
      g.fillStyle = 'rgba(166,107,255,.6)', g.fillRect(0, 34, 480, 2);
    }
    label(240, 7, 'STAGE 2/10', { size: 14, bold: true, color: css(C.yellow), align: 'center' });
    hearts(16, 17, 2, 3);
    coin(452, 16);
    label(438, 7, '47', { size: 14, bold: true, align: 'right' });
    const t = L.hud.tray;
    const skills = opts.skills?.map(([icon, col, hint]) => ({ icon, color: C[col], hint })) ?? [{ icon: 'iconRam', color: C.pink, hint: 'SHIFT' }, { icon: 'iconLaser', color: C.cyan, hint: 'AUTO' }, { icon: 'iconOrbital', color: C.yellow, hint: 'AUTO' }];
    skills.forEach((def, i) => slot(t.skillX0 + i * t.gap, t.y, def, i === 0 ? { kind: 'cooling', progress: 0.6, text: '1.8' } : { kind: 'ready' }));
    slot(t.itemRight - t.gap, t.y, { icon: 'itemRepairKit', color: C.green, hint: '1' }, { kind: 'ready', count: 1 });
    slot(t.itemRight, t.y, { icon: 'itemNitro', color: C.violet, hint: '2' }, { kind: 'ready', count: 0 });
  }

  if (screen === 'title') {
    backdrop();
    const lg = L.title.logo;
    if (opts.logo === 'image' && has('logo')) sprite('logo', 240, 100);
    else {
      if (opts.logo === 'plate' && has('logoPlate')) sprite('logoPlate', 240, 96);
      label(240, lg.line1[1], 'SPACE INVADER', { size: 40, bold: true, color: css(C.cyan), align: 'center', stroke: '#1c2f8f' });
      label(240, lg.line2[1], 'ROGUELIKE', { size: 30, bold: true, color: css(C.pink), align: 'center', stroke: '#5a22b0' });
    }
    label(240, 196, 'ปกป้องกาแล็กซีจากกองทัพสาวต่างดาว · อัปเกรดแบบโร้กไลก์', { size: 13, color: '#e3c6ff', align: 'center', stroke: opts.keyArt ? '#0d0b26' : undefined });
    if (!opts.keyArt) {
      const kinds = [['drone', 'Pico Drone'], ['gunner', 'Gunner Girl'], ['tank', 'Bulwark'], ['diver', 'Kamikaze Kitsune']];
      kinds.forEach(([k, n], i) => {
        const x = 240 + (i - 1.5) * 96;
        sprite(`chibi:${k}`, x, 252, 2);
        label(x, 282, n, { size: 11, color: '#c9d4ff', align: 'center' });
      });
      sprite('chibi:player', 240, 350, 2);
    }
    const [cx0, cy0, cw, ch] = L.title.controls.rect;
    panel(cx0, cy0, cw, ch);
    label(240, 418, 'CONTROLS · การควบคุม', { size: 13, bold: true, color: css(C.yellow), align: 'center' });
    const rowsC = [['← → ↑ ↓ / W A S D', 'เคลื่อนที่'], ['AUTO', 'ยิงอัตโนมัติ · เลเซอร์ยิงเองเมื่อปลดล็อก'], ['SHIFT', 'พุ่งชนทะลุฝูงศัตรู (เมื่อปลดล็อก)'], ['1 2 3 4 5', 'ใช้ไอเทมที่ซื้อจากร้านค้า ระหว่างด่าน'], ['1 2 3 / R / ENTER', 'ซื้อ · รีเฟรช · ไปต่อ ในร้านค้า'], ['F', 'เต็มจอ / ออกจากเต็มจอ']];
    rowsC.forEach(([k, w], i) => {
      label(60, 444 + i * 20, k, { size: 13, bold: true, color: css(C.cyan) });
      label(196, 444 + i * 20, w, { size: 13 });
    });
    label(240, 590, 'PRESS ENTER หรือคลิกเพื่อเริ่ม', { size: 18, bold: true, align: 'center', stroke: '#d81b8c' });
    label(468, 10, 'F · เต็มจอ', { size: 12, bold: true, color: '#c9d4ff', align: 'right', stroke: opts.keyArt ? '#0d0b26' : undefined });
  }

  if (screen === 'end') {
    const lose = !!opts.defeat;
    backdrop();
    const art = lose ? 'defeatArt' : 'victoryArt';
    if (has(art)) sprite(art, 240, 272);
    else if (lose) sprite('chibi:gunner', 240, 236, 2);
    else sprite('chibi:voidEmpress', 240, 240, 1, 0.5), sprite('chibi:player', 240, 330, 2);
    label(240, 70, lose ? 'GAME OVER' : 'VICTORY!', { size: 48, bold: true, color: css(lose ? C.red : C.yellow), align: 'center', stroke: '#0d0b26' });
    label(240, 146, lose ? 'ยานของคุณถูกทำลาย...' : 'คุณปกป้องกาแล็กซีได้สำเร็จ!', { size: 16, align: 'center', stroke: '#0d0b26' });
    panel(40, 380, 400, 112);
    [`ด่านที่ไปถึง  ${lose ? 4 : 10}/10`, `เหรียญคงเหลือ  ${lose ? 12 : 87}`].forEach((t, i) => label(240, 392 + i * 26, t, { size: 16, bold: true, color: '#e3c6ff', align: 'center' }));
    label(240, 452, lose ? 'Heavy Caliber 1 · Afterburner Dash 1' : 'Heavy Caliber 3 · Twin Cannons 2 · Prism Lance 2 · Orbital Cannon 1 · Reinforced Hull 2', { size: 12, color: '#c9d4ff', align: 'center', wrap: 360 });
    label(240, 572, 'ENTER หรือคลิก · เล่นอีกครั้ง', { size: 18, bold: true, align: 'center', stroke: '#d81b8c' });
  }

  if (screen === 'icons') {
    g.fillStyle = '#0a0f2e', g.fillRect(0, 0, W, H);
    const keys = opts.iconKeys ?? [];
    label(12, 4, 'ICONS · 1x (in-game size) and 4x', { size: 12, bold: true, color: '#c9d4ff' });
    keys.forEach((k, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 12 + col * 156;
      const y = 28 + row * 158;
      const im = img[k];
      if (!im) return;
      g.drawImage(im, x, y + 8);
      g.drawImage(im, x + 40, y + 8, im.width * 4, im.height * 4);
      label(x, y + 124, `${k} ${im.width}x${im.height}`, { size: 10, bold: true, color: '#e3c6ff' });
    });
  }
  return c.toDataURL('image/png');
}
