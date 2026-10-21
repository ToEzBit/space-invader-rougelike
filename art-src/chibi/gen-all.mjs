// Generates every missing raw in prompts.json, one at a time. Usage: node gen-all.mjs [key...]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
// The skill's gen.sh lets codex's variadic -i swallow the prompt; this copy adds '--' before it.
const GEN = join(DIR, 'gen.sh');
const { common, characters } = JSON.parse(readFileSync(join(DIR, 'prompts.json'), 'utf8'));
const only = process.argv.slice(2);

const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');
const rawHashes = () =>
  new Map(readdirSync(join(DIR, 'raw')).filter((f) => f.endsWith('.png')).map((f) => [f, md5(join(DIR, 'raw', f))]));

export function promptFor(c) {
  if (c.edit) return c.request;
  return [c.head ?? common.head, c.request, c.style ?? common.style, common.framing, common.constraints, common.avoid].join('\n');
}

for (const c of characters) {
  if (only.length && !only.includes(c.key) && !only.includes(c.raw)) continue;
  const out = join(DIR, 'raw', `${c.raw}.png`);
  if (existsSync(out)) {
    console.log(`skip ${c.raw}, already generated`);
    continue;
  }
  const prompt = promptFor(c);
  writeFileSync(join(DIR, 'raw', `${c.raw}.prompt.txt`), prompt);
  console.log(`generating ${c.raw}`);
  const inputs = c.inputs
    ? c.inputs.map((f) => join(DIR, f))
    : c.edit
      ? [join(DIR, 'raw', `${c.edit}.png`)]
      : [join(DIR, 'ref/sheet.png'), join(DIR, `ref/${c.ref}.png`)];
  const run = spawnSync(GEN, ['-o', out, ...inputs.flatMap((f) => ['-i', f]), '-t', '900', prompt], {
    encoding: 'utf8',
  });
  console.log(run.stdout.trim(), run.stderr.trim());
  if (!existsSync(out)) {
    console.log(`FAILED ${c.raw}`);
    continue;
  }
  const hash = md5(out);
  const twin = [...rawHashes()].find(([f, h]) => h === hash && f !== `${c.raw}.png`);
  console.log(twin ? `DUPLICATE ${c.raw} matches ${twin[0]}` : `ok ${c.raw} ${hash}`);
}

const all = rawHashes();
console.log('md5 of every raw:');
for (const [f, h] of all) console.log(`  ${h}  ${f}`);
console.log(new Set(all.values()).size === all.size ? `all ${all.size} raws distinct` : 'DUPLICATE RAWS PRESENT');
