// Procedural vehicles.
//
// Every vehicle in the game is built here, once, at boot. Each kind bakes down
// to two geometries: the body (one draw call, vertex-coloured so per-car paint
// still works) and the lamps (one draw call, unlit so they read as emitters
// and feed the bloom pass).
//
// Proportions are real. A lane is 3.6m and a sedan is 4.6m long and 1.85m
// wide, because once the scale is honest the camera height, the player's
// stride and the gaps between cars all fall into place without fudging. Get
// this wrong and everything downstream feels subtly like a toy.
//
// Convention: vehicles are modelled nose-toward +X and are turned 180 degrees
// when they travel the other way, so headlights always lead.

import * as THREE from 'three';
import { slab, wheel, merge } from '../engine/geo.js';

/** Near-black parts shrug off the per-car paint colour. See geo.js merge(). */
const TYRE = 0x0d0e10;
const GLASS = 0x191d24;
const TRIM = 0x2b2d32;
const CHROME = 0x6e737c;
const BED = 0x33353a;

/**
 * The grimy New York palette off the reference stills. Nothing saturated,
 * nothing new-looking. Taxi yellow is in there once because the city needs it.
 */
export const PAINTS = [
  0xb4bac0, 0x97a0ab, 0xd0cabe, 0x76808c, 0x5a626e,
  0xa87a5a, 0x88987f, 0x48597a, 0xc2bcae, 0x6e6152,
  0xe0b83a, 0xa8604e, 0x718090, 0xb5ab9a,
];

function wheelsFor(length, width, radius, inset = 0.06) {
  const axle = length * 0.33;
  const halfW = width / 2 - inset;
  const w = wheel(radius, 0.28);
  return [
    { geometry: w, position: [axle, radius, halfW], color: TYRE },
    { geometry: w, position: [axle, radius, -halfW], color: TYRE },
    { geometry: w, position: [-axle, radius, halfW], color: TYRE },
    { geometry: w, position: [-axle, radius, -halfW], color: TYRE },
  ];
}

/** Head and tail lamps, returned as a separate unlit geometry. */
function lampsFor(length, width, height, { warm = 0xfff0cf, red = 0xff2a1e } = {}) {
  const hl = length / 2;
  const inset = width * 0.34;
  const lamp = slab(0.14, 0.34, 0.2, { radius: 0.06, bevel: 0.02 });

  return merge([
    { geometry: lamp, position: [hl - 0.05, height, inset], color: warm },
    { geometry: lamp, position: [hl - 0.05, height, -inset], color: warm },
    { geometry: lamp, position: [-hl + 0.05, height, inset], color: red },
    { geometry: lamp, position: [-hl + 0.05, height, -inset], color: red },
  ]);
}

function sedan() {
  const L = 4.62;
  const W = 1.86;
  const wheelR = 0.33;
  const sill = 0.36;

  const body = merge([
    // Lower body, full length.
    { geometry: slab(L, W, 0.66, { radius: 0.5 }), position: [0, sill, 0] },
    // Bonnet and boot are a touch narrower, which gives the shoulder line.
    { geometry: slab(L * 0.99, W * 0.94, 0.16, { radius: 0.5 }), position: [0, sill + 0.62, 0] },
    // Cabin, set back and tapered so the roof is smaller than the waist.
    { geometry: slab(L * 0.46, W * 0.9, 0.44, { radius: 0.34, taper: 0.16 }), position: [-0.24, sill + 0.66, 0] },
    // Glass, sitting just proud of the cabin at each end.
    { geometry: slab(0.1, W * 0.8, 0.36, { radius: 0.05, bevel: 0.01 }), position: [-0.24 + L * 0.23, sill + 0.7, 0], rotation: [0, 0, -0.42], color: GLASS },
    { geometry: slab(0.1, W * 0.78, 0.34, { radius: 0.05, bevel: 0.01 }), position: [-0.24 - L * 0.23, sill + 0.7, 0], rotation: [0, 0, 0.5], color: GLASS },
    // Side glazing, one thin panel each side.
    { geometry: slab(L * 0.4, 0.04, 0.3, { radius: 0.02, bevel: 0.005 }), position: [-0.26, sill + 0.74, W * 0.44], color: GLASS },
    { geometry: slab(L * 0.4, 0.04, 0.3, { radius: 0.02, bevel: 0.005 }), position: [-0.26, sill + 0.74, -W * 0.44], color: GLASS },
    // Bumpers.
    { geometry: slab(0.24, W * 0.98, 0.26, { radius: 0.1 }), position: [L / 2 - 0.1, sill + 0.06, 0], color: TRIM },
    { geometry: slab(0.24, W * 0.98, 0.26, { radius: 0.1 }), position: [-L / 2 + 0.1, sill + 0.06, 0], color: TRIM },
    ...wheelsFor(L, W, wheelR),
  ]);

  return { body, lights: lampsFor(L, W, sill + 0.42), size: { length: L, width: W, height: 1.48 }, heavy: false };
}

