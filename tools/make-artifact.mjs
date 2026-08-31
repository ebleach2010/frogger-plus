// Builds the whole game into ONE self-contained HTML file -- the test-ride
// page. Eric drives previews on his phone before anything merges, and the
// quickest thing to hand him is a single page with zero network requests:
// engine, game code, styles, and his sprite sheet all inlined.
//
//   node tools/make-artifact.mjs [out.html]
//
// What it does:
//   1. esbuild bundles public/js/main.js (with `three` aliased to the
//      vendored build) into one ES module -- top-level await survives.
//   2. The sprite sheet + manifest are embedded as window.__FP_EMBED, which
//      sprite.js checks before ever fetching.
//   3. The HUD/screen DOM and game.css are lifted from index.html verbatim,
//      so the page IS the game, not a copy that can drift.
//
// The output is page CONTENT (title + style + body), not a full document:
// the artifact host wraps it in its own doctype/head/body skeleton.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(REPO, 'shots', 'frogger-plus-artifact.html');

// ---- 1. bundle -------------------------------------------------------------

const bundle = execFileSync(
  join(REPO, 'node_modules', '.bin', 'esbuild'),
  [
    join(REPO, 'public', 'js', 'main.js'),
    '--bundle',
    '--format=esm',
    '--minify',
    '--target=safari16',
    `--alias:three=${join(REPO, 'public', 'vendor', 'three', 'three.module.min.js')}`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

// ---- 2. sprite embed -------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(REPO, 'public', 'sprites', 'runner.json'), 'utf8'));
const sheet = readFileSync(join(REPO, 'public', 'sprites', 'runner.png'));
const embed = {
  manifest,
  image: `data:image/png;base64,${sheet.toString('base64')}`,
};

// ---- 3. lift the page ------------------------------------------------------

const html = readFileSync(join(REPO, 'public', 'index.html'), 'utf8');
const css = readFileSync(join(REPO, 'public', 'css', 'game.css'), 'utf8');

// Everything between <body> and the module script include is the game's DOM.
const bodyMatch = html.match(/<body>([\s\S]*?)<script type="module"/);
if (!bodyMatch) throw new Error('index.html shape changed; update make-artifact.mjs');
const dom = bodyMatch[1]
  .replace(/<noscript>[\s\S]*?<\/noscript>/, '')
  .trim();

const page = `<title>Frogger Plus</title>
<style>
${css}
/* The artifact host paints its own ground behind the page; the game paints
   the whole viewport itself, every time, in its own palette. */
html, body { background: #05070b !important; }
</style>
${dom}
<script>
// The sprite sheet, inlined. sprite.js looks here before fetching anything.
window.__FP_EMBED = ${JSON.stringify(embed)};
</script>
<script type="module">
${bundle}
</script>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} (${Math.round(page.length / 1024)}KB)`);
