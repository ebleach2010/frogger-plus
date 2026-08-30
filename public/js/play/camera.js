// The follow camera: Eric's "bird's eye at roughly a 45 degree angle".
//
// The rig is a fixed pitch and distance from config.js, chasing a smoothed
// focus point that leads the player by a fraction of his velocity -- when he
// sprints into traffic the camera shows him more of what he is about to die
// to, which is both kinder and more exciting. A spring-damped shake impulse
// is layered on top for impacts.

import * as THREE from 'three';
import { CAMERA } from '../config.js';

export function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);

  const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDegrees);
  const offsetY = Math.sin(pitch) * CAMERA.distance;
  const offsetZ = Math.cos(pitch) * CAMERA.distance;

  const focus = new THREE.Vector3(0, 0, 0);
  let shake = 0;
  let shakePhase = 0;

  function snap(x, z) {
    focus.set(x, 0, z);
    place();
  }

  function place() {
    camera.position.set(
      focus.x + Math.sin(shakePhase * 31) * shake,
      offsetY + Math.sin(shakePhase * 47) * shake * 0.6,
      focus.z + offsetZ + Math.cos(shakePhase * 39) * shake,
    );
    camera.lookAt(focus.x, 0.6, focus.z - 2.2);
  }

  function update(dt, x, z, vx, vz) {
    const targetX = x + vx * CAMERA.lookAhead * 0.4;
    const targetZ = z + vz * CAMERA.lookAhead;

    const blend = 1 - Math.exp(-dt / CAMERA.followLag);
    focus.x += (targetX - focus.x) * blend;
    focus.z += (targetZ - focus.z) * blend;

    if (shake > 0.001) {
      shakePhase += dt;
      shake *= Math.exp(-dt * 7);
    } else {
      shake = 0;
    }

    place();
  }

  return {
    camera,
    update,
    snap,
    impulse(strength = 0.5) { shake = Math.min(0.9, shake + strength); shakePhase = 0; },
    setAspect(a) {
      camera.aspect = a;
      camera.updateProjectionMatrix();
    },
    get focus() { return focus; },
  };
}
