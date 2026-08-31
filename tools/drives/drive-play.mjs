// Drives the whole game in headless Chromium and fails on anything broken:
// page errors, a boot that never reaches the title, a death that does not
// cost a heart, a laser that does not cut, an invincible player who dies.
//
//   node tools/serve.mjs &         # or any server on FP_PORT
//   node tools/drives/drive-play.mjs
//
// Screenshots land in FP_SHOTS (default shots/drive/). This is the closest
// thing to a person playing it that a container can do; it does not replace
// Eric driving a preview build with his own thumbs.

import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = `http://127.0.0.1:${process.env.FP_PORT || 8910}`;
const SHOTS = process.env.FP_SHOTS || join(REPO, 'shots', 'drive');
mkdirSync(SHOTS, { recursive: true });

let pass = 0;
let fail = 0;
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log('  ok   ', n, d ? `(${d})` : ''); }
  else { fail += 1; console.log('  FAIL ', n, d ? `(${d})` : ''); }
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errs = [];

for (const width of [390, 320]) {
  console.log(`\n-- viewport ${width}`);
  const page = await browser.newPage({ viewport: { width, height: Math.round(width * 2.16) } });
  page.on('pageerror', (e) => errs.push(`${width}: ${e.message}`));

  await page.goto(`${P}/?debug`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2500);

  // Boot reaches the title with the world running behind it.
  const title = await page.evaluate(() => ({
    onTitle: document.getElementById('screen-title').classList.contains('is-on'),
    hooked: !!window.__fp,
  }));
  ok('boot reaches title', title.onTitle && title.hooked);

  await page.click('#btn-play');
  await page.waitForTimeout(800);

  const started = await page.evaluate(() => ({
    phase: window.__fp.game.run.phase,
    lives: window.__fp.game.run.lives,
    hudUp: !document.getElementById('hud').hidden,
  }));
  ok('play starts with three lives', started.phase === 'playing' && started.lives === 3);
  ok('HUD appears', started.hudUp);

  // He runs: hold up, confirm forward progress scores.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  const progressed = await page.evaluate(() => window.__fp.game.run.score);
  ok('sprinting forward scores', progressed > 0, String(Math.round(progressed)));
  await page.screenshot({ path: join(SHOTS, `${width}-run.png`) });

  // Death: park him mid-lane until a car does what cars do.
  await page.evaluate(async () => {
    const g = window.__fp.game;
    const cfg = await import('./js/config.js');
    const centres = cfg.bandCentres(g.run.stageData.bands);
    const laneIdx = g.run.stageData.bands.findIndex((b) => b.kind === 'lane');
    g.debug.player.state.z = centres[laneIdx];
    g.debug.player.state.x = 0;
  });
  const death = await page.waitForFunction(
    () => window.__fp.game.debug.player.state.mode !== 'run',
    null, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  const afterDeath = await page.evaluate(() => ({
    lives: window.__fp.game.run.lives,
    mode: window.__fp.game.debug.player.state.mode,
  }));
  ok('a car kills him', death, afterDeath.mode);
  ok('death costs a heart', afterDeath.lives === 2, String(afterDeath.lives));
  await page.screenshot({ path: join(SHOTS, `${width}-death.png`) });

  const gore = await page.evaluate(() => window.__fp.game.debug.gore.splatCount);
  ok('the road wears the evidence', gore > 0, `${gore} splats`);

  // Respawn, then the laser: within two seconds something should be sliced.
  await page.waitForFunction(() => window.__fp.game.debug.player.state.mode === 'run',
    null, { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.__fp.game.debug.grant('laser'));
  await page.waitForTimeout(2000);
  const cut = await page.evaluate(() => ({
    wrecks: window.__fp.game.debug.crush.wreckCount,
    flying: window.__fp.game.debug.crush.flyingCount,
  }));
  ok('laser cuts cars in half', cut.wrecks + cut.flying > 0, JSON.stringify(cut));
  await page.screenshot({ path: join(SHOTS, `${width}-laser.png`) });

  // Invincibility: a car must crumple against him without costing a heart.
  const livesBefore = await page.evaluate(async () => {
    const g = window.__fp.game;
    const cfg = await import('./js/config.js');
    const centres = cfg.bandCentres(g.run.stageData.bands);
    const laneIdx = g.run.stageData.bands.findIndex((b) => b.kind === 'lane');
    g.debug.player.state.z = centres[laneIdx];
    window.__keepInv = setInterval(() => g.debug.grant('invincible'), 700);
    return g.run.lives;
  });
  const crushed = await page.waitForFunction(
    (before) => window.__fp.game.debug.crush.wreckCount > 0
      && window.__fp.game.run.lives === before,
    livesBefore, { timeout: 30000 },
  ).then(() => true).catch(() => false);
  await page.evaluate(() => clearInterval(window.__keepInv));
  ok('invincibility crushes the car instead', crushed);

  // Stage clear.
  const cleared = await page.evaluate(async () => {
    const g = window.__fp.game;
    if (g.debug.player.state.mode !== 'run') return null;
    const before = g.run.stage;
    g.debug.player.state.z = g.run.goalZ + 1.0;
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: g.run.stage };
  });
  ok('crossing the goal advances the stage', cleared && cleared.after === cleared.before + 1,
    JSON.stringify(cleared));

  await page.close();
}

ok('no page errors anywhere', errs.length === 0, errs.join(' | ').slice(0, 300));

await browser.close();
console.log(`\n${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
