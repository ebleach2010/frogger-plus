// Runs every suite in this directory and refuses to bless a partial pass.
//
//   node tools/suites/run.mjs
//
// Same shape as the Pocket Advocate battery: each suite is a self-contained
// node script that prints PASS/FAIL lines and exits non-zero on any failure.
// The FLOOR guard exists so a broken checkout that discovers two suites
// cannot masquerade as a green battery.

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FLOOR = 6;

const suites = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs')
  .sort();

if (suites.length < FLOOR) {
  console.error(`Only ${suites.length} suites found; expected at least ${FLOOR}. Partial checkout?`);
  process.exit(1);
}

let green = 0;

for (const f of suites) {
  let ok = true;
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(here, f)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
  } catch (err) {
    ok = false;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }

  const lines = out.trim().split('\n');
  const tail = ok
    ? lines[lines.length - 1]
    : lines.filter((l) => /FAIL|Error/.test(l)).slice(0, 4).join(' | ');

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${f.padEnd(16)} ${tail}`);
  if (ok) green += 1;
}

console.log(`\n${green}/${suites.length} suites green`);
if (green !== suites.length) {
  console.log('RED. Nothing ships like this.');
  process.exit(1);
}
console.log('Battery clear.');
