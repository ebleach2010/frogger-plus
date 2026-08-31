// Renderer setup, resolution policy, and context-loss recovery.
//
// The three things in here that actually decide whether this game is playable
// on a phone:
//
//   1. DPR is capped. An iPhone reports devicePixelRatio 3. Rendering a
//      lit, shadowed, post-processed scene at 3x on a 390x844 screen means
//      1170x2532 = 2.96 million pixels per frame, and on a tile-based mobile
//      GPU the post chain reads and writes that whole buffer several times.
//      Capping at 2 costs almost nothing visually at arm's length and gives
//      back 55% of the fill cost. This is the single biggest win available.
//
//   2. Resolution adapts. If frames are consistently slow we render smaller
//      and let the browser scale the canvas up. A soft 0.75x frame at a
//      steady 60fps reads as far better than a sharp one at a lurching 34.
//      The scale only moves on a sustained trend, never on one bad frame,
//      because oscillating resolution is more distracting than either state.
//
//   3. Context loss is handled. iOS Safari drops WebGL contexts when memory
//      gets tight or the app is backgrounded for a while — this is normal,
//      not a bug, and a game that shows a permanently black screen after the
//      player takes a phone call is broken. We listen and rebuild.

import * as THREE from 'three';

const DPR_CAP = 2;

/** Frame time in ms above which we start shedding resolution. 60fps = 16.7ms. */
const SLOW_MS = 21;
/** Frame time below which we try to claw resolution back. */
const FAST_MS = 13.5;

const MIN_SCALE = 0.6;
const MAX_SCALE = 1;
const SCALE_STEP = 0.08;

/** Frames of consistent evidence before the scale is allowed to move. */
const PATIENCE = 45;

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // the post chain resolves edges; MSAA on top is wasted bandwidth
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    // Needed so screenshot tooling can read the canvas after a frame.
    preserveDrawingBuffer: true,
  });

  renderer.setClearColor(0x05070b, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  let scale = MAX_SCALE;
  let slowFrames = 0;
  let fastFrames = 0;
  let width = 1;
  let height = 1;
  const listeners = { resize: [], lost: [], restored: [] };

  function baseDpr() {
    return Math.min(DPR_CAP, window.devicePixelRatio || 1);
  }

  function applySize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(baseDpr() * scale);
    renderer.setSize(width, height, false);

    // setSize(.., false) leaves the CSS size alone, which is what we want:
    // the canvas is pinned to the viewport by game.css and only the backing
    // store changes when the scale moves.
    for (const fn of listeners.resize) fn(width, height, renderer.getPixelRatio());
  }

  /** Feed every frame's duration in; the scale moves only on a sustained trend. */
  function observeFrame(deltaMs) {
    if (deltaMs > SLOW_MS) {
      slowFrames += 1;
      fastFrames = 0;
    } else if (deltaMs < FAST_MS) {
      fastFrames += 1;
      slowFrames = 0;
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
      fastFrames = Math.max(0, fastFrames - 1);
    }

    if (slowFrames >= PATIENCE && scale > MIN_SCALE) {
      scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
      slowFrames = 0;
      applySize();
    } else if (fastFrames >= PATIENCE * 3 && scale < MAX_SCALE) {
      // Reclaiming is deliberately three times more reluctant than shedding.
      scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
      fastFrames = 0;
      applySize();
    }
  }

  function onLost(event) {
    // Without preventDefault the context is gone for good.
    event.preventDefault();
    for (const fn of listeners.lost) fn();
  }

  function onRestored() {
    applySize();
    for (const fn of listeners.restored) fn();
  }

  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  // visualViewport catches the iOS Safari toolbar sliding away, which resize
  // alone misses and which otherwise leaves a stale letterbox at the bottom.
  window.addEventListener('resize', applySize);
  window.visualViewport?.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => setTimeout(applySize, 120));

  applySize();

  return {
    renderer,
    get width() { return width; },
    get height() { return height; },
    get scale() { return scale; },
    get pixelRatio() { return renderer.getPixelRatio(); },
    observeFrame,
    applySize,
    on(event, fn) { listeners[event]?.push(fn); },
    /** Forces a specific scale. Used by the drives to make shots deterministic. */
    lockScale(value) {
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
      applySize();
    },
    dispose() {
      window.removeEventListener('resize', applySize);
      window.visualViewport?.removeEventListener('resize', applySize);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      renderer.dispose();
    },
  };
}
