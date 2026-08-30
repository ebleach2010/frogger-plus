// Rain. One InstancedMesh of stretched streak quads falling through a box
// that rides with the camera target, plus a small pool of expanding ripple
// rings where drops meet the road.
//
// The streaks are drawn additively at low opacity and slightly slanted; what
// sells rain at this camera angle is density and motion, not per-drop detail.
// Intensity is throttled with instanceCount, so the junkyard's drizzle and a
// stage-12 downpour are the same mesh doing more or less work.

import * as THREE from 'three';
import { createPool } from '../engine/pool.js';

const MAX_DROPS = 1100;
const BOX = { x: 46, y: 22, z: 46 };
const FALL_SPEED = 26;
const SLANT = 0.16;

export function createRain(scene) {
  const geometry = new THREE.PlaneGeometry(0.02, 0.6);
  const material = new THREE.MeshBasicMaterial({
    color: 0x9fb4cc,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_DROPS);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Per-drop state, flat arrays; positions are relative to the box centre.
  const px = new Float32Array(MAX_DROPS);
  const py = new Float32Array(MAX_DROPS);
  const pz = new Float32Array(MAX_DROPS);
  const speed = new Float32Array(MAX_DROPS);

  for (let i = 0; i < MAX_DROPS; i += 1) {
    px[i] = (Math.random() - 0.5) * BOX.x;
    py[i] = Math.random() * BOX.y;
    pz[i] = (Math.random() - 0.5) * BOX.z;
    speed[i] = FALL_SPEED * (0.75 + Math.random() * 0.5);
  }

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, SLANT));
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();

  // ------------------------------------------------------------- ripples --

  const rippleGeometry = new THREE.RingGeometry(0.42, 0.5, 20);
  const ripplePool = createPool(() => {
    const ring = new THREE.Mesh(rippleGeometry, new THREE.MeshBasicMaterial({
      color: 0xaac4dd,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    ring.visible = false;
    scene.add(ring);
    return { ring, age: 0 };
  }, null, 8);
  const ripples = [];
  let rippleTimer = 0;

  let intensity = 0.7;

  function setIntensity(value) {
    intensity = Math.max(0, Math.min(1, value));
    mesh.count = Math.floor(MAX_DROPS * intensity);
  }
  setIntensity(intensity);

  function update(dt, centreX, centreZ) {
    const count = mesh.count;
    for (let i = 0; i < count; i += 1) {
      py[i] -= speed[i] * dt;
      px[i] += speed[i] * SLANT * dt;
      if (py[i] < 0) {
        py[i] += BOX.y;
        px[i] = (Math.random() - 0.5) * BOX.x;
        pz[i] = (Math.random() - 0.5) * BOX.z;
      }

      position.set(centreX + px[i], py[i], centreZ + pz[i]);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // A steady sprinkle of ground ripples near the action.
    rippleTimer -= dt;
    if (rippleTimer <= 0 && intensity > 0.1) {
      rippleTimer = 0.09 / intensity;
      const r = ripplePool.take();
      r.ring.position.set(
        centreX + (Math.random() - 0.5) * 26,
        0.02,
        centreZ + (Math.random() - 0.5) * 22,
      );
      r.age = 0;
      r.ring.visible = true;
      ripples.push(r);
    }

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const r = ripples[i];
      r.age += dt;
      const t = r.age / 0.55;
      if (t >= 1) {
        r.ring.visible = false;
        ripplePool.give(r);
        ripples.splice(i, 1);
        continue;
      }
      const s = 0.4 + t * 1.8;
      r.ring.scale.set(s, s, 1);
      r.ring.material.opacity = 0.38 * (1 - t);
    }
  }

  return { update, setIntensity, mesh };
}
