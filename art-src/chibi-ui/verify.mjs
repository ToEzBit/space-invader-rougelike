// Proofs: the pipeline is byte-deterministic, every raw and output is distinct, every manifest file exists at its stated size,
// and every PNG the game ships in src/assets/ui is byte-identical to its fresh output. Usage: node verify.mjs
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const DIR = import.meta.dirname;
const SHIPPED = join(DIR, '../../src/assets/ui');
const md5 = (f) => createHash('md5').update(readFileSync(f)).digest('hex');
const snapshot = () => {
  const files = ['manifest.json', ...readdirSync(join(DIR, 'out')).filter((f) => f.endsWith('.png')).map((f) => `out/${f}`)];
  return new Map(files.map((f) => [f, md5(join(DIR, f))]));
};
const run = () => execFileSync('node', [join(DIR, 'pipeline.mjs')], { cwd: DIR, stdio: 'pipe' });
let failures = 0;
const check = (ok, msg) => (console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`), ok || failures++);

run();
const a = snapshot();
run();
const b = snapshot();
const changed = [...a].filter(([f, h]) => b.get(f) !== h).map(([f]) => f);
check(changed.length === 0 && a.size === b.size, `pipeline deterministic across two runs (${a.size} files)${changed.length ? `: ${changed.join(', ')}` : ''}`);

const groups = (m) => [...m].reduce((acc, [f, h]) => acc.set(h, [...(acc.get(h) ?? []), f]), new Map());
const outDupes = [...groups(new Map([...b].filter(([f]) => f.startsWith('out/'))))].filter(([, fs]) => fs.length > 1);
check(outDupes.length === 0, `all ${[...b.keys()].filter((f) => f.startsWith('out/')).length} outputs distinct by md5${outDupes.length ? `: ${JSON.stringify(outDupes)}` : ''}`);
const raws = new Map(readdirSync(join(DIR, 'raw')).filter((f) => f.endsWith('.png')).map((f) => [f, md5(join(DIR, 'raw', f))]));
const rawDupes = [...groups(raws)].filter(([, fs]) => fs.length > 1);
check(rawDupes.length === 0, `all ${raws.size} raws distinct by md5`);

const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
const bad = manifest.assets.filter((m) => {
  const p = PNG.sync.read(readFileSync(join(DIR, m.file)));
  if (p.width !== m.w || p.height !== m.h) return true;
  if (m.kind !== 'nineSlice') return false;
  const { left, right, top, bottom } = m.insets;
  return left + right >= m.w || top + bottom >= m.h;
});
check(bad.length === 0, `manifest sizes match files and 9-slice insets leave a center (${manifest.assets.length} assets)${bad.length ? `: ${bad.map((m) => m.key)}` : ''}`);
const chip = manifest.assets.find((m) => m.key === 'chip');
check(!chip || chip.insets.top + chip.insets.bottom < 16, 'chip insets fit its 16-unit height');

const shipped = readdirSync(SHIPPED).filter((f) => f.endsWith('.png'));
const differ = shipped.filter((f) => b.get(`out/${f}`) !== md5(join(SHIPPED, f)));
check(differ.length === 0, `all ${shipped.length} PNGs in src/assets/ui match out/ byte for byte${differ.length ? `: ${differ.join(', ')}` : ''}`);
const unshipped = [...b.keys()].filter((f) => f.startsWith('out/') && !shipped.includes(f.slice(4)));
console.log(`not shipped: ${unshipped.join(', ') || 'none'}`);
console.log('md5 of outputs:');
for (const [f, h] of b) console.log(`  ${h}  ${f}`);
console.log('md5 of raws:');
for (const [f, h] of raws) console.log(`  ${h}  raw/${f}`);
process.exit(failures ? 1 : 0);
