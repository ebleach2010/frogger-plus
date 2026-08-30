// Boot. Everything that happens between the HTML parsing and the title card.
//
// Order matters here: renderer first (cheap, and it owns the canvas), then
// the sprite (a network fetch, the only one in the game), then the game
// world, then the loop. The loading screen stays up until the first frame
// has actually rendered, because a spinner that drops early into a black
// flash reads as a crash.

import * as THREE from 'three';
import { createRenderer } from './engine/renderer.js';
import { createPost } from './engine/post.js';
import { createControls } from './play/controls.js';
import { createCamera } from './play/camera.js';
import { loadSprite } from './play/sprite.js';
import { createHud } from './ui/hud.js';
import { createGame } from './game.js';

const canvas = document.getElementById('stage');
const hud = createHud();
hud.show('loading');

// ------------------------------------------------- placeholder character ---
// If sprites/runner.png is missing (it shipped, but belt and braces), the
// game still boots with a drawn stand-in: hi-vis vest, dark jeans, one view.
function placeholderSheet() {
  const w = 128;
  const h = 160;
  const canvas2d = document.createElement('canvas');
  canvas2d.width = w;
  canvas2d.height = h;
  const ctx = canvas2d.getContext('2d');

  ctx.clearRect(0, 0, w, h);
  // legs
  ctx.fillStyle = '#26303f';
  ctx.fillRect(w / 2 - 16, 92, 13, 52);
  ctx.fillRect(w / 2 + 3, 92, 13, 52);
  // boots
  ctx.fillStyle = '#15181d';
  ctx.fillRect(w / 2 - 18, 138, 17, 12);
  ctx.fillRect(w / 2 + 1, 138, 17, 12);
  // torso: the vest
  ctx.fillStyle = '#e8641b';
  ctx.fillRect(w / 2 - 20, 44, 40, 52);
  ctx.fillStyle = '#f9d64a';
  ctx.fillRect(w / 2 - 20, 58, 40, 6);
  ctx.fillRect(w / 2 - 20, 74, 40, 6);
  // arms
  ctx.fillStyle = '#1c222c';
  ctx.fillRect(w / 2 - 30, 46, 10, 42);
  ctx.fillRect(w / 2 + 20, 46, 10, 42);
  // head
  ctx.fillStyle = '#e8b48c';
  ctx.beginPath();
  ctx.arc(w / 2, 26, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a4552b';
  ctx.beginPath();
  ctx.arc(w / 2, 19, 14, Math.PI, Math.PI * 2);
  ctx.fill();

  return {
    canvas: canvas2d,
    manifest: {
      frameWidth: w,
      frameHeight: h,
      worldHeight: 1.75,
      feetInset: 0.05,
      directions: ['s'],
      mirror: true,
      animations: { run: { startRow: 0, frames: 1, fps: 1, loop: true } },
    },
  };
}

// -------------------------------------------------------------- boot -------

const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
const cameraRig = createCamera(window.innerWidth / window.innerHeight);
const post = createPost(renderer.renderer);
const controls = createControls(canvas);
controls.attach();

renderer.on('resize', (width, height, pixelRatio) => {
  cameraRig.setAspect(width / height);
  post.setSize(width, height, pixelRatio);
});

const { sprite, source } = await loadSprite('./sprites/runner', placeholderSheet);
if (source === 'placeholder') {
  console.warn('frogger-plus: sprites/runner.png missing, using the drawn stand-in');
}

const game = createGame({ scene, renderer, hud, sprite, cameraRig });
post.setSize(renderer.width, renderer.height, renderer.pixelRatio);
game.showTitle();

// ----------------------------------------------------------- debug pane ----

const debugging = new URLSearchParams(location.search).has('debug');
let debugEl = null;
if (debugging) {
  debugEl = document.createElement('pre');
  debugEl.className = 'debug';
  document.body.appendChild(debugEl);
  // The drives poke this to play the game headlessly.
  window.__fp = { game, renderer, controls, scene };
}

// -------------------------------------------------------------- loop -------

let last = performance.now();
let raf = 0;
let paused = false;
let frames = 0;
let fpsClock = 0;
let fps = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);

  const deltaMs = now - last;
  last = now;
  renderer.observeFrame(deltaMs);

  // Clamp: a backgrounded tab coming home must not hand physics a 4s step.
  const dt = Math.min(deltaMs / 1000, 0.05);

  game.update(dt, controls.read());
  post.render(scene, cameraRig.camera, now / 1000);

  frames += 1;
  fpsClock += deltaMs;
  if (fpsClock > 500) {
    fps = Math.round((frames * 1000) / fpsClock);
    frames = 0;
    fpsClock = 0;
  }

  if (debugEl) {
    const d = game.debug;
    const info = renderer.renderer.info;
    debugEl.textContent =
      `fps ${fps}  scale ${renderer.scale.toFixed(2)}  dpr ${renderer.pixelRatio.toFixed(1)}\n` +
      `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `cars ${d.traffic.liveCount}/${d.traffic.builtCount}  wrecks ${d.crush.wreckCount}` +
      `  fly ${d.crush.flyingCount}\n` +
      `splats ${d.gore.splatCount}  drops ${d.gore.dropletCount}  picks ${d.powerups.count}\n` +
      `mode ${d.player.state.mode}  stage ${game.run.stage}  lives ${game.run.lives}`;
  }
}

function start() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

// iOS suspends aggressively; a hidden tab burns no battery and a returning
// one resumes cleanly at the clamped dt.
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (paused) stop();
  else start();
});

// WebGL context loss is a WHEN on iOS, not an IF. Rebuild the current stage:
// every texture and geometry is procedural, so recovery is just doing boot
// again for the world while the run state (lives, score, stage) survives.
renderer.on('lost', () => {
  stop();
  hud.show('loading');
});
renderer.on('restored', () => {
  game.rebuild();
  hud.show(game.run.phase === 'playing' ? 'none' : game.run.phase === 'gameover' ? 'over' : 'title');
  start();
});

hud.show(game.run.phase === 'playing' ? 'none' : 'title');
start();
