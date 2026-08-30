// Geometry construction helpers.
//
// The important idea in this file is the merge. A car built the obvious way --
// a mesh for the body, one for the cabin, one for the glass, four for the
// wheels, two for the lights -- is nine draw calls. Twenty-five cars on screen
// is 225 draw calls before a single piece of scenery, and on a phone that is
// where the frame budget goes to die.
//
// So every vehicle is baked down to ONE geometry with vertex colours, drawn
// with ONE material. The trick that makes per-car paint colours still work:
// vertex colour multiplies material colour, so parts that must stay dark
// regardless (tyres, glass, tarmac-black trim) get near-black vertex colours
// and shrug the paint off, while body panels get white vertex colours and take
// the material colour exactly. Two draw calls per car, paint still varies.

import * as THREE from 'three';

/**
 * A rounded rectangle in the XZ plane, extruded upward in Y.
 *
 * Plan-view corner radius is what sells a vehicle from a 46-degree camera --
 * you are looking mostly at the roof and bonnet, and a hard-cornered box reads
 * instantly as a box. The bevel softens the top edge so it catches a highlight.
 */
export function slab(length, width, height, { radius = 0.35, bevel = 0.06, taper = 0 } = {}) {
  const r = Math.min(radius, Math.min(length, width) / 2 - 0.01);
  const shape = new THREE.Shape();
  const hl = length / 2;
  const hw = width / 2;

  shape.moveTo(-hl + r, -hw);
  shape.lineTo(hl - r, -hw);
  shape.quadraticCurveTo(hl, -hw, hl, -hw + r);
  shape.lineTo(hl, hw - r);
  shape.quadraticCurveTo(hl, hw, hl - r, hw);
  shape.lineTo(-hl + r, hw);
  shape.quadraticCurveTo(-hl, hw, -hl, hw - r);
  shape.lineTo(-hl, -hw + r);
  shape.quadraticCurveTo(-hl, -hw, -hl + r, -hw);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });

  // ExtrudeGeometry builds in XY and extrudes along +Z. Stand it up so the
  // extrusion runs along +Y and the profile lies in XZ.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);

  if (taper !== 0) {
    // Pinch the top face inward, which turns a slab into a windscreen rake.
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, y / height));
      const k = 1 - t * taper;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  return geometry;
}

/** A wheel. Traffic runs along X, so the axle lies along Z. */
export function wheel(radius, width, segments = 12) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/**
 * Merges parts into a single non-indexed geometry carrying a colour attribute.
 *
 * @param {Array<{ geometry: THREE.BufferGeometry, position?: number[],
 *                 rotation?: number[], scale?: number[], color?: number }>} parts
 */
export function merge(parts) {
  const chunks = [];
  let total = 0;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  for (const part of parts) {
    const source = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();

    pos.fromArray(part.position || [0, 0, 0]);
    euler.fromArray(part.rotation || [0, 0, 0]);
    quaternion.setFromEuler(euler);
    scl.fromArray(part.scale || [1, 1, 1]);
    matrix.compose(pos, quaternion, scl);
    source.applyMatrix4(matrix);

    if (!source.attributes.uv) {
      // Some primitives arrive without UVs; the merged buffer needs every
      // attribute present on every chunk or the concatenation goes ragged.
      const count = source.attributes.position.count;
      source.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }

    color.set(part.color === undefined ? 0xffffff : part.color);
    const count = source.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    source.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    chunks.push(source);
    total += count;
  }

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const colorAttr = new Float32Array(total * 3);

  let v = 0;
  for (const chunk of chunks) {
    const count = chunk.attributes.position.count;
    position.set(chunk.attributes.position.array, v * 3);
    normal.set(chunk.attributes.normal.array, v * 3);
    uv.set(chunk.attributes.uv.array.subarray(0, count * 2), v * 2);
    colorAttr.set(chunk.attributes.color.array, v * 3);
    v += count;
    chunk.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Splits a geometry into two halves either side of the plane `x = cut`,
 * returning two new geometries: [negative side, positive side].
 *
 * This is how the laser cuts a car in half, so it is a REAL clip: triangles
 * that straddle the plane are split along it, with position, normal, uv and
 * colour interpolated at the crossing. The cut faces are left open -- the
 * halves are drawn double-sided, so the visible interior reads as a dark
 * metal shell, which is exactly right for two seconds of tumbling wreckage.
 */
export function sliceAlongX(geometry, cut) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = source.attributes.position;
  const nrm = source.attributes.normal;
  const uv = source.attributes.uv;
  const col = source.attributes.color;

  const vertexAt = (i) => ({
    p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
    n: nrm ? [nrm.getX(i), nrm.getY(i), nrm.getZ(i)] : [0, 1, 0],
    u: uv ? [uv.getX(i), uv.getY(i)] : [0, 0],
    c: col ? [col.getX(i), col.getY(i), col.getZ(i)] : [1, 1, 1],
  });

  const lerp = (a, b, t) => ({
    p: a.p.map((v, k) => v + (b.p[k] - v) * t),
    n: a.n.map((v, k) => v + (b.n[k] - v) * t),
    u: a.u.map((v, k) => v + (b.u[k] - v) * t),
    c: a.c.map((v, k) => v + (b.c[k] - v) * t),
  });

  const sides = [[], []];

  /** Fan-triangulates a convex polygon into a side's vertex list. */
  function emit(side, poly) {
    for (let k = 1; k + 1 < poly.length; k += 1) {
      sides[side].push(poly[0], poly[k], poly[k + 1]);
    }
  }

  for (let t = 0; t < pos.count; t += 3) {
    const tri = [vertexAt(t), vertexAt(t + 1), vertexAt(t + 2)];
    const d = tri.map((v) => v.p[0] - cut);

    if (d.every((v) => v <= 0)) { emit(0, tri); continue; }
    if (d.every((v) => v >= 0)) { emit(1, tri); continue; }

    // Straddles the plane: Sutherland-Hodgman against x = cut, both sides.
    const neg = [];
    const posPoly = [];
    for (let k = 0; k < 3; k += 1) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      const da = d[k];
      const db = d[(k + 1) % 3];

      if (da <= 0) neg.push(a);
      if (da >= 0) posPoly.push(a);

      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const crossing = lerp(a, b, da / (da - db));
        neg.push(crossing);
        posPoly.push(crossing);
      }
    }
    if (neg.length >= 3) emit(0, neg);
    if (posPoly.length >= 3) emit(1, posPoly);
  }

  return sides.map((verts) => {
    const g = new THREE.BufferGeometry();
    const count = verts.length;
    const p = new Float32Array(count * 3);
    const n = new Float32Array(count * 3);
    const u = new Float32Array(count * 2);
    const c = new Float32Array(count * 3);

    verts.forEach((vert, i) => {
      p.set(vert.p, i * 3);
      n.set(vert.n, i * 3);
      u.set(vert.u, i * 2);
      c.set(vert.c, i * 3);
    });

    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  });
}
