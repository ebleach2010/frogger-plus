// The dev server: content types, the GitHub Pages subpath rewrite, and the
// path-traversal guard. Spawns the real server on a scratch port.

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8977;

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `  -- ${detail}`}`);
}

const server = spawn(process.execPath, [join(REPO, 'tools/serve.mjs')], {
  env: { ...process.env, FP_PORT: String(PORT) },
  stdio: 'ignore',
});

// Wait for the port to open.
let up = false;
for (let i = 0; i < 40 && !up; i += 1) {
  up = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.ok).catch(() => false);
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
check('V1 server comes up', up);

if (up) {
  const index = await fetch(`http://127.0.0.1:${PORT}/`);
  check('V2 root serves index.html as html',
    (index.headers.get('content-type') || '').startsWith('text/html'));
  check('V3 no-store in development', index.headers.get('cache-control') === 'no-store');

  const js = await fetch(`http://127.0.0.1:${PORT}/js/main.js`);
  check('V4 module scripts typed as javascript',
    (js.headers.get('content-type') || '').startsWith('text/javascript'));

  const manifest = await fetch(`http://127.0.0.1:${PORT}/manifest.webmanifest`);
  check('V5 manifest typed for install',
    (manifest.headers.get('content-type') || '').includes('manifest'));

  const sub = await fetch(`http://127.0.0.1:${PORT}/frogger-plus/js/main.js`);
  check('V6 Pages subpath rewrites', sub.ok);
  const subRoot = await fetch(`http://127.0.0.1:${PORT}/frogger-plus/`);
  check('V7 subpath root serves index', subRoot.ok
    && (subRoot.headers.get('content-type') || '').startsWith('text/html'));

  const sneak = await fetch(`http://127.0.0.1:${PORT}/..%2f..%2fpackage.json`);
  check('V8 traversal cannot leave public/', sneak.status === 403 || sneak.status === 404,
    String(sneak.status));

  const missing = await fetch(`http://127.0.0.1:${PORT}/nope.js`);
  check('V9 missing files 404', missing.status === 404);

  const sprite = await fetch(`http://127.0.0.1:${PORT}/sprites/runner.png`);
  check('V10 the runner sheet is served', sprite.ok
    && (sprite.headers.get('content-type') || '') === 'image/png');
}

server.kill();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