function suv() {
  const L = 4.94;
  const W = 1.98;
  const wheelR = 0.38;
  const sill = 0.42;

  const body = merge([
    { geometry: slab(L, W, 0.82, { radius: 0.42 }), position: [0, sill, 0] },
    { geometry: slab(L * 0.66, W * 0.95, 0.56, { radius: 0.32, taper: 0.1 }), position: [-0.36, sill + 0.78, 0] },
    { geometry: slab(0.1, W * 0.84, 0.44, { radius: 0.05, bevel: 0.01 }), position: [-0.36 + L * 0.32, sill + 0.82, 0], rotation: [0, 0, -0.34], color: GLASS },
    { geometry: slab(0.1, W * 0.84, 0.46, { radius: 0.05, bevel: 0.01 }), position: [-0.36 - L * 0.32, sill + 0.82, 0], rotation: [0, 0, 0.16], color: GLASS },
    { geometry: slab(L * 0.55, 0.04, 0.4, { radius: 0.02, bevel: 0.005 }), position: [-0.38, sill + 0.86, W * 0.47], color: GLASS },
    { geometry: slab(L * 0.55, 0.04, 0.4, { radius: 0.02, bevel: 0.005 }), position: [-0.38, sill + 0.86, -W * 0.47], color: GLASS },
    // Roof rails.
    { geometry: slab(L * 0.58, 0.07, 0.06, { radius: 0.03, bevel: 0.01 }), position: [-0.36, sill + 1.35, W * 0.34], color: TRIM },
    { geometry: slab(L * 0.58, 0.07, 0.06, { radius: 0.03, bevel: 0.01 }), position: [-0.36, sill + 1.35, -W * 0.34], color: TRIM },
    { geometry: slab(0.28, W, 0.3, { radius: 0.1 }), position: [L / 2 - 0.12, sill + 0.08, 0], color: TRIM },
    { geometry: slab(0.28, W, 0.3, { radius: 0.1 }), position: [-L / 2 + 0.12, sill + 0.08, 0], color: TRIM },
    ...wheelsFor(L, W, wheelR),
  ]);

  return { body, lights: lampsFor(L, W, sill + 0.56), size: { length: L, width: W, height: 1.82 }, heavy: false };
}

function pickup() {
  const L = 5.64;
  const W = 2.02;
  const wheelR = 0.4;
  const sill = 0.46;

  const body = merge([
    { geometry: slab(L, W, 0.74, { radius: 0.34 }), position: [0, sill, 0] },
    // Cab, forward of centre.
    { geometry: slab(L * 0.34, W * 0.94, 0.62, { radius: 0.26, taper: 0.12 }), position: [L * 0.12, sill + 0.7, 0] },
    { geometry: slab(0.1, W * 0.82, 0.5, { radius: 0.05, bevel: 0.01 }), position: [L * 0.12 + L * 0.17, sill + 0.74, 0], rotation: [0, 0, -0.36], color: GLASS },
    { geometry: slab(0.1, W * 0.82, 0.48, { radius: 0.05, bevel: 0.01 }), position: [L * 0.12 - L * 0.17, sill + 0.74, 0], rotation: [0, 0, 0.1], color: GLASS },
    // Open bed: a floor plus four low walls, so it reads as hollow from above.
    { geometry: slab(L * 0.44, W * 0.96, 0.08, { radius: 0.1 }), position: [-L * 0.24, sill + 0.72, 0], color: BED },
    { geometry: slab(L * 0.44, 0.1, 0.36, { radius: 0.04 }), position: [-L * 0.24, sill + 0.74, W * 0.45], color: TRIM },
    { geometry: slab(L * 0.44, 0.1, 0.36, { radius: 0.04 }), position: [-L * 0.24, sill + 0.74, -W * 0.45], color: TRIM },
    { geometry: slab(0.1, W * 0.96, 0.36, { radius: 0.04 }), position: [-L / 2 + 0.08, sill + 0.74, 0], color: TRIM },
    { geometry: slab(0.3, W, 0.32, { radius: 0.1 }), position: [L / 2 - 0.12, sill + 0.1, 0], color: CHROME },
    { geometry: slab(0.3, W, 0.32, { radius: 0.1 }), position: [-L / 2 + 0.12, sill + 0.1, 0], color: CHROME },
    ...wheelsFor(L, W, wheelR, 0.02),
  ]);

  return { body, lights: lampsFor(L, W, sill + 0.5), size: { length: L, width: W, height: 1.86 }, heavy: false };
}

