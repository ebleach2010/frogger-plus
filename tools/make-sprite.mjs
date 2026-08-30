// Turns Eric's character turnaround sheet into the game's runner sprite.
//
// The sheet he supplied is a 5x3 grid of the same standing figure seen from
// fifteen angles, with visible grid lines, a checkerboard backing baked into
// the pixels (the PNG has NO alpha channel), and a soft ground shadow under
// each figure. This tool:
//
//   1. finds the grid lines and slices the cells out,
//   2. removes the backing by flood-filling "background-like" pixels inward
//      from each cell's border -- connected-only, so grey highlights INSIDE
//      the figure are never eaten, while the checker and the shadow, which
//      always touch the border region, are,
//   3. trims each figure, scales it into a uniform cell with the feet on a
//      common baseline, and
//   4. stacks the cells into a one-column sheet, one row per direction, plus
//      the manifest that maps compass headings to rows.
//
// It runs the pixel work inside headless Chromium via Playwright because that
// is the one image library this container is guaranteed to have.
//
//   node tools/make-sprite.mjs <input.png> [--inspect]
//
// --inspect stops after slicing and writes a numbered contact sheet to
// shots/sprite-cells.png so a human (or an agent) can check which cell faces
// which way before trusting the ORDER table below.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- ORDER ---
// Which source cell (row-major, 0-based) faces which heading, in degrees,
// 0 = away from camera (up the screen), 90 = screen-right, 180 = toward
// camera. Verified by eye against shots/sprite-cells.png -- see --inspect.
// The output sheet is written sorted by degree so nearby rows are nearby
// angles, which makes the ragdoll tumble read as a smooth spin.
//
// The sheet's three rows read as: front-ish variants, a clean front-to-back
// turn, and back-ish variants. Duplicates are close enough in angle that
// assigning them neighbouring degrees is honest.
// Checked by eye against shots/sprite-cells.png on 2026-08-30. The sheet
// covers the front, the LEFT profile and the backs; there is no right-facing
// cell, so the manifest ships with mirror:true and screen-right headings use
// the left cells flipped.
const ORDER = [
  { cell: 4, deg: 162 },  // front, shade screen-right
  { cell: 3, deg: 172 },  // front, nearly square
  { cell: 5, deg: 180 },  // straight at camera
  { cell: 0, deg: 190 },  // front, shade screen-left
  { cell: 2, deg: 198 },  // a little more left
  { cell: 1, deg: 208 },  // front three-quarter, screen-left
  { cell: 6, deg: 232 },  // strong three-quarter left
  { cell: 7, deg: 256 },  // left profile
  { cell: 8, deg: 322 },  // back three-quarter, screen-left
  { cell: 9, deg: 340 },  // mostly back
  { cell: 10, deg: 352 }, // back, slight left
  { cell: 13, deg: 0 },   // straight away
  { cell: 12, deg: 8 },   // back, slight right shade
  { cell: 11, deg: 18 },  // back, more right shade
  { cell: 14, deg: 30 },  // widest back variant
];

const CELL_W = 256;
const CELL_H = 320;
/** Figure height inside the cell, px. Leaves headroom for the bob. */
const FIGURE_H = 288;
/** Feet baseline, px up from the cell's bottom edge. */
const BASELINE = 10;

const input = process.argv[2];
const inspect = process.argv.includes('--inspect');

if (!input) {
  console.error('usage: node tools/make-sprite.mjs <sheet.png> [--inspect]');
  process.exit(1);
}

