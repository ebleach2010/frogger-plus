// Sprite-sheet character rendering.
//
// Eric is supplying the runner as a sprite sheet, so the character is a 2D
// animated sprite living in a lit 3D world. The whole difficulty of that is
// stopping it from looking pasted on. Four things do the work:
//
//   1. The quad is TILTED, not billboarded. The camera pitch is fixed at 46
//      degrees, so the sprite plane is tilted to match it once and never
//      turns. A true billboard would rotate as the camera drifts and the
//      character would visibly swim against the road. Tilted also means the
//      sprite's feet meet the tarmac at the right place.
//   2. It takes the scene's fog. Without fog the character stays crisp while
//      the world behind him hazes out, which is the single biggest tell.
//   3. It gets a contact shadow of its own -- a soft blob decal on the road.
//      A sprite cannot cast a real shadow map convincingly, but the eye is
//      really asking "is he touching the ground", and a blob answers that.
//   4. Alpha TEST, not alpha blend, for the body. Blended transparency has to
//      be depth-sorted against the rain, the light cones and the puddle
//      quads, and it will get that wrong at some point. An alpha-tested
//      sprite writes depth like solid geometry and sorts correctly for free.
//      The edge is slightly harder, which at this distance in rain is fine.
//
// The loader is deliberately forgiving about what sheet it is handed. See
// docs/SPRITES.md for the format; the short version is that it copes with 8,
// 5, 4 or 1 direction rows and fills in the gaps by picking the nearest
// available heading and mirroring when it is allowed to.

import * as THREE from 'three';

/** Heading angles for each direction name, radians, measured on the XZ plane.
 *  'n' is away from the camera (-Z); 'e' is +X. */
const DIRECTION_ANGLES = {
  n: 0,
  ne: Math.PI * 0.25,
  e: Math.PI * 0.5,
  se: Math.PI * 0.75,
  s: Math.PI,
  sw: Math.PI * 1.25,
  w: Math.PI * 1.5,
  nw: Math.PI * 1.75,
};

/** A manifest direction is either a compass name or a number in degrees.
 *  Eric's turnaround sheet uses degrees, fifteen rows of them. */
function angleOf(direction) {
  if (typeof direction === 'number') return (direction * Math.PI) / 180;
  return DIRECTION_ANGLES[direction];
}

