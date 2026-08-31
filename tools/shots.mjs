// Quick screenshots of every surface: title, all three worlds, game over.
//
//   node tools/serve.mjs &
//   node tools/shots.mjs           # writes shots/*.png

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = `http://127.0.0.1:${process.env.FP_PORT || 8910}`;
const SHOTS = process.env.FP_SHOTS || join(REPO, 'shots');
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('pageerror:', e.message));

await page.goto(`${P}/?debug`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: join(SHOTS, 'title.png') });
console.log('title.png');

await page.click('#btn-play');
await page.waitForTimeout(3200);
await page.screenshot({ path: join(SHOTS, 'highway.png') });
console.log('highway.png');

for (const [stage, name] of [[4, 'flood'], [7, 'junkyard']]) {
  await page.evaluate((s) => {
    window.__fp.game.run.stage = s;
    window.__fp.game.buildStage(s);
  }, stage);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log(`${name}.png`);
}

// Game over card, reached honestly: burn the three lives.
await page.evaluate(() => {
  const g = window.__fp.game;
  g.run.lives = 1;
  g.debug.kill();
});
// Generous timeout: on a software-GL container the game clock runs at a
// third of wall speed, and the body has to finish bouncing before the card.
await page.waitForFunction(() => window.__fp.game.run.phase === 'gameover', null, { timeout: 45000 })
  .catch(() => console.error('gameover never arrived'));
await page.waitForTimeout(600);
await page.screenshot({ path: join(SHOTS, 'gameover.png') });
console.log('gameover.png');

await browser.close();
