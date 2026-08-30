// Refreshes public/vendor/three/ from the version pinned in package.json.
//
// three.js is committed into public/vendor/ rather than pulled from a CDN at
// runtime. Two reasons, both hard: the container that builds and tests this
// game cannot reach cdnjs or jsdelivr at all, and a home-screen PWA that has
// to fetch its engine from a third party is one outage away from a black
// screen on a phone with no obvious way to recover.
//
//   npm run vendor
//
// three.module.min.js imports './three.core.min.js' by relative path, so the
// two files must stay together in the same directory.

import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FROM = join(REPO, 'node_modules', 'three');
const TO = join(REPO, 'public', 'vendor', 'three');

const FILES = [
  ['build/three.module.min.js', 'three.module.min.js'],
  ['build/three.core.min.js', 'three.core.min.js'],
  ['LICENSE', 'LICENSE'],
];

await mkdir(TO, { recursive: true });
for (const [src, dest] of FILES) {
  await copyFile(join(FROM, src), join(TO, dest));
  console.log(`vendored ${dest}`);
}
console.log('done. Commit public/vendor/three/ along with the package.json bump.');