function van() {
  const L = 5.5;
  const W = 2.04;
  const wheelR = 0.38;
  const sill = 0.42;

  const body = merge([
    { geometry: slab(L, W, 1.6, { radius: 0.3 }), position: [0, sill, 0] },
    // Raked nose.
    { geometry: slab(0.12, W * 0.86, 0.7, { radius: 0.05, bevel: 0.01 }), position: [L * 0.42, sill + 0.82, 0], rotation: [0, 0, -0.3], color: GLASS },
    { geometry: slab(L * 0.4, 0.04, 0.34, { radius: 0.02, bevel: 0.005 }), position: [L * 0.18, sill + 0.98, W * 0.48], color: GLASS },
    { geometry: slab(L * 0.4, 0.04, 0.34, { radius: 0.02, bevel: 0.005 }), position: [L * 0.18, sill + 0.98, -W * 0.48], color: GLASS },
    // Body crease along the flank; catches a highlight and breaks up the slab.
    { geometry: slab(L * 0.86, 0.05, 0.1, { radius: 0.02, bevel: 0.01 }), position: [-0.1, sill + 0.62, W * 0.5], color: TRIM },
    { geometry: slab(L * 0.86, 0.05, 0.1, { radius: 0.02, bevel: 0.01 }), position: [-0.1, sill + 0.62, -W * 0.5], color: TRIM },
    { geometry: slab(0.26, W, 0.3, { radius: 0.1 }), position: [L / 2 - 0.1, sill + 0.08, 0], color: TRIM },
    ...wheelsFor(L, W, wheelR),
  ]);

  return { body, lights: lampsFor(L, W, sill + 0.44), size: { length: L, width: W, height: 2.24 }, heavy: false };
}

function boxTruck() {
  const L = 8.3;
  const W = 2.48;
  const wheelR = 0.46;
  const sill = 0.62;

  const body = merge([
    // Cab.
    { geometry: slab(L * 0.26, W * 0.96, 1.6, { radius: 0.26 }), position: [L * 0.35, sill, 0] },
    { geometry: slab(0.12, W * 0.84, 0.66, { radius: 0.05, bevel: 0.01 }), position: [L * 0.35 + L * 0.11, sill + 0.86, 0], rotation: [0, 0, -0.22], color: GLASS },
    // Cargo box, taller and wider than the cab.
    { geometry: slab(L * 0.68, W, 2.34, { radius: 0.14, bevel: 0.03 }), position: [-L * 0.14, sill + 0.06, 0] },
    // Corrugation: three shallow ribs down the flanks.
    ...[-0.28, 0, 0.28].map((k) => ({
      geometry: slab(L * 0.64, 0.04, 0.12, { radius: 0.02, bevel: 0.01 }),
      position: [-L * 0.14, sill + 1.3 + k * 2.4, W * 0.51],
      color: TRIM,
    })),
    ...[-0.28, 0, 0.28].map((k) => ({
      geometry: slab(L * 0.64, 0.04, 0.12, { radius: 0.02, bevel: 0.01 }),
      position: [-L * 0.14, sill + 1.3 + k * 2.4, -W * 0.51],
      color: TRIM,
    })),
    { geometry: slab(0.3, W, 0.4, { radius: 0.08 }), position: [L / 2 - 0.12, sill - 0.28, 0], color: TRIM },
    // Six wheels: one axle up front, a pair at the back.
    { geometry: wheel(wheelR, 0.32), position: [L * 0.33, wheelR, W / 2 - 0.06], color: TYRE },
    { geometry: wheel(wheelR, 0.32), position: [L * 0.33, wheelR, -W / 2 + 0.06], color: TYRE },
    { geometry: wheel(wheelR, 0.36), position: [-L * 0.26, wheelR, W / 2 - 0.06], color: TYRE },
    { geometry: wheel(wheelR, 0.36), position: [-L * 0.26, wheelR, -W / 2 + 0.06], color: TYRE },
    { geometry: wheel(wheelR, 0.36), position: [-L * 0.36, wheelR, W / 2 - 0.06], color: TYRE },
    { geometry: wheel(wheelR, 0.36), position: [-L * 0.36, wheelR, -W / 2 + 0.06], color: TYRE },
  ]);

  return { body, lights: lampsFor(L, W, sill + 0.2), size: { length: L, width: W, height: 3.02 }, heavy: true };
}

