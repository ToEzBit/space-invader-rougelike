// Generates every missing raw in prompts.json, strictly one at a time. Usage: node gen-all.mjs [raw...]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dirname;
// Patched copy of the skill's gen.sh: it puts '--' before the prompt so codex's variadic -i cannot swallow it.
const GEN = join(DIR, '../chibi/gen.sh');
const { common, assets } = JSON.parse(readFileSync(join(DIR, 'prompts.json'), 'utf8'));
const only = process.argv.slice(2);

const md5 = (file) => createHash('md5').update(readFileSync(file)).digest('hex');
const rawHashes = () =>
  new Map(readdirSync(join(DIR, 'raw')).filter((f) => f.endsWith('.png')).map((f) => [f, md5(join(DIR, 'raw', f))]));

export function promptFor(a) {
  if (a.edit) return a.request;
  const c = { ...common[a.common], ...a.overrides };
  return [c.head, a.request, c.style, c.framing, a.palette ?? '', c.constraints, c.avoid].filter(Boolean).join('\n');
}

// Importing this module (to reuse promptFor) must never start a generation; only `node gen-all.mjs` does.
if (process.argv[1] === import.meta.filename) run();

function run() {
for (const a of assets) {
  if (only.length ? !only.includes(a.raw) : a.disabled) continue;
  const out = join(DIR, 'raw', `${a.raw}.png`);
  if (existsSync(out)) {
    console.log(`skip ${a.raw}, already generated`);
    continue;
  }
  const prompt = promptFor(a);
  writeFileSync(join(DIR, 'raw', `${a.raw}.prompt.txt`), prompt);
  console.log(`generating ${a.raw}`);
  const refs = (a.edit ? [`raw/${a.edit}.png`] : a.refs ?? common[a.common].refs).map((f) => join(DIR, f));
  const run = spawnSync(GEN, ['-o', out, ...refs.flatMap((f) => ['-i', f]), '-t', '900', prompt], { encoding: 'utf8' });
  console.log(run.stdout.trim(), run.stderr.trim());
  if (!existsSync(out)) {
    console.log(`FAILED ${a.raw}`);
    continue;
  }
  const hash = md5(out);
  const twin = [...rawHashes()].find(([f, h]) => h === hash && f !== `${a.raw}.png`);
  console.log(twin ? `DUPLICATE ${a.raw} matches ${twin[0]}` : `ok ${a.raw} ${hash}`);
}

const all = rawHashes();
console.log('md5 of every raw:');
for (const [f, h] of all) console.log(`  ${h}  ${f}`);
console.log(new Set(all.values()).size === all.size ? `all ${all.size} raws distinct` : 'DUPLICATE RAWS PRESENT');
}
