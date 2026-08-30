// Power-up pickups, floating over the median strips.
//
// Eric put them "in the middle of the road" on purpose: reaching one costs a
// detour through traffic. Each is a glowing orb in the power-up's colour with
// its glyph floating inside, bobbing and slowly turning. The orb is emissive
// and untone-mapped so the bloom pass haloes it, which is what makes it read
// as a prize from the far side of six lanes.
//
// Coins live here too: they sit IN the lanes, between the cars, because money
// you can pick up safely is not money in this game.

import * as THREE from 'three';
import { POWERUPS, POWERUP_SPAWN, COINS, ROAD_HALF_WIDTH } from '../config.js';
import { makeRadial } from '../engine/textures.js';

/** Glyph on a transparent canvas, for the icon quad inside the orb. */
function glyphTexture(glyph, color) {
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(glyph, size / 2, size / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPowerups(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const haloTexture = makeRadial({
    stops: [[0, 'rgba(255,255,255,0.85)'], [0.4, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']],
  });

  const orbGeometry = new THREE.SphereGeometry(0.34, 18, 14);
  const iconGeometry = new THREE.PlaneGeometry(0.5, 0.5);
  const haloGeometry = new THREE.PlaneGeometry(2.4, 2.4);
  const coinGeometry = new THREE.CylinderGeometry(COINS.radius * 0.55, COINS.radius * 0.55, 0.09, 18);
  coinGeometry.rotateX(Math.PI / 2); // face the camera-ish, spin on Y

  const glyphs = {};
  for (const spec of Object.values(POWERUPS)) {
    glyphs[spec.id] = glyphTexture(spec.glyph, spec.color);
  }

  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xf6c33d,
    metalness: 0.85,
    roughness: 0.25,
    emissive: 0x6b4a08,
    emissiveIntensity: 0.55,
  });
  coinMaterial.__shared = true;

  /** Live pickups: { kind: 'power'|'coin', type, x, z, group, phase } */
  const items = [];

  function clear() {
    for (const item of items) {
      root.remove(item.group);
      item.group.traverse((o) => {
        if (o.isMesh && o.material && !o.material.__shared) o.material.dispose();
      });
    }
    items.length = 0;
  }

  function addPower(type, x, z) {
    const spec = POWERUPS[type];
    const color = new THREE.Color(spec.color);
    const group = new THREE.Group();

    const orb = new THREE.Mesh(orbGeometry, new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      toneMapped: false,
    }));
    group.add(orb);

    const icon = new THREE.Mesh(iconGeometry, new THREE.MeshBasicMaterial({
      map: glyphs[type],
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    group.add(icon);

    const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
      map: haloTexture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.75,
    }));
    group.add(halo);

    // The pool of colour on the concrete beneath, so the median glows.
    const ground = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
      map: haloTexture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.4,
    }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -POWERUP_SPAWN.hover + 0.05;
    group.add(ground);

    group.position.set(x, POWERUP_SPAWN.hover + 0.17, z);
    root.add(group);
    items.push({ kind: 'power', type, x, z, group, phase: Math.random() * 9, icon, halo });
  }

  function addCoin(x, z) {
    const group = new THREE.Group();
    const coin = new THREE.Mesh(coinGeometry, coinMaterial);
    group.add(coin);
    group.position.set(x, COINS.hover, z);
    root.add(group);
    items.push({ kind: 'coin', x, z, group, phase: Math.random() * 9 });
  }

  /**
   * Populates a fresh stage. Power-ups on medians, coins in the lanes.
   */
  function populate(stage, centres) {
    clear();
    const types = Object.keys(POWERUPS);
    const weights = { invincible: 0.28, life: 0.18, runaway: 0.26, laser: 0.28 };

    stage.bands.forEach((band, i) => {
      const z = centres[i];

      if (band.kind === 'median' && Math.random() < POWERUP_SPAWN.chance) {
        let roll = Math.random();
        let type = types[0];
        for (const t of types) {
          roll -= weights[t] ?? 0.25;
          if (roll <= 0) { type = t; break; }
        }
        addPower(type, (Math.random() * 2 - 1) * ROAD_HALF_WIDTH * 0.7, z);
      }

      if (band.kind === 'lane' && Math.random() < COINS.perLane) {
        const count = 1 + (Math.random() < COINS.perLane - 1 ? 1 : 0);
        for (let c = 0; c < count; c += 1) {
          addCoin((Math.random() * 2 - 1) * ROAD_HALF_WIDTH * 0.85, z);
        }
      }
    });
  }

  function update(dt, playerX, playerZ, cameraQuaternion, events) {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      item.phase += dt;

      if (item.kind === 'power') {
        item.group.position.y = POWERUP_SPAWN.hover + 0.17 + Math.sin(item.phase * 2.1) * 0.14;
        item.icon.quaternion.copy(cameraQuaternion);
        item.halo.quaternion.copy(cameraQuaternion);
        item.halo.material.opacity = 0.6 + Math.sin(item.phase * 3.7) * 0.2;
      } else {
        item.group.rotation.y = item.phase * 2.6;
        item.group.position.y = COINS.hover + Math.sin(item.phase * 2.4) * 0.08;
      }

      const radius = item.kind === 'power' ? POWERUP_SPAWN.radius : COINS.radius;
      const dx = item.x - playerX;
      const dz = item.z - playerZ;
      if (dx * dx + dz * dz < radius * radius) {
        root.remove(item.group);
        items.splice(i, 1);
        if (item.kind === 'power') events.onPower?.(item.type, item.x, item.z);
        else events.onCoin?.(item.x, item.z);
      }
    }
  }

  return {
    populate,
    update,
    clear,
    get count() { return items.length; },
    get powerCount() { return items.filter((i) => i.kind === 'power').length; },
  };
}