function bus() {
  const L = 11.4;
  const W = 2.55;
  const wheelR = 0.5;
  const sill = 0.68;

  const parts = [
    { geometry: slab(L, W, 2.3, { radius: 0.5 }), position: [0, sill, 0] },
    // Windscreen and a long band of side glass -- the read that says "bus".
    { geometry: slab(0.12, W * 0.88, 1.0, { radius: 0.06, bevel: 0.01 }), position: [L * 0.48, sill + 0.9, 0], rotation: [0, 0, -0.12], color: GLASS },
    { geometry: slab(L * 0.86, 0.05, 0.86, { radius: 0.04, bevel: 0.01 }), position: [-L * 0.04, sill + 1.24, W * 0.51], color: GLASS },
    { geometry: slab(L * 0.86, 0.05, 0.86, { radius: 0.04, bevel: 0.01 }), position: [-L * 0.04, sill + 1.24, -W * 0.51], color: GLASS },
    { geometry: slab(0.12, W * 0.88, 0.9, { radius: 0.06, bevel: 0.01 }), position: [-L * 0.49, sill + 1.1, 0], color: GLASS },
    // Roof hatches and vents.
    { geometry: slab(1.0, 1.1, 0.12, { radius: 0.08 }), position: [L * 0.2, sill + 2.28, 0], color: TRIM },
    { geometry: slab(1.4, 1.3, 0.16, { radius: 0.08 }), position: [-L * 0.22, sill + 2.28, 0], color: TRIM },
    { geometry: slab(L, W * 1.01, 0.14, { radius: 0.5 }), position: [0, sill + 0.5, 0], color: TRIM },
  ];

  for (const x of [L * 0.36, -L * 0.24, -L * 0.36]) {
    parts.push(
      { geometry: wheel(wheelR, 0.34), position: [x, wheelR, W / 2 - 0.08], color: TYRE },
      { geometry: wheel(wheelR, 0.34), position: [x, wheelR, -W / 2 + 0.08], color: TYRE },
    );
  }

  return { body: merge(parts), lights: lampsFor(L, W, sill + 0.3), size: { length: L, width: W, height: 2.98 }, heavy: true };
}

function garbageTruck() {
  const L = 9.1;
  const W = 2.52;
  const wheelR = 0.5;
  const sill = 0.66;

  const parts = [
    { geometry: slab(L * 0.24, W * 0.96, 1.7, { radius: 0.24 }), position: [L * 0.36, sill, 0] },
    { geometry: slab(0.12, W * 0.82, 0.68, { radius: 0.05, bevel: 0.01 }), position: [L * 0.36 + L * 0.1, sill + 0.92, 0], rotation: [0, 0, -0.2], color: GLASS },
    // Hopper: tapered, so it reads as a skip rather than another box truck.
    { geometry: slab(L * 0.62, W, 2.1, { radius: 0.16, bevel: 0.04, taper: -0.06 }), position: [-L * 0.16, sill + 0.04, 0] },
    // Packer blade at the tail, angled.
    { geometry: slab(1.5, W * 0.98, 1.9, { radius: 0.12 }), position: [-L * 0.46, sill + 0.1, 0], rotation: [0, 0, 0.14], color: TRIM },
    { geometry: slab(L * 0.6, 0.06, 0.16, { radius: 0.03, bevel: 0.01 }), position: [-L * 0.16, sill + 1.5, W * 0.51], color: TRIM },
    { geometry: slab(L * 0.6, 0.06, 0.16, { radius: 0.03, bevel: 0.01 }), position: [-L * 0.16, sill + 1.5, -W * 0.51], color: TRIM },
  ];

  for (const x of [L * 0.34, -L * 0.2, -L * 0.32]) {
    parts.push(
      { geometry: wheel(wheelR, 0.36), position: [x, wheelR, W / 2 - 0.06], color: TYRE },
      { geometry: wheel(wheelR, 0.36), position: [x, wheelR, -W / 2 + 0.06], color: TYRE },
    );
  }

  return { body: merge(parts), lights: lampsFor(L, W, sill + 0.24), size: { length: L, width: W, height: 2.8 }, heavy: true };
}

/**
 * Builds every vehicle kind once. Call at boot; the geometries live for the
 * whole session and are shared by every car of that kind on the road.
 */
export function buildVehicleKinds() {
  return {
    sedan: sedan(),
    suv: suv(),
    pickup: pickup(),
    van: van(),
    boxTruck: boxTruck(),
    bus: bus(),
    garbage: garbageTruck(),
  };
}

export const LIGHT_KINDS = ['sedan', 'suv', 'pickup', 'van'];
export const HEAVY_KINDS = ['boxTruck', 'bus', 'garbage'];

/** Shared materials. One instance for every car body in the game. */
export function createVehicleMaterials(grimeMap, environment) {
  const body = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: grimeMap,
    metalness: 0.5,
    roughness: 0.36,
    envMap: environment,
    envMapIntensity: 1.15,
  });

  const lights = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false, // let the lamps blow past 1.0 so the bloom pass catches them
    fog: false,
  });

  return { body, lights };
}
