// The runner: movement, gait, and what happens when a car finds him.
//
// Movement is analog free-sprint from controls.js. The gait is procedural --
// Eric's sheet is a fifteen-angle turnaround with no run cycle, so running is
// sold by motion instead of frames: a vertical bob synced to stride, a lean
// into the direction of travel, and the fifteen angle rows switching as he
// turns. At this camera distance it reads convincingly as a sprint.
//
// The death is the ragdoll Eric asked for. The sprite quad is launched with
// the car's momentum, tumbles under gravity while the direction rows cycle
// fast (a flat image spinning through its own turnaround reads as a body
// cartwheeling), bounces, and comes to rest flat on the tarmac, where gore.js
// grows a pool under it. The game respawns him once the body settles.

import * as THREE from 'three';
import { PLAYER, ROAD_HALF_WIDTH } from '../config.js';
import { makeRadial } from '../engine/textures.js';

const GRAVITY = -20;
const TILT = THREE.MathUtils.degToRad(90 - 46);

export function createPlayer(scene, sprite) {
  const group = new THREE.Group();
  group.add(sprite.group);
  scene.add(group);

  // Contact shadow: the one cue that anchors a sprite to a 3D floor.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.8),
    new THREE.MeshBasicMaterial({
      map: makeRadial({
        stops: [[0, 'rgba(0,0,0,0.52)'], [0.6, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']],
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 2;
  group.add(shadow);

  const state = {
    x: 0,
    z: 0,
    /** Extra height during the ragdoll flight. */
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    heading: 0,
    /** 'run' | 'ragdoll' | 'dead' */
    mode: 'run',
    mercy: 0,
    speedRatio: 0,
    bobPhase: 0,
    /** Ragdoll internals. */
    spin: 0,
    tumble: 0,
    bounces: 0,
    restTimer: 0,
    /** Runaway power-up: input is ignored, heading wanders. */
    runaway: false,
    wanderPhase: 0,
    speedMultiplier: 1,
    /** Floor under his feet: kerb height on strips, 0 on tarmac. */
    floorY: 0,
  };

  let flashClock = 0;

  function place(x, z) {
    state.x = x;
    state.z = z;
    state.y = 0;
    state.vx = 0;
    state.vz = 0;
    state.vy = 0;
    state.mode = 'run';
    state.bounces = 0;
    state.restTimer = 0;
    sprite.group.rotation.set(0, 0, 0);
    sprite.mesh.rotation.set(-TILT, 0, 0);
    sprite.mesh.visible = true;
    shadow.visible = true;
    apply();
  }

  function apply() {
    group.position.set(state.x, state.floorY + state.y, state.z);
    // The shadow stays on the ground and thins out as the body flies.
    shadow.position.y = 0.025 - state.y;
    const squeeze = 1 / (1 + state.y * 0.55);
    shadow.scale.set(squeeze, squeeze, 1);
    shadow.material.opacity = squeeze;
  }

  function update(dt, input, world) {
    flashClock += dt;

    if (state.mode === 'ragdoll') {
      updateRagdoll(dt, world);
      apply();
      return;
    }
    if (state.mode === 'dead') {
      state.restTimer += dt;
      return;
    }

    // ------------------------------------------------------- steering ----
    let dirX = 0;
    let dirZ = 0;
    let magnitude = 0;

    if (state.runaway) {
      // Out of control: full speed, heading wanders on layered sines. The
      // player's thumb does nothing, which is the entire joke of the pickup.
      state.wanderPhase += dt;
      const w = state.wanderPhase;
      const wobble = Math.sin(w * 3.1) * 1.3 + Math.sin(w * 7.7) * 0.7 + Math.sin(w * 1.3) * 1.1;
      // Biased up-screen, so it usually flings him toward danger, not off it.
      dirX = Math.sin(wobble);
      dirZ = -Math.abs(Math.cos(wobble * 0.8)) + Math.sin(w * 5.3) * 0.4;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
      magnitude = 1;
    } else if (input.active && input.magnitude > 0) {
      // Screen up is world -Z at this camera, screen right is +X.
      dirX = input.x;
      dirZ = input.y;
      magnitude = input.magnitude;
    }

    const targetSpeed = PLAYER.speed * state.speedMultiplier * magnitude;
    const tvx = dirX * targetSpeed;
    const tvz = dirZ * targetSpeed;

    const blend = 1 - Math.exp(-dt / (magnitude > 0 ? PLAYER.accel : PLAYER.decel));
    state.vx += (tvx - state.vx) * blend;
    state.vz += (tvz - state.vz) * blend;

    const speed = Math.hypot(state.vx, state.vz);
    state.speedRatio = speed / PLAYER.speed;

    let nx = state.x + state.vx * dt;
    let nz = state.z + state.vz * dt;

    // Soft walls: the road strip is the world.
    nx = Math.max(-ROAD_HALF_WIDTH, Math.min(ROAD_HALF_WIDTH, nx));
    if (world.minZ !== undefined) nz = Math.max(world.minZ, nz);
    if (world.maxZ !== undefined) nz = Math.min(world.maxZ, nz);

    // Wrecks are solid: slide around them rather than through them.
    if (world.blockedAt) {
      if (world.blockedAt(nx, state.z)) nx = state.x;
      if (world.blockedAt(nx, nz)) nz = state.z;
    }

    state.x = nx;
    state.z = nz;

    // ------------------------------------------------------------ gait ----
    if (speed > 0.4) {
      state.heading = Math.atan2(state.vx, -state.vz);
      if (state.heading < 0) state.heading += Math.PI * 2;
      sprite.setHeading(state.heading);
      sprite.play('run');
    } else {
      sprite.play('idle');
    }

    // Stride bob: frequency rises with speed; runaway doubles the cadence.
    state.bobPhase += dt * (6 + state.speedRatio * 9);
    const bob = Math.abs(Math.sin(state.bobPhase)) * 0.085 * Math.min(1, state.speedRatio);
    sprite.group.position.y = bob;

    // Lean into travel: pitch the quad forward with speed, sway with stride.
    sprite.mesh.rotation.x = -TILT - state.speedRatio * 0.12;
    sprite.group.rotation.z = Math.sin(state.bobPhase) * 0.045 * state.speedRatio
      + (state.runaway ? Math.sin(state.wanderPhase * 11) * 0.1 : 0);

    // Floor height: on a kerb or median his feet are up on the concrete.
    state.floorY = world.floorAt ? world.floorAt(state.z) : 0;

    // ----------------------------------------------------------- mercy ----
    if (state.mercy > 0) {
      state.mercy -= dt;
      sprite.mesh.visible = Math.floor(flashClock * 9) % 2 === 0;
      if (state.mercy <= 0) sprite.mesh.visible = true;
    }

    apply();
  }

  function updateRagdoll(dt, world) {
    state.vy += GRAVITY * dt;
    state.x += state.vx * dt;
    state.z += state.vz * dt;
    state.y += state.vy * dt;

    // The cartwheel: spin the heading rows while the quad itself tumbles.
    state.spin += dt * 9;
    let heading = state.heading + state.spin;
    heading %= Math.PI * 2;
    if (heading < 0) heading += Math.PI * 2;
    sprite.setHeading(heading);

    state.tumble += dt * 7.5;
    sprite.mesh.rotation.x = -TILT + state.tumble;
    sprite.group.rotation.z = Math.sin(state.tumble * 0.7) * 0.5;

    if (state.y <= 0 && state.vy < 0) {
      state.y = 0;
      state.bounces += 1;
      world.onBodyBounce?.(state.x, state.z, state.bounces);
      state.vy = -state.vy * 0.34;
      state.vx *= 0.5;
      state.vz *= 0.5;

      if (state.bounces >= 2 || Math.abs(state.vy) < 1.4) {
        // At rest. Lay the quad flat on the road: a body, not a runner.
        state.mode = 'dead';
        state.y = 0;
        sprite.mesh.rotation.x = -Math.PI / 2 + 0.04;
        sprite.group.rotation.z = (Math.random() - 0.5) * 0.8;
        sprite.group.position.y = 0.06;
        shadow.visible = false;
        world.onBodyRest?.(state.x, state.z);
      }
    }
  }

  return {
    group,
    sprite,
    state,
    update,
    place,

    /** A vehicle got him. Launch the body with the car's momentum. */
    ragdoll(vehicle) {
      state.mode = 'ragdoll';
      const carVx = vehicle ? vehicle.speed * vehicle.direction : 0;
      state.vx = carVx * 0.62 + (Math.random() - 0.5) * 2;
      state.vz = (Math.random() - 0.5) * 3.5;
      state.vy = 5.6 + Math.random() * 2.6;
      state.spin = 0;
      state.tumble = 0;
      state.bounces = 0;
      state.mercy = 0;
      state.runaway = false;
      state.speedMultiplier = 1;
      shadow.visible = true;
    },

    respawn(x, z) {
      place(x, z);
      state.mercy = PLAYER.mercySeconds;
    },

    setRunaway(on) {
      state.runaway = on;
      state.speedMultiplier = on ? 2 : 1;
      if (on) state.wanderPhase = Math.random() * 20;
    },

    get isVulnerable() {
      return state.mode === 'run' && state.mercy <= 0;
    },
    get bodyRestedFor() {
      return state.mode === 'dead' ? state.restTimer : 0;
    },
  };
}
