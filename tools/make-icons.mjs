// Draws the app icons: the runner against the double yellow line, at night.
// Same headless-canvas trick as make-sprite.mjs. Regenerate with:
//
//   node tools/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(REPO, 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const icons = await page.evaluate(() => {
  function draw(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const u = size / 100; // work in percent units

    // Night sky to asphalt.
    const bg = ctx.createLinearGradient(0, 0, 0, size);
    bg.addColorStop(0, '#141a2b');
    bg.addColorStop(0.45, '#232637');
    bg.addColorStop(1, '#33343c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    // The sodium glow, top right.
    const glow = ctx.createRadialGradient(size * 0.78, size * 0.16, 0, size * 0.78, size * 0.16, size * 0.55);
    glow.addColorStop(0, 'rgba(255, 176, 82, 0.8)');
    glow.addColorStop(1, 'rgba(255, 176, 82, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // Double yellow, swooping past.
    ctx.strokeStyle = '#d8b638';
    ctx.lineWidth = 4.5 * u;
    for (const off of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo((18 + off) * u, size * 1.05);
      ctx.quadraticCurveTo((30 + off) * u, 55 * u, (66 + off) * u, -6 * u);
      ctx.stroke();
    }

    // The runner: bold silhouette with the hi-vis torso.
    ctx.save();
    ctx.translate(58 * u, 58 * u);
    ctx.rotate(-0.06);
    // legs mid-stride
    ctx.strokeStyle = '#1d232e';
    ctx.lineCap = 'round';
    ctx.lineWidth = 8 * u;
    ctx.beginPath(); ctx.moveTo(0, 6 * u); ctx.lineTo(-11 * u, 26 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 6 * u); ctx.lineTo(12 * u, 20 * u); ctx.stroke();
    // arms
    ctx.lineWidth = 7 * u;
    ctx.beginPath(); ctx.moveTo(-2 * u, -10 * u); ctx.lineTo(-16 * u, 2 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2 * u, -10 * u); ctx.lineTo(15 * u, -18 * u); ctx.stroke();
    // torso
    ctx.fillStyle = '#e8641b';
    ctx.beginPath();
    ctx.roundRect(-9 * u, -18 * u, 18 * u, 26 * u, 6 * u);
    ctx.fill();
    // vest stripe
    ctx.fillStyle = '#f9d64a';
    ctx.fillRect(-9 * u, -8 * u, 18 * u, 3.4 * u);
    // head
    ctx.fillStyle = '#e8b48c';
    ctx.beginPath();
    ctx.arc(1 * u, -26 * u, 8 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a4552b';
    ctx.beginPath();
    ctx.arc(1 * u, -29 * u, 7.4 * u, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.restore();

    // Vignette for depth.
    const vin = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
    vin.addColorStop(0, 'rgba(0,0,0,0)');
    vin.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vin;
    ctx.fillRect(0, 0, size, size);

    return canvas.toDataURL('image/png');
  }

  return { 180: draw(180), 192: draw(192), 512: draw(512) };
});

await browser.close();

for (const [size, dataUrl] of Object.entries(icons)) {
  writeFileSync(join(OUT, `icon-${size}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`icon-${size}.png`);
}
