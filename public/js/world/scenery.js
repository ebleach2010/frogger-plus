// Stage dressing for the three worlds.
//
// Everything here is static: built once per stage into a handful of merged
// meshes, disposed at teardown. The camera spends the whole game pointed at
// tarmac, so scenery earns its draw calls at the edges of the frame -- the
// skyline behind the goal, lamps throwing sodium pools, water where the flood
// is, junk where the junkyard is. Nothing interactive lives in this file.

import * as THREE from 'three';
import { ROAD_HALF_WIDTH } from '../config.js';
import { slab, wheel, merge } from '../engine/geo.js';
import { makeRadial, makeLightCone } from '../engine/textures.js';
import { crushGeometry } from './crush.js';
import { buildVehicleKinds, PAINTS } from './vehicles.js';

const LAMP_GLOW = 0xffc568;

/** A canvas skyline: black towers, scattered lit windows. Two of these at
 *  different scales make a cheap parallax backdrop. */
function skylineTexture(seed, lit) {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  let n = seed;
  const rand = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };

  let x = 0;
  while (x < w) {
    const bw = 30 + rand() * 80;
    const bh = 60 + rand() * 180;
    ctx.fillStyle = `rgb(${8 + rand() * 8 | 0}, ${9 + rand() * 8 | 0}, ${14 + rand() * 10 | 0})`;
    ctx.fillRect(x, h - bh, bw, bh);

    if (lit) {
      for (let wx = x + 4; wx < x + bw - 6; wx += 9) {
        for (let wy = h - bh + 6; wy < h - 10; wy += 12) {
          if (rand() < 0.16) {
            ctx.fillStyle = rand() < 0.75 ? 'rgba(255, 200, 120, 0.9)' : 'rgba(160, 210, 255, 0.8)';
            ctx.fillRect(wx, wy, 4, 6);
          }
        }
      }
    }
    x += bw + rand() * 12;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Chain-link: drawn once, tiled along the fence. */
function chainlinkTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(150, 155, 160, 0.85)';
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + size, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createScenery(scene) {
  const coneTexture = makeLightCone();
  const glowTexture = makeRadial({
    stops: [[0, 'rgba(255,205,130,0.9)'], [0.5, 'rgba(255,190,110,0.3)'], [1, 'rgba(255,180,100,0)']],
  });

  let group = null;
  let disposables = [];

  function track(...objects) {
    disposables.push(...objects);
    return objects[0];
  }

  function clear() {
    if (group) {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
      disposables = [];
      group = null;
    }
  }

  // ----------------------------------------------------------- pieces ----

  /** One street lamp: dark pole, emissive head, glow billboard, cone on the
   *  ground. The glow quads are what the bloom pass feasts on. */
  function addLamp(x, z, facing = 1) {
    const pole = new THREE.Mesh(
      track(merge([
        { geometry: new THREE.CylinderGeometry(0.09, 0.13, 5.4, 8), position: [0, 2.7, 0], color: 0x23262b },
        { geometry: new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), position: [facing * 0.8, 5.3, 0], rotation: [0, 0, facing * Math.PI / 2.3], color: 0x23262b },
      ])),
      lampPoleMaterial,
    );
    pole.position.set(x, 0, z);
    pole.castShadow = true;
    group.add(pole);

    const head = new THREE.Mesh(headGeometry, lampHeadMaterial);
    head.position.set(x + facing * 1.5, 5.6, z);
    group.add(head);

    const glow = new THREE.Mesh(glowGeometry, lampGlowMaterial);
    glow.position.copy(head.position);
    group.add(glow);
    glows.push(glow);

    const pool = new THREE.Mesh(poolGeometry, lampPoolMaterial);
    pool.rotation.x = -Math.PI / 2;
    pool.rotation.z = Math.PI; // cone texture points up; flip toward the pole
    pool.position.set(x + facing * 1.7, 0.024, z);
    pool.scale.set(7, 10, 1);
    group.add(pool);
  }

  /** A pile of rubbish bags: squashed icosahedra with a plastic sheen. */
  function bagPile(x, z, count, spread) {
    const parts = [];
    for (let i = 0; i < count; i += 1) {
      const s = 0.34 + Math.random() * 0.4;
      parts.push({
        geometry: new THREE.IcosahedronGeometry(s, 1),
        position: [
          x + (Math.random() - 0.5) * spread,
          s * 0.62,
          z + (Math.random() - 0.5) * spread * 0.7,
        ],
        scale: [1, 0.72, 1],
        rotation: [0, Math.random() * 3, 0],
        color: Math.random() < 0.85 ? 0x15171a : 0x2c3038,
      });
    }
    return parts;
  }

  // Shared geometry/materials for the lamps, built once.
  const headGeometry = new THREE.BoxGeometry(0.7, 0.22, 0.3);
  const glowGeometry = new THREE.PlaneGeometry(2.6, 2.6);
  const poolGeometry = new THREE.PlaneGeometry(1, 1);
  const lampPoleMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 });
  const lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9c0, toneMapped: false });
  const lampGlowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture, color: LAMP_GLOW, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const lampPoolMaterial = new THREE.MeshBasicMaterial({
    map: coneTexture, color: 0xffc880, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  let glows = [];

  // A private vehicle set for parked wrecks, crumpled at build time.
  const propKinds = buildVehicleKinds();

  /**
   * Builds the dressing for a stage.
   * `centres`/`bands` describe the road; scenery keys off kerbs and medians.
   */
  function build(stage, centres, environment) {
    clear();
    group = new THREE.Group();
    glows = [];
    scene.add(group);

    const bands = stage.bands;
    const depth = bands.reduce((s, b) => s + b.depth, 0);
    const goalIndex = bands.findIndex((b) => b.goal);
    const goalZ = centres[goalIndex];
    const startZ = centres[0];
    const standardMaterial = track(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55, metalness: 0.15,
      envMap: environment, envMapIntensity: 0.8,
    }));

    // -------------------------------------------------------- backdrop ----
    if (stage.theme !== 'junkyard') {
      const far = track(new THREE.Mesh(
        track(new THREE.PlaneGeometry(240, 30)),
        track(new THREE.MeshBasicMaterial({
          map: track(skylineTexture(19 + stage.cycle, true)),
          transparent: true, fog: false, toneMapped: false,
        })),
      ));
      far.position.set(0, 11, goalZ - 34);
      group.add(far);

      const near = track(new THREE.Mesh(
        track(new THREE.PlaneGeometry(200, 22)),
        track(new THREE.MeshBasicMaterial({
          map: track(skylineTexture(77 + stage.stage, true)),
          transparent: true, fog: false, toneMapped: false, opacity: 0.96,
        })),
      ));
      near.position.set(24, 7.5, goalZ - 22);
      group.add(near);
    }

    // Street lamps on kerbs and medians, staggered.
    const lampBands = bands
      .map((b, i) => ({ b, z: centres[i] }))
      .filter(({ b }) => b.kind !== 'lane');
    // Kerbs only: a pole standing in the median reads as clutter crossing
    // the traffic from this camera, and the medians already carry barriers.
    lampBands.filter(({ b }) => b.kind === 'kerb').forEach(({ z }, i) => {
      for (let x = -26 + ((i % 2) * 11); x <= 28; x += 22) {
        if (stage.theme === 'junkyard' && Math.random() < 0.55) continue; // most are dead
        addLamp(x, z, x < 0 ? 1 : -1);
      }
    });

    // ---------------------------------------------------------- statics ----
    const parts = [];

    if (stage.theme === 'highway') {
      // Guardrails along both kerb inner edges.
      for (const { b, z } of lampBands.filter(({ b }) => b.kind === 'kerb')) {
        // Rail sits on the kerb's traffic-facing edge.
        const railZ = z + (z > goalZ ? -b.depth / 2 + 0.4 : b.depth / 2 - 0.4);
        parts.push(
          { geometry: track(slab(120, 0.12, 0.3, { radius: 0.04, bevel: 0.02 })), position: [0, 0.5, railZ], color: 0x7d838c },
        );
        for (let x = -58; x <= 58; x += 4) {
          parts.push({ geometry: track(slab(0.14, 0.14, 0.5, { radius: 0.03, bevel: 0.02 })), position: [x, 0.2, railZ], color: 0x4a4f57 });
        }
      }
      // Jersey barriers down the medians.
      for (const { b, z } of lampBands.filter(({ b }) => b.kind === 'median')) {
        for (let x = -54; x <= 54; x += 6.2) {
          if (Math.abs(x) < 9) continue; // leave the crossing gap open
          parts.push({ geometry: track(slab(5.6, 0.6, 0.85, { radius: 0.08, bevel: 0.05, taper: 0.35 })), position: [x, 0.2, z], color: 0x83807a });
        }
      }
      // A couple of pre-crushed cars abandoned on the shoulders.
      [[-19, startZ, 0.5], [14, goalZ, -0.4]].forEach(([x, z, yaw], i) => {
        const names = Object.keys(propKinds);
        const kind = propKinds[names[(stage.stage + i * 3) % names.length]];
        const geometry = track(crushGeometry(kind.body, i % 2 ? -1 : 1, { depth: 1.2, seed: stage.stage * 7 + i }));
        const material = track(new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.5, metalness: 0.3,
          color: PAINTS[(stage.stage + i) % PAINTS.length],
          envMap: environment, envMapIntensity: 1,
        }));
        const wreck = new THREE.Mesh(geometry, material);
        wreck.position.set(x, 0.2, z);
        wreck.rotation.y = yaw;
        wreck.castShadow = true;
        group.add(wreck);
      });
    }

    if (stage.theme === 'flood') {
      // The water: one glassy plane over the whole carriageway. Roughness
      // near zero turns it into a sky mirror, which is the entire look.
      const water = track(new THREE.Mesh(
        track(new THREE.PlaneGeometry(190, depth + 14)),
        track(new THREE.MeshStandardMaterial({
          color: 0x1c2e30,
          transparent: true,
          opacity: 0.78,
          roughness: 0.06,
          metalness: 0,
          envMap: environment,
          envMapIntensity: 1.6,
        })),
      ));
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.07, -depth / 2);
      water.renderOrder = 1;
      group.add(water);

      // The derailed subway car, beached across the goal kerb.
      const subway = track(new THREE.Mesh(
        track(merge([
          { geometry: track(slab(16, 2.9, 3.1, { radius: 0.5, bevel: 0.06 })), position: [0, 0.4, 0], color: 0x9aa2ab },
          { geometry: track(slab(15.6, 3.0, 0.5, { radius: 0.4 })), position: [0, 0.15, 0], color: 0x3a3f46 },
          { geometry: track(slab(14.8, 0.06, 0.9, { radius: 0.04 })), position: [0, 2.1, 1.48], color: 0x14181f },
          { geometry: track(slab(14.8, 0.06, 0.9, { radius: 0.04 })), position: [0, 2.1, -1.48], color: 0x14181f },
          { geometry: track(slab(1.2, 2.6, 0.4, { radius: 0.1 })), position: [0, 3.6, 0], color: 0x565c64 },
          ...[-6, -2.4, 1.2, 4.8].map((x) => ({
            geometry: track(wheel(0.42, 0.3, 10)), position: [x, 0.42, 1.2], color: 0x1a1d22,
          })),
        ])),
        standardMaterial,
      ));
      subway.position.set(10, 0, goalZ + 0.6);
      subway.rotation.y = -0.14;
      subway.rotation.z = 0.05;
      subway.castShadow = true;
      group.add(subway);

      // Floating rubbish: bags and barrels adrift in the lanes.
      bands.forEach((b, i) => {
        if (b.kind !== 'lane' || Math.random() < 0.4) return;
        parts.push(...bagPile((Math.random() - 0.5) * 46, centres[i], 2, 3));
      });
      for (let i = 0; i < 7; i += 1) {
        parts.push({
          geometry: track(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10)),
          position: [(Math.random() - 0.5) * 50, 0.28, startZ - Math.random() * (depth - 8)],
          rotation: [Math.random() * 0.4, Math.random() * 3, Math.PI / 2 * (Math.random() < 0.5 ? 1 : 0.06)],
          color: 0x6e3a1e,
        });
      }
    }

    if (stage.theme === 'junkyard') {
      // Chain-link fence around the yard.
      // Goal side only: a fence on the start side would hang between the
      // camera and the player, which is exactly where a fence must not be.
      const linkMaterial = track(new THREE.MeshBasicMaterial({
        map: track(chainlinkTexture()),
        color: 0x565b63,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }));
      for (const [z, length] of [[goalZ - 3.4, 120]]) {
        const fence = new THREE.Mesh(track(new THREE.PlaneGeometry(length, 2.6)), linkMaterial);
        fence.material.map.repeat.set(length / 2.6, 1);
        fence.position.set(0, 1.3, z);
        group.add(fence);
        for (let x = -56; x <= 56; x += 8) {
          parts.push({ geometry: track(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6)), position: [x, 1.4, z], color: 0x3d4147 });
        }
      }

      // Junk everywhere the cars are not.
      bands.forEach((b, i) => {
        if (b.kind === 'lane') return;
        parts.push(...bagPile((Math.random() - 0.5) * 44, centres[i], 6, 6));
        // Tyre stacks.
        const tx = (Math.random() - 0.5) * 46;
        const stack = 1 + Math.floor(Math.random() * 3);
        for (let t = 0; t < stack; t += 1) {
          parts.push({
            geometry: track(new THREE.TorusGeometry(0.42, 0.17, 8, 14)),
            position: [tx, 0.18 + t * 0.34, centres[i] + 0.8],
            rotation: [Math.PI / 2, 0, 0],
            color: 0x101214,
          });
        }
        // Broken planks.
        for (let p = 0; p < 3; p += 1) {
          parts.push({
            geometry: track(slab(2.4 + Math.random() * 2, 0.3, 0.08, { radius: 0.02, bevel: 0.01 })),
            position: [(Math.random() - 0.5) * 48, 0.1, centres[i] + (Math.random() - 0.5) * 2],
            rotation: [0, Math.random() * 3, (Math.random() - 0.5) * 0.2],
            color: 0x4a3c2a,
          });
        }
      });
    }

    if (parts.length) {
      const statics = new THREE.Mesh(track(merge(parts)), standardMaterial);
      statics.castShadow = true;
      statics.receiveShadow = true;
      group.add(statics);
    }
  }

  function update(dt, cameraQuaternion) {
    for (const glow of glows) glow.quaternion.copy(cameraQuaternion);
  }

  return { build, update, clear };
}
