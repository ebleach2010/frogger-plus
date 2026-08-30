// Traffic: spawning, movement, recycling, and the lighting each vehicle
// throws onto the road.
//
// Every car carries three flat additive quads laid on the tarmac: a headlight
// cone ahead of it, a red pool behind it, and a long soft smear underneath.
// Those three quads are doing the job a planar reflection pass would do, at
// about a thousandth of the cost, and they behave correctly when a truck is
// half off screen. See the note at the top of road.js.
//
// Nothing here allocates during play. Vehicles are pooled and recycled; the
// pool grows to whatever the busiest stage needs and then stays put.

import * as THREE from 'three';
import { TRAFFIC, PLAYER, SCORE } from '../config.js';
import { createPool } from '../engine/pool.js';
import { buildVehicleKinds, createVehicleMaterials, PAINTS, LIGHT_KINDS, HEAVY_KINDS } from './vehicles.js';
import { makeGrime, makeLightCone, makeRadial } from '../engine/textures.js';

/** Where vehicles appear and disappear, in metres either side of centre. */
const SPAWN_X = 64;

export function createTraffic(scene, environment) {
  const kinds = buildVehicleKinds();
  const grime = makeGrime({ strength: 1.15 });
  const materials = createVehicleMaterials(grime, environment);

  const coneTexture = makeLightCone();
  const glowTexture = makeRadial({
    stops: [[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']],
  });

  const root = new THREE.Group();
  scene.add(root);

  function buildVehicle() {
    const group = new THREE.Group();

    const bodyMaterial = materials.body.clone();
    const body = new THREE.Mesh(kinds.sedan.body, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const lamps = new THREE.Mesh(kinds.sedan.lights, materials.lights);
    group.add(lamps);

    // Headlight cone on the tarmac ahead.
    const cone = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: coneTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        opacity: 0.9,
      }),
    );
    cone.rotation.x = -Math.PI / 2;
    cone.renderOrder = 4;
    group.add(cone);

    // Red pool behind.
    const tail = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: 0xff2a12,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        opacity: 0.55,
      }),
    );
    tail.rotation.x = -Math.PI / 2;
    tail.renderOrder = 4;
    group.add(tail);

    // The wet smear directly under the car -- the reflection stand-in.
    const smear = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        opacity: 0.3,
      }),
    );
    smear.rotation.x = -Math.PI / 2;
    smear.renderOrder = 3;
    group.add(smear);

    group.visible = false;
    root.add(group);

    return {
      group, body, lamps, cone, tail, smear, bodyMaterial,
      kind: 'sedan',
      size: kinds.sedan.size,
      speed: 0,
      cruise: 0,
      direction: 1,
      lane: 0,
      laneZ: 0,
      countedNearMiss: false,
      sliced: false,
      crashed: false,
      ownsGeometry: false,
    };
  }

  const pool = createPool(buildVehicle, null, 14);

  /** Dresses a pooled vehicle as a given kind and drops it at the edge. */
  function spawn(kindName, lane, laneZ, direction, speed) {
    const kind = kinds[kindName];
    const v = pool.take();

    v.kind = kindName;
    v.size = kind.size;
    if (v.ownsGeometry) {
      // This mesh died crumpled last time round; give it back clean metal.
      v.body.geometry.dispose();
      v.ownsGeometry = false;
    }
    v.body.geometry = kind.body;
    v.lamps.geometry = kind.lights;
    v.bodyMaterial.color.setHex(PAINTS[Math.floor(Math.random() * PAINTS.length)]);
    v.speed = speed;
    v.cruise = speed;
    v.direction = direction;
    v.lane = lane;
    v.laneZ = laneZ;
    v.countedNearMiss = false;
    v.sliced = false;
    v.crashed = false;

    const L = kind.size.length;
    v.group.position.set(direction > 0 ? -SPAWN_X : SPAWN_X, 0, laneZ);
    v.group.rotation.set(0, direction > 0 ? 0 : Math.PI, 0);
    v.group.visible = true;
    v.cone.visible = true;

    // Lighting quads, sized to the vehicle and parked in its local space.
    v.cone.scale.set(kind.size.width * 2.5, 11, 1);
    v.cone.position.set(L / 2 + 4.6, 0.02, 0);
    v.cone.rotation.z = 0;

    v.tail.scale.set(kind.size.width * 2.6, kind.size.width * 2.6, 1);
    v.tail.position.set(-L / 2 - 0.7, 0.022, 0);

    v.smear.scale.set(L * 1.5, kind.size.width * 2.2, 1);
    v.smear.position.set(0, 0.018, 0);
    v.smear.material.color.setHex(0x9fb6d8);
    v.smear.material.opacity = 0.3;

    return v;
  }

  // ------------------------------------------------------------- lanes ---

  let lanes = [];

  function reset(slots, stage) {
    pool.each((v) => {
      v.group.visible = false;
      v.crashed = false;
      pool.give(v);
    });

    lanes = slots.map((slot, i) => {
      const base = TRAFFIC.minSpeed + Math.random() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed);
      return {
        ...slot,
        /** Each lane runs at its own steady speed, like real traffic. */
        speed: Math.min(TRAFFIC.maxSpeed, base * stage.speedScale),
        timer: Math.random() * stage.gapSeconds,
        gap: stage.gapSeconds,
        heavyChance: stage.heavyChance,
        seq: i,
      };
    });
  }

  /** True when a lane's entry is clear enough to drop another vehicle in. */
  function entryClear(lane) {
    let clear = true;
    pool.each((v) => {
      if (!clear || v.lane !== lane.seq) return;
      const entry = lane.direction > 0 ? -SPAWN_X : SPAWN_X;
      const behind = (v.group.position.x - entry) * lane.direction;
      if (behind >= 0 && behind < v.size.length + TRAFFIC.spawnClearance) clear = false;
    });
    return clear;
  }

  /** How hard a car can brake, m/s^2. Real cars manage ~9; these are scared. */
  const BRAKE = 15;
  /** Closing speed above which contact crumples metal instead of queueing. */
  const CRASH_SPEED = 6.5;

  function update(dt, player, events, crush) {
    for (const lane of lanes) {
      lane.timer -= dt;
      if (lane.timer <= 0) {
        lane.timer = lane.gap * (0.62 + Math.random() * 0.9);
        if (entryClear(lane)) {
          const heavy = Math.random() < lane.heavyChance;
          const list = heavy ? HEAVY_KINDS : LIGHT_KINDS;
          const kindName = list[Math.floor(Math.random() * list.length)];
          // Heavy vehicles run a little slower; it reads as weight.
          const speed = lane.speed * (heavy ? 0.82 : 1) * (0.94 + Math.random() * 0.12);
          spawn(kindName, lane.seq, lane.z, lane.direction, speed);
        }
      }
    }

    const limit = SPAWN_X + TRAFFIC.despawnMargin;

    pool.each((v) => {
      if (v.crashed) return; // wrecks sit where they died; crush.js owns them

      // ---- car-following: find the nearest thing ahead in this lane.
      let blockGap = Infinity;
      let blockSpeed = 0;
      let blocker = null;

      pool.each((o) => {
        if (o === v || o.lane !== v.lane) return;
        const gap = (o.group.position.x - v.group.position.x) * v.direction
          - o.size.length / 2 - v.size.length / 2;
        if (gap > -0.5 && gap < blockGap) {
          blockGap = gap;
          blockSpeed = o.crashed ? 0 : o.speed;
          blocker = o;
        }
      });

      if (crush) {
        for (const found of crush.blockersAhead(
          v.group.position.x, v.group.position.z, v.direction,
          Math.min(blockGap, 40), v.size.width / 2 + 0.4,
        )) {
          const gap = found.gap - v.size.length / 2;
          if (gap < blockGap) {
            blockGap = gap;
            blockSpeed = 0;
            blocker = null; // a wreck; nothing further to crumple on our side
          }
        }
      }

      // Stopping distance at full braking, plus a car length of respect.
      const lookahead = (v.speed * v.speed) / (2 * BRAKE) + 4.5;

      if (blockGap < lookahead) {
        const urgency = blockGap < lookahead * 0.45 ? 2 : 1;
        v.speed = Math.max(blockSpeed, v.speed - BRAKE * urgency * dt);

        if (blockGap < 0.4) {
          const closing = v.speed - blockSpeed;
          if (closing > CRASH_SPEED && crush) {
            // Too fast. Metal folds: our nose, and their tail if they are a
            // car rather than an existing wreck. This is how pile-ups grow.
            if (blocker && !blocker.crashed) crush.crash(blocker, { intoTail: true });
            crush.crash(v);
            events?.onPileup?.(v);
            return;
          }
          v.speed = Math.min(v.speed, Math.max(0, blockSpeed));
        }
      } else {
        v.speed = Math.min(v.cruise, v.speed + 6 * dt);
      }

      v.group.position.x += v.speed * v.direction * dt;

      if (Math.abs(v.group.position.x) > limit) {
        v.group.visible = false;
        pool.give(v);
        return;
      }

      if (!player || !events) return;

      // Near miss: close, but not touching, while the car is actually moving.
      const dx = Math.abs(player.x - v.group.position.x) - v.size.length / 2;
      const dz = Math.abs(player.z - v.group.position.z) - v.size.width / 2;
      const gapToBox = Math.max(dx, dz);

      if (!v.countedNearMiss && gapToBox > 0 && gapToBox < SCORE.nearMissDistance && v.speed > 6) {
        v.countedNearMiss = true;
        events.onNearMiss?.(v);
      }
    });
  }

  /**
   * Circle-vs-box overlap against every live vehicle.
   * Returns the first vehicle hit, or null.
   */
  function hitTest(x, z, radius = PLAYER.radius) {
    let hit = null;
    pool.each((v) => {
      if (hit || v.sliced) return;
      const halfL = v.size.length / 2;
      const halfW = v.size.width / 2;
      const dx = Math.max(Math.abs(x - v.group.position.x) - halfL, 0);
      const dz = Math.max(Math.abs(z - v.group.position.z) - halfW, 0);
      if (dx * dx + dz * dz < radius * radius) hit = v;
    });
    return hit;
  }

  /** Live vehicles within `range` of a point, nearest first. Used by the laser. */
  function near(x, z, range) {
    const found = [];
    pool.each((v) => {
      if (v.sliced) return;
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < range) found.push({ vehicle: v, distance: d });
    });
    return found.sort((a, b) => a.distance - b.distance);
  }

  function retire(vehicle) {
    vehicle.group.visible = false;
    vehicle.sliced = true;
    vehicle.crashed = false;
    pool.give(vehicle);
  }

  /** Stage themes carry their own sky; the paintwork must mirror the new one. */
  function setEnvironment(environment) {
    materials.body.envMap = environment;
    materials.body.needsUpdate = true;
    for (const group of root.children) {
      const mesh = group.children[0];
      if (mesh?.material?.isMeshStandardMaterial) {
        mesh.material.envMap = environment;
        mesh.material.needsUpdate = true;
      }
    }
  }

  return {
    root,
    kinds,
    materials,
    update,
    reset,
    hitTest,
    near,
    retire,
    setEnvironment,
    each: (fn) => pool.each(fn),
    get liveCount() { return pool.liveCount; },
    get builtCount() { return pool.builtCount; },
  };
}
