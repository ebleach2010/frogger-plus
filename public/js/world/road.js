// The road surface, its markings, and the raised strips you are safe on.
//
// On the wet look, and why there is no reflection pass in here:
//
// The obvious way to get a reflective wet road is a planar reflection -- mirror
// the camera under the road plane, re-render the scene into a texture, blend it
// back. It is also the wrong way here. It costs a second pass over every
// vehicle, and on a tile-based mobile GPU the bandwidth of an extra full scene
// render plus the post chain is exactly the thing that turns 60fps into 40.
//
// What actually reads as "wet asphalt at night" is much cheaper and, at this
// camera angle, more convincing:
//
//   1. A roughness map with hard-edged puddles (textures.js). Where roughness
//      drops to 0.05 the environment map mirrors the sky, so the road picks up
//      the sodium band along the horizon by itself, for free, in the normal
//      lighting pass.
//   2. Long additive smears of lamp colour laid flat on the tarmac under every
//      vehicle -- see traffic.js. At night on a wet road what you see is not a
//      sharp mirror image of a car, it is a vertical streak of red or white
//      light pulled along the surface. One additive quad per vehicle buys the
//      entire effect.
//   3. Normal-mapped ripples so the streaks and the sky reflection break up
//      rather than sitting flat.
//
// The result costs one extra transparent quad per car instead of a whole
// second scene render, and it does not fall apart when a truck is half off
// screen, which planar reflections famously do.

import * as THREE from 'three';
import { LANE_WIDTH } from '../config.js';
import { merge, slab } from '../engine/geo.js';
import { makeAsphalt, makeRoadPaint } from '../engine/textures.js';

/** How far past the play area the tarmac runs, so it never ends on screen. */
const OVERHANG_X = 95;
const OVERHANG_Z = 10;

const CONCRETE = 0x8d8a82;
const CONCRETE_DARK = 0x5f5d58;

/**
 * Builds the road for one stage.
 *
 * @param {object} stage   from stageConfig()
 * @param {number[]} centres  band centre Z positions, from bandCentres()
 * @param {THREE.Texture} environment
 * @returns {{ group: THREE.Group, dispose: () => void, surfaceY: number }}
 */
