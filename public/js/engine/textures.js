// Procedurally generated textures.
//
// Nothing is downloaded. Every surface in this game is drawn into a canvas at
// boot and uploaded as a texture. That is a deliberate trade:
//
//   + Nothing to license, nothing to host, nothing to 404. The whole game is
//     the repo, which matters because it ships to GitHub Pages as flat files.
//   + Wetness, grime and palette become parameters instead of new asset files,
//     so the flooded stage and the junkyard reuse the highway's road with
//     different numbers rather than three sets of hand-painted maps.
//   - It will not beat a photoscanned 8K asphalt material, and it is not
//     trying to. At a 46-degree camera 15 metres up, the road occupies most of
//     the screen but every square metre of it is small, blurred by rain and
//     graded. What sells it at that distance is the ROUGHNESS variation --
//     where the water sits and where it does not -- far more than the albedo.
//     So most of the effort below goes into the puddle mask.
//
// All maps are 512px and tiled. At this camera distance a 1024 map is
// indistinguishable and costs four times the generation time, which on a phone
// is a full second of staring at a loading spinner.

import * as THREE from 'three';

const SIZE = 512;

// ------------------------------------------------------------ noise -------

/** Deterministic hash. Same seed, same road, every run and every device. */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Value noise that wraps cleanly at `period`, so the texture tiles. */
function tileNoise(x, y, period, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);

  const u = smooth(xf);
  const v = smooth(yf);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal sum of tiling noise. `base` is the cell count at the first octave. */
