// A plain static file server for public/.
//
// The game has no build step. What is in public/ is exactly what a phone
// downloads, so the dev server's only job is to hand those bytes over with
// the right Content-Type and get out of the way.
//
//   node tools/serve.mjs            # http://127.0.0.1:8910
//   FP_PORT=9000 node tools/serve.mjs
//
// The drives and screenshot scripts default to the same port, and all of
// them honour FP_PORT, so several can run side by side without colliding.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO, 'public');
const PORT = Number(process.env.FP_PORT || 8910);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    // GitHub Pages serves this game from /frogger-plus/. Accepting that prefix
    // locally too means the same absolute-path bug shows up in both places
    // instead of only in production, where it is much more annoying to find.
    if (path === '/frogger-plus' || path.startsWith('/frogger-plus/')) {
      path = path.slice('/frogger-plus'.length) || '/';
    }
    if (path.endsWith('/')) path += 'index.html';

    // normalize() collapses any ../ before we join, so a crafted URL cannot
    // reach outside public/.
    const file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      // No caching in development. A stale shader is a genuinely confusing bug.
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`frogger-plus serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
