// The direction resolver: the piece of sprite.js that decides which row of
// Eric's fifteen-angle turnaround shows for a given heading, and when to
// mirror. Runs under plain node -- the resolver is pure math.

import { resolveDirection, normaliseManifest } from '../../public/js/play/sprite.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

const rad = (deg) => (deg * Math.PI) / 180;

// R1: the shipped manifest is coherent with the shipped sheet.
const manifest = JSON.parse(readFileSync(join(REPO, 'public/sprites/runner.json'), 'utf8'));
const png = readFileSync(join(REPO, 'public/sprites/runner.png'));
const pngWidth = png.readUInt32BE(16);
const pngHeight = png.readUInt32BE(20);

check('R1a sheet rows match directions', pngHeight === manifest.frameHeight * manifest.directions.length,
  JSON.stringify({ pngHeight, rows: manifest.directions.length }));
check('R1b sheet holds one column', pngWidth === manifest.frameWidth, String(pngWidth));
check('R1c sheet has an alpha channel', png[25] === 6, `colorType=${png[25]}`);
check('R1d directions sorted ascending', manifest.directions.every((d, i, a) => i === 0 || d > a[i - 1]));
check('R1e mirror on: the sheet has no right-facing cells', manifest.mirror === true);

// R2: exact hits pick the exact row.
manifest.directions.forEach((deg, row) => {
  const r = resolveDirection(manifest.directions, false, rad(deg));
  if (r.row !== row) check(`R2 exact hit row ${row}`, false, JSON.stringify(r));
});
check('R2 every exact heading resolves to its own row', true);

// R3: mirroring covers the missing right side.
// 90 degrees (screen-right) has no cell; with mirror it must borrow the left
// profile (256 degrees mirrors to 104, the closest available to 90).
const east = resolveDirection(manifest.directions, true, rad(90));
const westRow = manifest.directions.indexOf(256);
check('R3a east borrows the mirrored left profile', east.row === westRow && east.mirror === true,
  JSON.stringify(east));

const west = resolveDirection(manifest.directions, true, rad(256));
check('R3b west uses its own row unmirrored', west.row === westRow && west.mirror === false,
  JSON.stringify(west));

// R4: wraparound. 359 degrees is nearer row "0" than row "352".
const wrap = resolveDirection([0, 8, 352], false, rad(359));
check('R4 wraparound picks 0, not 352', wrap.row === 0, JSON.stringify(wrap));

// R5: a single-row sheet mirrors by side, the side-scroller rule.
check('R5a single row facing right stays', resolveDirection(['s'], true, rad(120)).mirror === false);
check('R5b single row facing left mirrors', resolveDirection(['s'], true, rad(240)).mirror === true);

// R6: manifest normalisation fills the gaps a terse manifest leaves.
const n = normaliseManifest({ directions: ['s'] });
check('R6a run animation exists', n.animations.run && n.animations.run.frames >= 1);
check('R6b idle falls back to run', n.animations.idle === n.animations.run);
check('R6c frame size defaults', n.frameWidth > 0 && n.frameHeight > 0);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