function fbm(x, y, base, octaves, seed) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = base;

  for (let o = 0; o < octaves; o += 1) {
    sum += tileNoise(x * freq, y * freq, freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// ----------------------------------------------------------- helpers ------

function makeCanvas(size = SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toTexture(canvas, { repeat = 1, srgb = false, aniso = 8 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = aniso;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Derives a tangent-space normal map from a height field by central
 * differences. Cheaper and more consistent than hand-authoring one, and it
 * always agrees with the roughness map it was derived alongside.
 */
function heightToNormal(height, size, strength) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(size, size);

  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;

      // Normalise (-dx, -dy, 1) into 0..255.
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out.data[i + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

// ------------------------------------------------------------ asphalt -----

/**
 * The road. Returns albedo, normal, and a roughness map whose dark areas are
 * standing water.
 *
 * `wetness` 0..1 grows the puddles and drops the base roughness, which is how
 * the same generator produces a damp highway and a flooded street.
 */
export function makeAsphalt({ wetness = 0.6, seed = 7, tint = [0.34, 0.35, 0.38] } = {}) {
  const size = SIZE;
  const albedo = makeCanvas(size);
  const aCtx = albedo.getContext('2d');
  const aImg = aCtx.createImageData(size, size);

  const rough = makeCanvas(size);
  const rCtx = rough.getContext('2d');
  const rImg = rCtx.createImageData(size, size);

  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;

      // Aggregate: fine high-frequency speckle, the chips in the tarmac.
      const grit = fbm(u, v, 64, 3, seed);
      // Patchwork: broad tonal variation from repairs and wear.
      const patch = fbm(u, v, 4, 4, seed + 31);
      // Cracks: ridged noise, thin and dark.
      const crackField = Math.abs(fbm(u, v, 8, 4, seed + 77) - 0.5) * 2;
      const crack = crackField < 0.055 ? 1 - crackField / 0.055 : 0;

      const shade = 0.66 + grit * 0.5 + (patch - 0.5) * 0.34 - crack * 0.42;

      aImg.data[i] = Math.max(0, Math.min(255, tint[0] * 255 * shade));
      aImg.data[i + 1] = Math.max(0, Math.min(255, tint[1] * 255 * shade));
      aImg.data[i + 2] = Math.max(0, Math.min(255, tint[2] * 255 * shade));
      aImg.data[i + 3] = 255;

      height[y * size + x] = grit * 0.65 + patch * 0.2 - crack * 0.9;

      // Puddles. Broad low-frequency blobs, thresholded so they have an edge
      // rather than fading out -- standing water has a shoreline, and that
      // hard boundary between mirror and matte is the whole effect.
      const pool = fbm(u, v, 3, 3, seed + 155);
      const threshold = 0.62 - wetness * 0.3;
      const inPool = pool < threshold ? Math.min(1, (threshold - pool) / 0.09) : 0;

      // Roughness: dry tarmac is ~0.92, standing water is ~0.05.
      const dryRough = 0.94 - grit * 0.16 - wetness * 0.22;
      const r = dryRough * (1 - inPool) + 0.05 * inPool;

      const rv = Math.max(0, Math.min(255, r * 255));
      rImg.data[i] = rv;
      rImg.data[i + 1] = rv;
      rImg.data[i + 2] = rv;
      rImg.data[i + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: toTexture(albedo, { repeat: 9, srgb: true }),
    roughnessMap: toTexture(rough, { repeat: 9 }),
    normalMap: toTexture(heightToNormal(height, size, 26), { repeat: 9 }),
  };
}

// -------------------------------------------------------------- grime -----

/**
 * The dirt layer for vehicles. Grubby streaks that run down the body, plus
 * broad haze -- the reference cars are all filthy, and a clean car in that
 * frame looks like it belongs to a different game.
 */
export function makeGrime({ seed = 3, strength = 1 } = {}) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;

      // Vertical streaking: stretch the noise along V so dirt runs downward.
      const streak = fbm(u * 3, v * 0.35, 8, 4, seed);
      const haze = fbm(u, v, 3, 3, seed + 19);
      const dirt = Math.min(1, Math.max(0, (streak * 0.7 + haze * 0.5 - 0.35) * strength));

      // Sepia-grey road filth.
      const base = 1 - dirt * 0.55;
      img.data[i] = 255 * base * 1.02;
      img.data[i + 1] = 255 * base * 0.99;
      img.data[i + 2] = 255 * base * 0.93;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { repeat: 1, srgb: true, aniso: 4 });
}

// --------------------------------------------------------------- misc -----

/** A soft radial falloff. The workhorse for light pools, blob shadows, glows. */
export function makeRadial({ inner = '#ffffff', outer = 'rgba(255,255,255,0)', stops = null, size = 128 } = {}) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

  if (stops) {
    for (const [offset, color] of stops) g.addColorStop(offset, color);
  } else {
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
  }

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A headlight pool: a stretched cone of light laid flat on the road. Cheaper
 * than a real spotlight by a wide margin and, at this camera angle, more
 * convincing -- what you actually see of a car's headlights from above is the
 * shape they throw on the tarmac.
 */
export function makeLightCone(size = 256) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const g = ctx.createLinearGradient(0, size, 0, 0);
  g.addColorStop(0, 'rgba(255, 226, 170, 0.92)');
  g.addColorStop(0.35, 'rgba(255, 214, 150, 0.42)');
  g.addColorStop(1, 'rgba(255, 200, 130, 0)');

  // A triangle fanning out from the bottom edge, with soft shoulders.
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(size * 0.42, size);
  ctx.lineTo(size * 0.02, 0);
  ctx.lineTo(size * 0.98, 0);
  ctx.lineTo(size * 0.58, size);
  ctx.closePath();
  ctx.fill();

  // Blur the edges so the cone has no hard sides.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, size, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.28, 'rgba(0,0,0,1)');
  fade.addColorStop(0.72, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Painted lane markings, drawn as a strip texture rather than geometry. */
export function makeRoadPaint({ seed = 12 } = {}) {
  const size = 256;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = '#e8e4d6';
  ctx.fillRect(0, 0, size, size);

  // Worn away in patches, so fresh paint never looks printed on.
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wear = fbm(x / size, y / size, 6, 3, seed);
      const i = (y * size + x) * 4;
      img.data[i + 3] = Math.max(0, Math.min(255, (wear * 1.7 - 0.35) * 255));
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
