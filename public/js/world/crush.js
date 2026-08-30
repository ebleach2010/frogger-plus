// The mechanical crush engine.
//
// Eric asked for vehicles that actually crush. This module owns everything
// that happens to a car after the worst moment of its day:
//
//   * crash(vehicle, ...)   -- a moving car meets something solid. Its metal
//     crumples: the geometry is cloned once and its vertices are folded in
//     along the impact direction with jitter, the paint is scuffed dark, the
//     car stops and becomes a wreck that later traffic has to brake for.
//   * slice(vehicle)        -- the laser cuts it in half. The two halves are
//     pre-sliced per vehicle kind at boot (the cut is always amidships, which
//     is both the cheapest and the most theatrical place), thrown apart with
//     spin, crumpled on landing, and become wrecks where they stop.
//
// Wrecks are real obstacles: traffic.js queries them to brake and queue, and
// following cars that arrive too fast crash into them in turn, which is how a
// single laser shot grows into a proper pile-up. Every wreck melts back into
// the road after WRECK_TTL seconds so a stage never locks up for good.
//
// Crumpling clones a geometry per event. That is a deliberate exception to
// the never-allocate rule: crashes are rare (a few per stage, not per frame)
// and each wreck genuinely needs unique bent metal.

import * as THREE from 'three';
import { sliceAlongX } from '../engine/geo.js';

const WRECK_TTL = 26;
const HALF_TTL = 18;
const GRAVITY = -19;

/** How deep the crumple zone reaches into the body, metres. */
const CRUSH_DEPTH = 0.85;

/**
 * Folds the front (or rear) of a body shell in on itself.
 * `direction` +1 crushes the nose, -1 the tail, in the vehicle's local space.
 */
