// Laser eyes.
//
// While the power-up runs, the runner's eyes fire at the nearest live vehicle
// in front of him on a short cooldown. Each shot is two thin additive beam
// quads from head height to the target, a white-hot flash at the impact
// point, and a call into the crush engine's slice(), which does the actual
// cutting-in-half and the flying, crumpling halves.
//
// The beams live for a fraction of a second. They are not raycast physics --
// the target is chosen by proximity and heading, the beam is drawn to wherever
// it is, and nobody in the history of arcade games has ever checked.

import * as THREE from 'three';
import { POWERUPS, SCORE } from '../config.js';
import { makeRadial } from '../engine/textures.js';

const BEAM_LIFE = 0.16;
/** Eye height on the sprite, world metres. */
const EYE_Y = 1.5;

export function createLaser(scene, traffic, crush) {
  const root = new THREE.Group();
  scene.add(root);

  const spec = POWERUPS.laser;
  const color = new THREE.Color(spec.color);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const coreMaterial = beamMaterial.clone();
  coreMaterial.color.set(0xffffff);

  const flashTexture = makeRadial({
    stops: [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,120,140,0.7)'], [1, 'rgba(255,40,80,0)']],
  });
  const flashMaterial = new THREE.MeshBasicMaterial({
    map: flashTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flashGeometry = new THREE.PlaneGeometry(1, 1);

  /** Live beam bolts: { group, age } */
  const bolts = [];
  let cooldown = 0;

  /** Two eyes -> one target: a wide outer quad and a hot core each. */
  function fire(from, target) {
    const group = new THREE.Group();

    for (const eyeOffset of [-0.09, 0.09]) {
      const start = new THREE.Vector3(from.x + eyeOffset, EYE_Y, from.z);
      const end = new THREE.Vector3(target.x, 0.9, target.z);
      const length = start.distanceTo(end);
      const mid = start.clone().add(end).multiplyScalar(0.5);

      for (const [material, width] of [[beamMaterial, 0.16], [coreMaterial, 0.05]]) {
        // Cloned so each bolt fades on its own clock. A few clones per shot,
        // disposed with the bolt; not a per-frame allocation.
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material.clone());
        quad.position.copy(mid);
        quad.lookAt(end);
        quad.rotateX(Math.PI / 2);
        // Roll the quad toward the camera-ish; additive makes errors invisible.
        group.add(quad);
      }
    }

    const flash = new THREE.Mesh(flashGeometry, flashMaterial.clone());
    flash.position.set(target.x, 1.0, target.z);
    flash.scale.set(3.2, 3.2, 1);
    group.add(flash);

    root.add(group);
    bolts.push({ group, age: 0, flash });
  }

  /**
   * Runs every frame while the power-up is active.
   * @returns points scored this frame (a sliced car pays a near-miss bonus x2)
   */
  function update(dt, active, player, cameraQuaternion) {
    let scored = 0;
    cooldown -= dt;

    if (active && cooldown <= 0 && player.mode === 'run') {
      const candidates = traffic.near(player.x, player.z, spec.range);
      // Prefer targets roughly ahead of his heading, so the beams track where
      // he is looking rather than snapping backwards.
      const headingX = Math.sin(player.heading);
      const headingZ = -Math.cos(player.heading);

      let choice = null;
      for (const c of candidates) {
        if (c.vehicle.crashed) continue;
        const dx = c.vehicle.group.position.x - player.x;
        const dz = c.vehicle.group.position.z - player.z;
        const dot = (dx * headingX + dz * headingZ) / (c.distance || 1);
        const score = c.distance - dot * 6; // nearer and more frontal wins
        if (!choice || score < choice.score) choice = { c, score };
      }

      if (choice) {
        const v = choice.c.vehicle;
        const target = { x: v.group.position.x, z: v.group.position.z };
        fire({ x: player.x, z: player.z }, target);

        const d = choice.c.distance || 1;
        crush.slice(v, { x: (target.x - player.x) / d, z: (target.z - player.z) / d });
        scored += SCORE.perNearMiss * 2;
        cooldown = spec.cooldown;
      }
    }

    for (let i = bolts.length - 1; i >= 0; i -= 1) {
      const bolt = bolts[i];
      bolt.age += dt;
      bolt.flash.quaternion.copy(cameraQuaternion);
      const t = bolt.age / BEAM_LIFE;
      bolt.group.children.forEach((m) => { m.material.opacity = Math.max(0, 1 - t); });

      if (bolt.age >= BEAM_LIFE) {
        dispose(bolt);
        bolts.splice(i, 1);
      }
    }

    return scored;
  }

  function dispose(bolt) {
    bolt.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry !== flashGeometry) o.geometry.dispose();
      o.material.dispose();
    });
    root.remove(bolt.group);
  }

  function reset() {
    for (const bolt of bolts) dispose(bolt);
    bolts.length = 0;
    cooldown = 0;
  }

  return { update, reset, get boltCount() { return bolts.length; } };
}
