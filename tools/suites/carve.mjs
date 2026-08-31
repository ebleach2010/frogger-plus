// Geometry: the merge that keeps draw calls down, and the two destructive
// operations Eric asked for -- the laser slice and the crash crumple.
// three.js runs fine under plain node; only the renderer needs a browser.

import * as THREE from 'three';
import { slab, wheel, merge, sliceAlongX } from '../../public/js/engine/geo.js';
import { crushGeometry } from '../../public/js/world/crush.js';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

// G1: merge folds parts into one geometry with every attribute present.
const merged = merge([
  { geometry: slab(4, 2, 1), color: 0xffffff },
  { geometry: wheel(0.4, 0.3), position: [1, 0.4, 0.9], color: 0x0d0e10 },
]);
check('G1a merged has position/normal/uv/color',
  ['position', 'normal', 'uv', 'color'].every((a) => merged.attributes[a]));
check('G1b non-indexed triangle soup', !merged.index);
check('G1c counts agree across attributes',
  merged.attributes.position.count === merged.attributes.color.count
  && merged.attributes.position.count === merged.attributes.uv.count * 1);

// G2: vertex colours carry the part colour.
const colors = merged.attributes.color;
let sawWhite = false;
let sawDark = false;
for (let i = 0; i < colors.count; i += 1) {
  if (colors.getX(i) > 0.95) sawWhite = true;
  if (colors.getX(i) < 0.1) sawDark = true;
}
check('G2 paint-take and paint-shrug parts both present', sawWhite && sawDark);

// G3: the slice is a real clip. Each half is bounded by the cutting plane,
// nothing is lost, and the seam vertices land exactly on the plane.
const body = merge([{ geometry: slab(4.6, 1.9, 1.2), color: 0xaaaaaa }]);
const [tail, nose] = sliceAlongX(body, 0);
check('G3a clipping never loses area',
  tail.attributes.position.count + nose.attributes.position.count
    >= body.attributes.position.count,
  JSON.stringify([tail.attributes.position.count, nose.attributes.position.count]));
check('G3b tail bounded by the plane', tail.boundingBox.max.x <= 1e-4,
  String(tail.boundingBox.max.x));
check('G3c nose bounded by the plane', nose.boundingBox.min.x >= -1e-4,
  String(nose.boundingBox.min.x));
check('G3d both halves are real', tail.attributes.position.count > 100
  && nose.attributes.position.count > 100);
check('G3e halves together span the car',
  Math.abs(tail.boundingBox.min.x - body.boundingBox.min.x) < 1e-4
  && Math.abs(nose.boundingBox.max.x - body.boundingBox.max.x) < 1e-4);

// G3f: an off-centre cut also respects its plane.
const [shortHalf, longHalf] = sliceAlongX(body, 1.1);
check('G3f off-centre cut respects its plane',
  shortHalf.boundingBox.max.x <= 1.1 + 1e-4 && longHalf.boundingBox.min.x >= 1.1 - 1e-4);

// G4: the crumple. Only the crush zone moves; same seed, same wreck.
const pristine = merge([{ geometry: slab(4.6, 1.9, 1.2), color: 0xaaaaaa }]);
const before = pristine.attributes.position.clone();
const crushed = crushGeometry(pristine, 1, { depth: 0.9, seed: 5 });

check('G4a source untouched', pristine.attributes.position.array.every(
  (v, i) => v === before.array[i]));

const edge = pristine.boundingBox.max.x;
let movedInZone = 0;
let movedOutside = 0;
for (let i = 0; i < crushed.attributes.position.count; i += 1) {
  const moved = Math.abs(crushed.attributes.position.getX(i) - before.getX(i)) > 1e-6
    || Math.abs(crushed.attributes.position.getY(i) - before.getY(i)) > 1e-6;
  if (!moved) continue;
  if (before.getX(i) > edge - 0.9 - 1e-6) movedInZone += 1;
  else movedOutside += 1;
}
check('G4b the crush zone crumples', movedInZone > 0, String(movedInZone));
check('G4c the rest of the car does not', movedOutside === 0, String(movedOutside));
check('G4d nose pulls back toward the cabin',
  crushed.boundingBox.max.x < pristine.boundingBox.max.x - 0.2,
  JSON.stringify([crushed.boundingBox.max.x, pristine.boundingBox.max.x]));

const again = crushGeometry(pristine, 1, { depth: 0.9, seed: 5 });
check('G4e same seed, same wreck', again.attributes.position.array.every(
  (v, i) => v === crushed.attributes.position.array[i]));

// G5: paint scuffs toward bare metal in the zone.
let scuffed = false;
for (let i = 0; i < crushed.attributes.color.count; i += 1) {
  if (crushed.attributes.color.getX(i) < 0.6) { scuffed = true; break; }
}
check('G5 crumpled metal loses its paint', scuffed);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