export function crushGeometry(source, direction, { depth = CRUSH_DEPTH, seed = 1 } = {}) {
  const geometry = source.clone();
  const pos = geometry.attributes.position;
  const col = geometry.attributes.color;
  geometry.computeBoundingBox();

  const edge = direction > 0 ? geometry.boundingBox.max.x : geometry.boundingBox.min.x;
  const span = Math.abs(edge) + 0.001;

  let n = seed;
  const rand = () => {
    // Tiny LCG so the same crash always bends the same way in replays/tests.
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const intoZone = direction > 0 ? x - (edge - depth) : (edge + depth) - x;
    if (intoZone <= 0) continue;

    const t = Math.min(1, intoZone / depth);
    // Fold toward the crush plane, harder the closer to the edge...
    pos.setX(i, x - direction * intoZone * 0.55);
    // ...and buckle outward/upward with noise, which is what reads as metal.
    pos.setY(i, pos.getY(i) + (rand() - 0.35) * 0.3 * t);
    pos.setZ(i, pos.getZ(i) + (rand() - 0.5) * 0.34 * t);

    if (col) {
      // Scuff the paint toward bare dark metal in the crumple zone.
      const k = 1 - t * 0.55;
      col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
    }
  }

  pos.needsUpdate = true;
  if (col) col.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCrush(scene, traffic, events = {}) {
  const root = new THREE.Group();
  scene.add(root);

  // Pre-slice every kind once. halves[kind] = { body: [left, right], lights: [l, r] }
  const halves = {};
  for (const [name, kind] of Object.entries(traffic.kinds)) {
    halves[name] = {
      body: sliceAlongX(kind.body, 0),
      lights: sliceAlongX(kind.lights, 0),
      size: kind.size,
    };
  }

  /** Static obstacles traffic must brake for: { x, z, halfL, halfW, lane }. */
  const wrecks = [];
  /** Airborne car halves still tumbling. */
  const flying = [];

  function addWreck(entry) {
    wrecks.push(entry);
    events.onWreck?.(entry);
  }

  /**
   * A moving vehicle hits something solid nose-first. It crumples in place,
   * stops, and registers as an obstacle. Called by traffic.js on hard contact
   * and by the game when an invincible player meets a car.
   */
  function crash(vehicle, { intoTail = false } = {}) {
    if (vehicle.crashed) return;
    vehicle.crashed = true;
    vehicle.speed = 0;

    const crushed = crushGeometry(
      vehicle.body.geometry,
      intoTail ? -1 : 1,
      { seed: 1 + Math.floor(Math.abs(vehicle.group.position.x) * 97) },
    );
    vehicle.body.geometry = crushed;
    vehicle.ownsGeometry = true;

    // A little settle: dropped nose, slight yaw, like the suspension let go.
    vehicle.group.rotation.y += (Math.random() - 0.5) * 0.16;
    vehicle.group.rotation.z = (intoTail ? -1 : 1) * 0.03 * vehicle.direction;

    // Kill the headlight cone -- a crashed car's lights die with it.
    vehicle.cone.visible = false;
    vehicle.smear.material.opacity = 0.12;

    addWreck({
      vehicle,
      x: vehicle.group.position.x,
      z: vehicle.group.position.z,
      halfL: vehicle.size.length / 2,
      halfW: vehicle.size.width / 2,
      age: 0,
      kind: 'crash',
    });

    events.onCrash?.(vehicle);
  }

  /**
   * The laser moment. The vehicle disappears from traffic and two halves fly.
   * `away` is the world-space direction the beam pushes along (usually the
   * player-to-car direction), so the halves separate with the shot.
   */
  function slice(vehicle, away = { x: 0, z: -1 }) {
    const kindHalves = halves[vehicle.kind];
    const paint = vehicle.bodyMaterial.color.getHex();
    const origin = {
      x: vehicle.group.position.x,
      z: vehicle.group.position.z,
      rotY: vehicle.group.rotation.y,
      speed: vehicle.speed * vehicle.direction,
    };

    traffic.retire(vehicle);

    // Local +X is the nose. Half 1 keeps the nose, half 0 the tail.
    [0, 1].forEach((side) => {
      const bodyGeometry = kindHalves.body[side];
      const lightGeometry = kindHalves.lights[side];

      const material = traffic.materials.body.clone();
      material.color.setHex(paint);
      // The cut face is open; double-sided keeps the interior from becoming
      // a see-through hole while the half tumbles.
      material.side = THREE.DoubleSide;

      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeometry, material);
      body.castShadow = true;
      group.add(body);
      group.add(new THREE.Mesh(lightGeometry, traffic.materials.lights));

      group.position.set(origin.x, 0, origin.z);
      group.rotation.y = origin.rotY;
      root.add(group);

      const sign = side === 1 ? 1 : -1;
      const alongX = Math.cos(origin.rotY) * sign;
      const alongZ = -Math.sin(origin.rotY) * sign;

      flying.push({
        group,
        material,
        // Carries the car's momentum, plus separation, plus the beam's shove.
        vx: origin.speed * 0.55 + alongX * 4.2 + away.x * 2.4,
        vz: alongZ * 4.2 + away.z * 2.4 + (Math.random() - 0.5) * 2,
        vy: 4.6 + Math.random() * 2.4,
        spinX: (Math.random() - 0.5) * 7,
        spinY: (Math.random() - 0.5) * 5,
        bounces: 0,
        halfL: kindHalves.size.length / 4,
        halfW: kindHalves.size.width / 2,
        side,
      });
    });

    events.onSlice?.(origin);
  }

  function update(dt) {
    // ---- tumbling halves
    for (let i = flying.length - 1; i >= 0; i -= 1) {
      const f = flying[i];
      f.vy += GRAVITY * dt;
      f.group.position.x += f.vx * dt;
      f.group.position.z += f.vz * dt;
      f.group.position.y += f.vy * dt;
      f.group.rotation.x += f.spinX * dt;
      f.group.rotation.y += f.spinY * dt;

      if (f.group.position.y <= 0 && f.vy < 0) {
        f.group.position.y = 0;
        f.bounces += 1;
        f.vy = -f.vy * 0.32;
        f.vx *= 0.55;
        f.vz *= 0.55;
        f.spinX *= 0.4;
        f.spinY *= 0.4;

        if (f.bounces >= 2) {
          // Settle: lie flat-ish, crumple the torn edge, become an obstacle.
          f.group.position.y = 0;
          f.group.rotation.x = (Math.random() - 0.5) * 0.12;
          flying.splice(i, 1);

          addWreck({
            half: f,
            x: f.group.position.x,
            z: f.group.position.z,
            halfL: f.halfL,
            halfW: f.halfW,
            age: 0,
            kind: 'half',
          });
        }
      }
    }

    // ---- wreck ageing: sink into the tarmac at end of life
    for (let i = wrecks.length - 1; i >= 0; i -= 1) {
      const w = wrecks[i];
      w.age += dt;
      const ttl = w.kind === 'half' ? HALF_TTL : WRECK_TTL;

      if (w.age > ttl) {
        const sink = w.age - ttl;
        const object = w.vehicle ? w.vehicle.group : w.half.group;
        object.position.y = -sink * 0.8;

        if (sink > 2.2) {
          wrecks.splice(i, 1);
          if (w.vehicle) {
            // Hand the carcass back to the pool as a normal vehicle.
            const v = w.vehicle;
            if (v.ownsGeometry) {
              v.body.geometry.dispose();
              v.body.geometry = traffic.kinds[v.kind].body;
              v.ownsGeometry = false;
            }
            v.crashed = false;
            v.cone.visible = true;
            v.smear.material.opacity = 0.3;
            v.group.rotation.set(0, 0, 0);
            v.group.position.y = 0;
            traffic.retire(v);
          } else {
            root.remove(w.half.group);
            w.half.material.dispose();
          }
        }
      }
    }
  }

  /** Wrecks blocking a stretch of lane ahead of x, travelling `direction`. */
  function blockersAhead(x, z, direction, lookahead, laneHalfWidth) {
    const found = [];
    for (const w of wrecks) {
      if (Math.abs(w.z - z) > laneHalfWidth + w.halfW) continue;
      const gap = (w.x - x) * direction - w.halfL;
      if (gap > -1 && gap < lookahead) found.push({ gap, obstacle: w });
    }
    return found;
  }

  /** Solid wreck at a point? The player is blocked, not killed, by wrecks. */
  function wreckAt(x, z, radius) {
    for (const w of wrecks) {
      const dx = Math.max(Math.abs(x - w.x) - w.halfL, 0);
      const dz = Math.max(Math.abs(z - w.z) - w.halfW, 0);
      if (dx * dx + dz * dz < radius * radius) return w;
    }
    return null;
  }

  function reset() {
    for (const f of flying) {
      root.remove(f.group);
      f.material.dispose();
    }
    flying.length = 0;

    for (const w of wrecks) {
      if (w.vehicle) {
        const v = w.vehicle;
        if (v.ownsGeometry) {
          v.body.geometry.dispose();
          v.body.geometry = traffic.kinds[v.kind].body;
          v.ownsGeometry = false;
        }
        v.crashed = false;
        v.cone.visible = true;
        v.group.rotation.set(0, 0, 0);
        v.group.position.y = 0;
      } else {
        root.remove(w.half.group);
        w.half.material.dispose();
      }
    }
    wrecks.length = 0;
  }

  return {
    crash,
    slice,
    update,
    reset,
    blockersAhead,
    wreckAt,
    get wreckCount() { return wrecks.length; },
    get flyingCount() { return flying.length; },
  };
}