const bytes = readFileSync(input);
const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const result = await page.evaluate(async ({ dataUrl, ORDER, CELL_W, CELL_H, FIGURE_H, BASELINE, inspect }) => {
  const img = new Image();
  await new Promise((ok, bad) => {
    img.onload = ok;
    img.onerror = () => bad(new Error('decode failed'));
    img.src = dataUrl;
  });

  const W = img.width;
  const H = img.height;
  const src = document.createElement('canvas');
  src.width = W;
  src.height = H;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, W, H).data;

  const lumAt = (x, y) => {
    const i = (y * W + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  // ---- 1. grid lines: rows/columns that are dark across nearly their span.
  function findLines(count, sizeAcross, sizeAlong, at) {
    const dark = [];
    for (let a = 0; a < sizeAlong; a += 1) {
      let n = 0;
      for (let b = 0; b < sizeAcross; b += 8) if (at(b, a) < 70) n += 1;
      if (n / (sizeAcross / 8) > 0.7) dark.push(a);
    }
    // group consecutive indices into line centres
    const lines = [];
    let run = [];
    for (const a of dark) {
      if (run.length && a - run[run.length - 1] > 2) {
        lines.push(Math.round(run.reduce((s, v) => s + v, 0) / run.length));
        run = [];
      }
      run.push(a);
    }
    if (run.length) lines.push(Math.round(run.reduce((s, v) => s + v, 0) / run.length));
    return lines;
  }

  const vLines = findLines(4, H, W, (b, a) => lumAt(a, b));
  const hLines = findLines(2, W, H, (b, a) => lumAt(b, a));

  const xEdges = [0, ...vLines, W];
  const yEdges = [0, ...hLines, H];

  const cells = [];
  for (let r = 0; r + 1 < yEdges.length; r += 1) {
    for (let c = 0; c + 1 < xEdges.length; c += 1) {
      cells.push({
        x: xEdges[c] + 2, y: yEdges[r] + 2,
        w: xEdges[c + 1] - xEdges[c] - 4, h: yEdges[r + 1] - yEdges[r] - 4,
      });
    }
  }

  // ---- 2/3. key each cell and measure the figure.
  function keyCell(rect) {
    const { x: cx, y: cy, w, h } = rect;
    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = w;
    cellCanvas.height = h;
    const ctx = cellCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, cx, cy, w, h, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;

    // Background-like: light and nearly colourless. Covers both checker
    // squares and the soft grey shadow. The black clothing, warm skin and
    // blond hair all fail at least one clause.
    const bgLike = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 26 && (r + g + b) / 3 > 118) bgLike[i] = 1;
    }

    // Flood fill from every border pixel across bg-like pixels only.
    const remove = new Uint8Array(w * h);
    const queue = [];
    for (let x = 0; x < w; x += 1) { queue.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y += 1) { queue.push(y * w, y * w + w - 1); }
    for (const s of queue) if (bgLike[s]) remove[s] = 1;

    while (queue.length) {
      const i = queue.pop();
      if (!remove[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (bgLike[n] && !remove[n]) {
          remove[n] = 1;
          queue.push(n);
        }
      }
    }

    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let i = 0; i < w * h; i += 1) {
      if (remove[i]) {
        px[i * 4 + 3] = 0;
      } else {
        const x = i % w;
        const y = (i / w) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    // Soften the cut edge: any opaque pixel bordering a removed one drops to
    // partial alpha, which reads as a 1px anti-aliased rim under alphaTest.
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (remove[i]) continue;
        if (remove[i - 1] || remove[i + 1] || remove[i - w] || remove[i + w]) {
          px[i * 4 + 3] = 150;
        }
      }
    }

    ctx.putImageData(image, 0, 0);
    return { canvas: cellCanvas, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
  }

  const keyed = cells.map(keyCell);

  if (inspect) {
    // Numbered contact sheet on magenta so holes in the keying are obvious.
    const cols = 5;
    const rows = Math.ceil(keyed.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * CELL_W;
    sheet.height = rows * CELL_H;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#c0f';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    keyed.forEach((k, i) => {
      const gx = (i % cols) * CELL_W;
      const gy = ((i / cols) | 0) * CELL_H;
      const s = Math.min((CELL_W - 8) / k.box.w, (CELL_H - 28) / k.box.h);
      ctx.drawImage(k.canvas, k.box.x, k.box.y, k.box.w, k.box.h,
        gx + (CELL_W - k.box.w * s) / 2, gy + 24, k.box.w * s, k.box.h * s);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(String(i), gx + 6, gy + 20);
      ctx.fillStyle = '#c0f';
    });
    return { inspect: sheet.toDataURL('image/png'), grid: { vLines, hLines, cells: cells.length } };
  }

  // ---- 4. compose the final one-column sheet, ordered by heading.
  const sorted = [...ORDER].sort((a, b) => a.deg - b.deg);
  const out = document.createElement('canvas');
  out.width = CELL_W;
  out.height = CELL_H * sorted.length;
  const octx = out.getContext('2d');

  // The tallest figure sets the scale, so every direction shares one scale
  // and the character never changes size as he turns.
  const tallest = Math.max(...ORDER.map(({ cell }) => keyed[cell].box.h));
  const scale = FIGURE_H / tallest;

  sorted.forEach(({ cell }, row) => {
    const k = keyed[cell];
    const dw = k.box.w * scale;
    const dh = k.box.h * scale;
    octx.drawImage(
      k.canvas, k.box.x, k.box.y, k.box.w, k.box.h,
      (CELL_W - dw) / 2, row * CELL_H + (CELL_H - BASELINE - dh),
      dw, dh,
    );
  });

  return {
    png: out.toDataURL('image/png'),
    directions: sorted.map((o) => o.deg),
    grid: { vLines, hLines, cells: cells.length },
    tallest,
  };
}, { dataUrl, ORDER, CELL_W, CELL_H, FIGURE_H, BASELINE, inspect });

await browser.close();

console.log('grid:', JSON.stringify(result.grid));

if (result.inspect) {
  mkdirSync(join(REPO, 'shots'), { recursive: true });
  const out = join(REPO, 'shots', 'sprite-cells.png');
  writeFileSync(out, Buffer.from(result.inspect.split(',')[1], 'base64'));
  console.log(`contact sheet: ${out}`);
} else {
  const dir = join(REPO, 'public', 'sprites');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'runner.png'), Buffer.from(result.png.split(',')[1], 'base64'));

  const manifest = {
    image: 'runner.png',
    frameWidth: CELL_W,
    frameHeight: CELL_H,
    worldHeight: 1.78,
    feetInset: BASELINE / CELL_H,
    // Degrees, one row each, already sorted ascending. 0 = away from camera.
    directions: result.directions,
    mirror: true,
    // The sheet is a turnaround with no run cycle; the runner's gait is done
    // procedurally (bob and lean) by player.js, so every animation is the
    // same single frame.
    animations: {
      run: { startRow: 0, frames: 1, fps: 1, loop: true },
      idle: { startRow: 0, frames: 1, fps: 1, loop: true },
    },
  };
  writeFileSync(join(dir, 'runner.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote public/sprites/runner.png (${CELL_W}x${CELL_H * result.directions.length}) + runner.json`);
}
