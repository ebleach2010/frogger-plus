// The sky, and the image-based lighting derived from it.
//
// This module is doing more work than its name suggests. In a PBR scene the
// environment map is not decoration -- it IS most of the lighting. Wet asphalt
// is a near-mirror wherever water is standing, and what it mirrors is this.
// Getting the sky gradient right is therefore the difference between a road
// that looks wet and a road that looks like grey plastic.
//
// The palette comes straight off Eric's reference stills: a cold teal-to-violet
// night sky, a dirty sodium-orange band low down where the city lights bounce
// off the cloud base, and near-black overhead. That orange band is what puts
// the warm streaks in the puddles.

import * as THREE from 'three';

/** Per-theme sky and fog. Keyed by the theme names in config.js. */
export const SKIES = {
  highway: {
    top: 0x0a0e18,
    horizon: 0x2a2036,
    glow: 0x6b4326,
    glowHeight: 0.16,
    fog: 0x131320,
    fogNear: 26,
    fogFar: 112,
    ambient: 1.5,
    fillSky: 0x46527a,
    keyColor: 0xa8b4cc,
    keyIntensity: 5.6,
  },
  flood: {
    top: 0x080f16,
    horizon: 0x1d2c33,
    glow: 0x4a5b52,
    glowHeight: 0.2,
    fog: 0x101a1e,
    fogNear: 26,
    fogFar: 104,
    ambient: 1.6,
    fillSky: 0x3d5a5e,
    keyColor: 0x9fc4c8,
    keyIntensity: 5.0,
  },
  junkyard: {
    top: 0x05070c,
    horizon: 0x120f16,
    glow: 0x3a2412,
    glowHeight: 0.11,
    fog: 0x08090e,
    fogNear: 16,
    fogFar: 70,
    ambient: 1.05,
    fillSky: 0x2c3040,
    keyColor: 0x7d8ba8,
    keyIntensity: 3.4,
  },
};

/**
 * Builds a sky dome whose vertex colours run top -> horizon -> glow, and
 * returns both the mesh and a PMREM environment map generated from it.
 *
 * The dome is drawn with BackSide and no lighting, so it costs one shaderless
 * pass over the visible sky pixels and nothing else.
 */
export function createSky(renderer, themeName) {
  const theme = SKIES[themeName] || SKIES.highway;

  const geometry = new THREE.SphereGeometry(200, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(theme.top) },
      uHorizon: { value: new THREE.Color(theme.horizon) },
      uGlow: { value: new THREE.Color(theme.glow) },
      uGlowHeight: { value: theme.glowHeight },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform float uGlowHeight;
      varying vec3 vWorld;

      void main() {
        // 0 at the horizon, 1 straight up.
        float h = clamp(normalize(vWorld).y * 0.5 + 0.5, 0.0, 1.0);

        // Two blends: horizon -> top over the upper hemisphere, and a tight
        // sodium band hugging the horizon line.
        vec3 sky = mix(uHorizon, uTop, smoothstep(0.5, 0.95, h));
        float band = 1.0 - smoothstep(0.5, 0.5 + uGlowHeight, h);
        band *= smoothstep(0.34, 0.5, h);
        sky += uGlow * band * 1.5;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  // Render the dome once into an equirect target and prefilter it. This is a
  // one-off cost per stage theme, not a per-frame one.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry.clone(), material.clone()));
  const envRT = pmrem.fromScene(scene, 0, 0.1, 300);
  pmrem.dispose();
  scene.clear();

  return {
    mesh,
    environment: envRT.texture,
    theme,
    dispose() {
      geometry.dispose();
      material.dispose();
      envRT.dispose();
    },
  };
}

/**
 * The key light. One directional light with a shadow camera clamped tightly
 * around the player.
 *
 * A shadow camera sized to the whole road would spread 2048 texels over 70
 * metres and give soft mush. Sized to a 30-metre box that follows the player,
 * the same texels land where the eye actually is. Everything outside that box
 * has no shadow, and at night in the rain nobody notices.
 */
export function createKeyLight(theme) {
  const light = new THREE.DirectionalLight(theme.keyColor, theme.keyIntensity);
  light.position.set(-16, 30, 12);
  light.castShadow = true;

  const span = 17;
  light.shadow.camera.left = -span;
  light.shadow.camera.right = span;
  light.shadow.camera.top = span;
  light.shadow.camera.bottom = -span;
  light.shadow.camera.near = 4;
  light.shadow.camera.far = 78;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0016;
  light.shadow.normalBias = 0.035;
  light.shadow.radius = 2.2;

  return light;
}

/** Keeps the shadow box centred on the player as he crosses. */
export function trackKeyLight(light, targetX, targetZ) {
  light.position.set(targetX - 16, 30, targetZ + 12);
  light.target.position.set(targetX, 0, targetZ);
  light.target.updateMatrixWorld();
}
