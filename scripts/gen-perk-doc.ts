import { writeFileSync } from 'node:fs';
import { BRANCHES, BRANCH_LABEL, PERKS, PERK_IDS, TIER_BASE_COST, describePerk, perkCost } from '../src/core/perks';
import { ITEM_IDS, ITEM_OFFER_CHANCE, ITEM_STACK_MAX, ITEMS } from '../src/core/items';
import { BOSSES, ENEMIES, STAGES } from '../src/core/stages';
import { BRANCH_AFFINITY, PRICE_RISE_PER_STAGE, tierWeights } from '../src/core/run';

const lines: string[] = ['# Perks และด่าน', '', 'ไฟล์นี้สร้างจาก `src/core/perks.ts`, `src/core/items.ts` และ `src/core/stages.ts` ด้วย `npm run docs` ห้ามแก้ไขเอง', ''];

lines.push(
  `## Perk ทั้ง ${PERK_IDS.length} แบบ`,
  '',
  `ราคาต่อเลเวล = ราคาฐานของ Tier x เลเวลที่ซื้อ (Tier 1-4: ${Object.values(TIER_BASE_COST).join(' / ')} เหรียญ)`,
  '',
  `ราคาในตารางคือราคาร้านแรก ทุกราคาขึ้น ${Math.round(PRICE_RISE_PER_STAGE * 100)}% ต่อด่านที่ผ่าน ปัดเป็นหลัก 5`,
  '',
);
for (const branch of BRANCHES) {
  lines.push(`### ${BRANCH_LABEL[branch]}`, '', '| Perk | Tier | ต้องมี | เลเวล 1 | เลเวลสูงสุด | ราคา |', '| --- | --- | --- | --- | --- | --- |');
  for (const id of PERK_IDS.filter((p) => PERKS[p].branch === branch)) {
    const p = PERKS[id];
    const costs = Array.from({ length: p.maxLevel }, (_, i) => perkCost(p, i + 1)).join(' / ');
    const req = p.requires ? PERKS[p.requires].name : '-';
    lines.push(`| **${p.name}** | ${p.tier} | ${req} | ${describePerk(p, 1)} | Lv${p.maxLevel}: ${describePerk(p, p.maxLevel)} | ${costs} |`);
  }
  lines.push('');
}

lines.push('## โอกาสออกของแต่ละ Tier ในร้านค้า', '', '| หลังจบด่าน | T1 | T2 | T3 | T4 |', '| --- | --- | --- | --- | --- |');
for (let stage = 1; stage <= 9; stage++) {
  const w = tierWeights(stage);
  lines.push(`| ${stage} | ${w[1]} | ${w[2]} | ${w[3]} | ${w[4]} |`);
}
lines.push('', `Perk ของสายที่มีอยู่แล้วอย่างน้อย 1 เลเวล มีน้ำหนัก x${BRANCH_AFFINITY} จากน้ำหนักของ Tier`, '');

lines.push(
  '## ไอเทมกดใช้',
  '',
  `ไอเทมสุ่มออกปนกับ Perk ในการ์ด 3 ใบของร้านค้า แต่ละใบมีโอกาสเป็นไอเทม ${Math.round(ITEM_OFFER_CHANCE * 100)}% (ที่เหลือเป็น Perk) ไอเทมเดียวกันไม่ออกซ้ำในการสุ่มครั้งเดียว และไม่ออกเมื่อถือครบ ${ITEM_STACK_MAX} ชิ้นแล้ว ไอเทมที่ถืออยู่ติดตัวข้ามด่าน กดปุ่มของไอเทมระหว่างต่อสู้เพื่อใช้ บัฟที่ใช้ซ้ำขณะยังทำงานอยู่จะต่อเวลาเพิ่ม บัฟหมดเมื่อจบด่าน`,
  '',
  '| ปุ่ม | ไอเทม | ผล | ราคา |',
  '| --- | --- | --- | --- |',
);
for (const id of ITEM_IDS) {
  const item = ITEMS[id];
  lines.push(`| ${item.key} | **${item.name}** | ${item.desc} | ${item.cost} |`);
}
lines.push('');

lines.push('## ด่านทั้ง 10', '', '| ด่าน | ประเภท | ศัตรู | ความเร็ว | ยิง/วิ | Gunner ยิง | HP x | รางวัล |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
STAGES.forEach((s, i) => {
  if (s.kind === 'boss') {
    const b = BOSSES[s.boss];
    const [one, two] = b.forms;
    const form = `${one.name} (HP ${b.hp}, ${one.phases.length} เฟส) แปลงร่างที่ HP ${Math.round(b.transform.atHpRatio * 100)}% เป็น ${two.name} (${two.phases.length} เฟส)`;
    lines.push(`| ${i + 1} | **BOSS** | ${form} | - | - | - | - | ${s.reward} |`);
  } else {
    const rows = s.rows.map((r) => ENEMIES[r].name).join(', ');
    lines.push(`| ${i + 1} | ${s.rows.length}x${s.cols} | ${rows} | ${s.marchSpeed} | ${s.fireRate} | ${s.gunnerFan} นัด | ${s.hpMultiplier} | ${s.reward} |`);
  }
});
lines.push('');

writeFileSync(new URL('../docs/PERKS.md', import.meta.url), lines.join('\n'));
