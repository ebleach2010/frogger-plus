// Gore: the splash, the stains, and the pool.
//
// Eric asked for a gore splash on impact. The recipe is three layers, all
// pooled, all cheap:
//
//   * droplets  -- a burst of small dark-red quads thrown along the car's
//     direction of travel, under gravity. Each one that lands stamps a splat.
//   * splats    -- flat irregular stains on the tarmac that stay for a while
//     and slowly wash out (it is raining, after all).
//   * the pool  -- one larger stain that grows under the body where it comes
//     to rest.
//
// Blood is drawn with normal alpha blending, never additive: additive red
// over a lit road goes neon pink and reads as a power-up, not an injury.
// A dark multiply-ish red that OCCLUDES the tarmac is what reads as liquid.

import * as THREE from 'three';
import { createPool } from '../engine/pool.js';

const GRAVITY = -21;
const SPLAT_TTL = 24;

/** An irregular blotch texture: overlapping random circles, darker centre. */
function makeSplatTexture(seed) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  let n = seed;
  const rand = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };

  for (let i = 0; i < 26; i += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = rand() * rand() * size * 0.34;
    const x = size / 2 + Math.cos(angle) * distance;
    const y = size / 2 + Math.sin(angle) * distance;
    const r = 3 + rand() * (i < 6 ? 22 : 9);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(96, 8, 12, 0.95)');
    g.addColorStop(0.7, 'rgba(72, 4, 8, 0.8)');
    g.addColorStop(1, 'rgba(60, 2, 6, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGore(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const splatTextures = [makeSplatTexture(11), makeSplatTexture(47), makeSplatTexture(83)];

  // ------------------------------------------------------------ droplets --

  const dropletGeometry = new THREE.PlaneGeometry(0.16, 0.16);
  const dropletMaterial = new THREE.MeshBasicMaterial({
    color: 0x7a060e,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: true,
  });

  const droplets = createPool(() => {
    const mesh = new THREE.Mesh(dropletGeometry, dropletMaterial);
    mesh.visible = false;
    root.add(mesh);
    return { mesh, vx: 0, vy: 0, vz: 0, spin: 0, big: false };
  }, null, 24);

  // -------------------------------------------------------------- splats --

  const splatGeometry = new THREE.PlaneGeometry(1, 1);

  const splats = createPool(() => {
    const material = new THREE.MeshBasicMaterial({
      map: splatTextures[Math.floor(Math.random() * splatTextures.length)],
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    const mesh = new THREE.Mesh(splatGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    mesh.visible = false;
    root.add(mesh);
    return { mesh, material, age: 0, size: 1, growth: 0 };
  }, null, 10);

  const liveSplats = [];

  function stamp(x, z, size, growth = 0) {
    const s = splats.take();
    s.mesh.position.set(x, 0.016 + Math.random() * 0.01, z);
    s.mesh.rotation.z = Math.random() * Math.PI * 2;
    s.mesh.scale.set(size, size, 1);
    s.material.opacity = 0.92;
    s.mesh.visible = true;
    s.age = 0;
    s.size = size;
    s.growth = growth;
    liveSplats.push(s);
    // Never more than 34 stains on the road; the oldest washes out first.
    if (liveSplats.length > 34) {
      const old = liveSplats.shift();
      old.mesh.visible = false;
      splats.give(old);
    }
  }

  /**
   * The impact itself. `along` is the direction the vehicle was moving, so
   * the spray carries downrange the way it should.
   */
  function burst(x, z, along = { x: 1, z: 0 }, intensity = 1) {
    const count = Math.round(26 * intensity);
    for (let i = 0; i < count; i += 1) {
      const d = droplets.take();
      const spread = (Math.random() - 0.5) * 1.6;
      const speed = 2.5 + Math.random() * 6.5;
      d.vx = along.x * speed + Math.cos(spread) * (Math.random() - 0.5) * 4;
      d.vz = along.z * speed + Math.sin(spread) * (Math.random() - 0.5) * 4;
      d.vy = 2.2 + Math.random() * 5.2;
      d.spin = (Math.random() - 0.5) * 14;
      d.big = Math.random() < 0.2;
      d.mesh.position.set(x, 0.6 + Math.random() * 0.9, z);
      const s = d.big ? 1.9 : 0.7 + Math.random();
      d.mesh.scale.set(s, s, 1);
      d.mesh.visible = true;
    }
    // The main splash under the impact, immediately.
    stamp(x, z, 1.5 + intensity * 0.9);
  }

  /** The stain that spreads under a body at rest. */
  function pool(x, z) {
    stamp(x, z, 0.8, 0.55);
  }

  function update(dt, cameraQuaternion) {
    droplets.each((d) => {
      d.vy += GRAVITY * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.quaternion.copy(cameraQuaternion);
      d.mesh.rotation.z += d.spin * dt;

      if (d.mesh.position.y <= 0.02) {
        stamp(d.mesh.position.x, d.mesh.position.z, d.big ? 0.85 : 0.28 + Math.random() * 0.3);
        d.mesh.visible = false;
        droplets.give(d);
      }
    });

    for (let i = liveSplats.length - 1; i >= 0; i -= 1) {
      const s = liveSplats[i];
      s.age += dt;

      if (s.growth > 0 && s.age < 3) {
        const k = s.size + s.age * s.growth;
        s.mesh.scale.set(k, k, 1);
      }

      // The rain does the cleanup: a slow fade over the back half of life.
      const t = s.age / SPLAT_TTL;
      if (t > 0.5) s.material.opacity = 0.92 * (1 - (t - 0.5) / 0.5);

      if (s.age >= SPLAT_TTL) {
        s.mesh.visible = false;
        splats.give(s);
        liveSplats.splice(i, 1);
      }
    }
  }

  function reset() {
    droplets.each((d) => {
      d.mesh.visible = false;
      droplets.give(d);
    });
    for (const s of liveSplats) {
      s.mesh.visible = false;
      splats.give(s);
    }
    liveSplats.length = 0;
  }

  return {
    burst,
    pool,
    stamp,
    update,
    reset,
    get dropletCount() { return droplets.liveCount; },
    get splatCount() { return liveSplats.length; },
  };
}
