// Ship hygiene: everything GitHub Pages needs must be IN the repo and every
// reference must be relative. Pages serves this game from /frogger-plus/, so
// one leading-slash URL works perfectly on localhost and 404s in production
// -- the most annoying class of bug there is.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

// H1: the vendored engine matches the pinned package byte for byte.
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
check('H1a three is pinned exactly', /^\d+\.\d+\.\d+$/.test(pkg.devDependencies.three),
  pkg.devDependencies.three);

for (const f of ['three.module.min.js', 'three.core.min.js', 'LICENSE']) {
  const vendored = join(REPO, 'public/vendor/three', f);
  check(`H1b vendored ${f} exists`, existsSync(vendored));
  const source = join(REPO, 'node_modules/three', f === 'LICENSE' ? f : `build/${f}`);
  if (existsSync(source) && existsSync(vendored)) {
    const same = readFileSync(source).equals(readFileSync(vendored));
    check(`H1c vendored ${f} matches node_modules`, same, 'run: npm run vendor');
  }
}

// H2: the module graph resolves internally -- every relative import in
// public/js points at a file that exists.
import { readdirSync } from 'node:fs';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
let missingImports = 0;
for (const file of walk(join(REPO, 'public/js'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    const target = join(dirname(file), m[1]);
    if (!existsSync(target)) {
      missingImports += 1;
      check(`H2 import resolves: ${m[1]} in ${file.slice(REPO.length + 1)}`, false);
    }
  }
}
check('H2 every relative import resolves', missingImports === 0);

// H3: index.html carries no root-absolute references.
const html = readFileSync(join(REPO, 'public/index.html'), 'utf8');
const absolute = [...html.matchAll(/(?:src|href)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
check('H3a no leading-slash src/href in index.html', absolute.length === 0, absolute.join(' '));
check('H3b importmap maps three to the vendored file',
  html.includes('"three": "./vendor/three/three.module.min.js"'));

// H4: the installable app is complete.
const manifest = JSON.parse(readFileSync(join(REPO, 'public/manifest.webmanifest'), 'utf8'));
check('H4a manifest is fullscreen portrait',
  manifest.display === 'fullscreen' && manifest.orientation === 'portrait');
for (const icon of manifest.icons) {
  check(`H4b icon ${icon.src} shipped`, existsSync(join(REPO, 'public', icon.src)));
}
check('H4c apple-touch-icon wired', html.includes('apple-touch-icon'));
check('H4d viewport-fit=cover for the notch', html.includes('viewport-fit=cover'));

// H5: the runner sheet is committed and not absurdly heavy for a phone.
const sheet = join(REPO, 'public/sprites/runner.png');
check('H5a runner.png shipped', existsSync(sheet));
if (existsSync(sheet)) {
  const kb = statSync(sheet).size / 1024;
  check('H5b runner.png under 1.5MB', kb < 1536, `${Math.round(kb)}KB`);
}
check('H5c runner.json shipped', existsSync(join(REPO, 'public/sprites/runner.json')));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