/** Signed shortest angular difference, in radians. */
function angleDelta(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Resolves a heading to a sheet row plus whether to mirror horizontally.
 *
 * With a full eight-direction sheet this always finds an exact row. With a
 * five-row right-facing sheet and mirror enabled it finds the mirrored row for
 * anything heading left. With a single row it always returns row 0 and mirrors
 * on the sign of the heading, which is the classic side-scroller behaviour and
 * is what a side-view-only sheet wants.
 */
export function resolveDirection(directions, mirror, heading) {
  if (directions.length === 1) {
    const facingLeft = Math.sin(heading) < -0.05;
    return { row: 0, mirror: mirror && facingLeft };
  }

  let best = { row: 0, mirror: false, error: Infinity };

  directions.forEach((name, row) => {
    const angle = angleOf(name);
    if (angle === undefined) return;

    const error = Math.abs(angleDelta(angle, heading));
    if (error < best.error) best = { row, mirror: false, error };

    if (mirror) {
      // Mirroring about the north-south axis maps a heading to its reflection.
      const mirrored = -angle;
      const mirroredError = Math.abs(angleDelta(mirrored, heading));
      if (mirroredError < best.error) best = { row, mirror: true, error: mirroredError };
    }
  });

  return { row: best.row, mirror: best.mirror };
}

/** Fills in the defaults so a hand-written manifest can be terse. */
export function normaliseManifest(raw) {
  const manifest = {
    frameWidth: 128,
    frameHeight: 160,
    worldHeight: 1.75,
    feetInset: 0.04,
    directions: ['s'],
    mirror: true,
    animations: {},
    ...raw,
  };

  if (!manifest.animations.run) {
    manifest.animations.run = { startRow: 0, frames: 1, fps: 12, loop: true };
  }
  if (!manifest.animations.idle) {
    manifest.animations.idle = manifest.animations.run;
  }

  for (const anim of Object.values(manifest.animations)) {
    anim.startRow = anim.startRow || 0;
    anim.frames = Math.max(1, anim.frames || 1);
    anim.fps = anim.fps || 12;
    anim.loop = anim.loop !== false;
  }

  return manifest;
}

/**
 * Creates the character sprite.
 *
 * @param {HTMLCanvasElement|HTMLImageElement} image  the sheet
 * @param {object} manifest  see docs/SPRITES.md
 */
export function createSprite(image, manifest) {
  const spec = normaliseManifest(manifest);

  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const sheetCols = Math.max(1, Math.floor(image.width / spec.frameWidth));
  const sheetRows = Math.max(1, Math.floor(image.height / spec.frameHeight));

  texture.repeat.set(1 / sheetCols, 1 / sheetRows);

  const aspect = spec.frameWidth / spec.frameHeight;
  const height = spec.worldHeight;
  const width = height * aspect;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: false,
    alphaTest: 0.42,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    // Fog on, so he sits in the same air as the rest of the scene.
    fog: true,
  });

  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const group = new THREE.Group();
  group.add(mesh);

  // Pivot at the feet: lift the quad by half its height, less the transparent
  // margin the artist left under the shoes.
  mesh.position.y = (height / 2) * (1 - spec.feetInset * 2) + height * spec.feetInset;

  // Tilt to face a camera that is always at the same pitch.
  const tilt = THREE.MathUtils.degToRad(90 - 46);
  mesh.rotation.x = -tilt;

  let animation = 'run';
  let frame = 0;
  let elapsed = 0;
  let row = 0;
  let mirrored = false;

  function applyFrame() {
    const anim = spec.animations[animation] || spec.animations.run;
    const col = frame % Math.min(anim.frames, sheetCols);
    const sheetRow = Math.min(sheetRows - 1, anim.startRow + row);

    // Mirroring flips the U axis; the offset has to shift by one cell to
    // compensate or the frame slides sideways.
    if (mirrored) {
      texture.repeat.x = -1 / sheetCols;
      texture.offset.x = (col + 1) / sheetCols;
    } else {
      texture.repeat.x = 1 / sheetCols;
      texture.offset.x = col / sheetCols;
    }

    // Canvas rows run top-down, texture V runs bottom-up.
    texture.offset.y = 1 - (sheetRow + 1) / sheetRows;
  }

  applyFrame();

  return {
    group,
    mesh,
    material,
    spec,
    sheet: { cols: sheetCols, rows: sheetRows },

    /** @param {number} heading radians on the XZ plane, 0 = away from camera */
    setHeading(heading) {
      const resolved = resolveDirection(spec.directions, spec.mirror, heading);
      if (resolved.row !== row || resolved.mirror !== mirrored) {
        row = resolved.row;
        mirrored = resolved.mirror;
        applyFrame();
      }
    },

    play(name) {
      if (animation === name) return;
      animation = spec.animations[name] ? name : 'run';
      frame = 0;
      elapsed = 0;
      applyFrame();
    },

    update(dt, speedScale = 1) {
      const anim = spec.animations[animation] || spec.animations.run;
      if (anim.frames <= 1) return;

      elapsed += dt * anim.fps * speedScale;
      if (elapsed >= 1) {
        const advance = Math.floor(elapsed);
        elapsed -= advance;
        const next = frame + advance;
        frame = anim.loop ? next % anim.frames : Math.min(next, anim.frames - 1);
        applyFrame();
      }
    },

    get currentAnimation() { return animation; },
    get currentFrame() { return frame; },
    get currentRow() { return row; },
    get isMirrored() { return mirrored; },

    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/**
 * Loads a sheet and its manifest from a URL pair, falling back to the
 * procedural placeholder if either is missing.
 *
 * This is what lets the game ship and play before Eric's artwork lands: drop
 * `runner.png` and `runner.json` into public/sprites/ and it picks them up
 * with no code change.
 */
export async function loadSprite(baseUrl, fallback) {
  try {
    const response = await fetch(`${baseUrl}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`no manifest (${response.status})`);
    const manifest = await response.json();

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('sheet failed to load'));
      img.src = manifest.image ? new URL(manifest.image, new URL(`${baseUrl}.json`, location.href)).href : `${baseUrl}.png`;
    });

    return { sprite: createSprite(image, manifest), source: 'supplied' };
  } catch {
    const made = fallback();
    return { sprite: createSprite(made.canvas, made.manifest), source: 'placeholder' };
  }
}