export function createRoad(stage, centres, environment) {
  const group = new THREE.Group();
  const bands = stage.bands;

  const depth = bands.reduce((sum, b) => sum + b.depth, 0);
  const wetness = stage.theme === 'flood' ? 1 : Math.min(1, 0.4 + stage.rain * 0.5);

  const asphalt = makeAsphalt({
    wetness,
    seed: 7 + stage.stage * 13,
    tint: stage.theme === 'junkyard' ? [0.36, 0.36, 0.39] : [0.46, 0.47, 0.52],
  });

  // ------------------------------------------------------------ surface ---

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(OVERHANG_X * 2, depth + OVERHANG_Z * 2, 1, 1),
    new THREE.MeshStandardMaterial({
      ...asphalt,
      metalness: 0.04,
      // envMapIntensity carries the whole wet look: it is what puts the sodium
      // horizon into the puddles.
      envMap: environment,
      envMapIntensity: 1.12,
      normalScale: new THREE.Vector2(0.32, 0.32),
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(0, 0, -depth / 2 + OVERHANG_Z / 2 - OVERHANG_Z / 2);
  surface.position.z = -depth / 2;
  surface.receiveShadow = true;
  group.add(surface);

  // ----------------------------------------------------------- markings ---

  const paint = makeRoadPaint({ seed: stage.stage });
  const markingParts = [];

  bands.forEach((band, i) => {
    if (band.kind !== 'lane') return;
    const z = centres[i];
    const edge = z + band.depth / 2;

    const next = bands[i + 1];
    const isBoundaryWithLane = next && next.kind === 'lane';
    if (!isBoundaryWithLane) return;

    // A flow reversal gets a solid double yellow; same-direction lanes get
    // dashes. This is the detail that makes a wide road legible from above.
    const reverses = next.direction !== band.direction;

    if (reverses) {
      for (const offset of [-0.14, 0.14]) {
        markingParts.push({
          geometry: new THREE.PlaneGeometry(OVERHANG_X * 2, 0.13),
          position: [0, 0.012, edge + offset],
          rotation: [-Math.PI / 2, 0, 0],
          color: 0xd8b638,
        });
      }
    } else {
      const dash = 2.6;
      const gap = 3.4;
      const span = OVERHANG_X * 2;
      const count = Math.floor(span / (dash + gap));
      for (let d = 0; d < count; d += 1) {
        markingParts.push({
          geometry: new THREE.PlaneGeometry(dash, 0.13),
          position: [-span / 2 + d * (dash + gap) + dash / 2, 0.012, edge],
          rotation: [-Math.PI / 2, 0, 0],
          color: 0xe6e2d4,
        });
      }
    }
  });

  // Solid edge lines where tarmac meets a safe strip.
  bands.forEach((band, i) => {
    if (band.kind === 'lane') return;
    const z = centres[i];
    for (const side of [-1, 1]) {
      const neighbour = bands[i + side];
      if (!neighbour || neighbour.kind !== 'lane') continue;
      markingParts.push({
        geometry: new THREE.PlaneGeometry(OVERHANG_X * 2, 0.16),
        position: [0, 0.012, z - side * (band.depth / 2 + 0.34)],
        rotation: [-Math.PI / 2, 0, 0],
        color: 0xe6e2d4,
      });
    }
  });

  if (markingParts.length) {
    const markings = new THREE.Mesh(
      merge(markingParts),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: paint,
        transparent: true,
        alphaMap: paint,
        roughness: 0.7,
        metalness: 0,
        envMap: environment,
        envMapIntensity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    markings.renderOrder = 1;
    group.add(markings);
  }

  // ------------------------------------------------- kerbs and medians ---

  const safeParts = [];
  bands.forEach((band, i) => {
    if (band.kind === 'lane') return;
    const z = centres[i];
    const height = band.kind === 'kerb' ? 0.22 : 0.17;
    const width = OVERHANG_X * 2;

    safeParts.push({
      geometry: slab(width, band.depth, height, { radius: 0.06, bevel: 0.03 }),
      position: [0, 0, z],
      color: CONCRETE,
    });

    // A darker lip on each side, so the step down to the tarmac reads.
    for (const side of [-1, 1]) {
      safeParts.push({
        geometry: slab(width, 0.16, height + 0.02, { radius: 0.03, bevel: 0.02 }),
        position: [0, 0, z + side * (band.depth / 2 - 0.08)],
        color: CONCRETE_DARK,
      });
    }
  });

  const safeStrips = new THREE.Mesh(
    merge(safeParts),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82 - wetness * 0.25,
      metalness: 0.02,
      envMap: environment,
      envMapIntensity: 0.9,
    }),
  );
  safeStrips.castShadow = false;
  safeStrips.receiveShadow = true;
  group.add(safeStrips);

  return {
    group,
    depth,
    /** Y of the walkable surface on a safe strip. */
    kerbY: 0.22,
    dispose() {
      surface.geometry.dispose();
      surface.material.dispose();
      safeStrips.geometry.dispose();
      safeStrips.material.dispose();
      for (const key of ['map', 'roughnessMap', 'normalMap']) asphalt[key]?.dispose();
      paint.dispose();
      group.traverse((o) => {
        if (o.isMesh && o !== surface && o !== safeStrips) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    },
  };
}

/** Where the lane bands sit, for traffic and collision. */
export function laneSlots(stage, centres) {
  const slots = [];
  stage.bands.forEach((band, i) => {
    if (band.kind !== 'lane') return;
    slots.push({
      z: centres[i],
      direction: band.direction,
      width: LANE_WIDTH,
      index: band.index,
    });
  });
  return slots;
}

/** The Z of the goal strip's centre. Crossing it clears the stage. */
export function goalZ(stage, centres) {
  const index = stage.bands.findIndex((b) => b.goal);
  return centres[index];
}
