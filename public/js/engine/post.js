// The post chain: bloom and the grade, hand-rolled as three small passes.
//
//   1. scene   -> full-res target
//   2. bright  -> quarter-res threshold, then a horizontal and a vertical
//                 blur ping-pong at quarter res (bandwidth is the budget on a
//                 tile-based mobile GPU; quarter res is 1/16th the pixels)
//   3. composite -> screen: base + bloom, split-tone grade (teal shadows,
//                 sodium highlights -- the reference stills' whole palette),
//                 vignette, and a whisper of film grain
//
// No EffectComposer, no addon imports: the passes are three materials and a
// fullscreen triangle, which keeps the vendored surface area to three.js core
// and makes the whole chain legible in one file.

import * as THREE from 'three';

const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** One triangle that covers the screen; cheaper than a quad, no seam. */
function screenGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1, -1, 0, 3, -1, 0, -1, 3, 0,
  ]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0, 0, 2, 0, 0, 2,
  ]), 2));
  return geometry;
}

export function createPost(renderer) {
  const options = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  };

  const sceneRT = new THREE.WebGLRenderTarget(2, 2, options);
  const blurA = new THREE.WebGLRenderTarget(2, 2, { ...options, depthBuffer: false });
  const blurB = new THREE.WebGLRenderTarget(2, 2, { ...options, depthBuffer: false });

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(screenGeometry(), null);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const brightMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uThreshold: { value: 0.6 },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tInput;
      uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tInput, vUv).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        float k = smoothstep(uThreshold, uThreshold + 0.25, l);
        gl_FragColor = vec4(c * k, 1.0);
      }
    `,
  });

  const blurMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uStep: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tInput;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        // 9-tap gaussian, weights summing to 1.
        vec3 sum = texture2D(tInput, vUv).rgb * 0.227;
        sum += texture2D(tInput, vUv + uStep * 1.385).rgb * 0.316;
        sum += texture2D(tInput, vUv - uStep * 1.385).rgb * 0.316;
        sum += texture2D(tInput, vUv + uStep * 3.231).rgb * 0.0703;
        sum += texture2D(tInput, vUv - uStep * 3.231).rgb * 0.0703;
        gl_FragColor = vec4(sum, 1.0);
      }
    `,
  });

  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.9 },
      uTime: { value: 0 },
      uShadowTint: { value: new THREE.Color(0x14222e) },
      uHighTint: { value: new THREE.Color(0xffdcae) },
      uVignette: { value: 0.42 },
    },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float uBloom;
      uniform float uTime;
      uniform vec3 uShadowTint;
      uniform vec3 uHighTint;
      uniform float uVignette;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec3 c = texture2D(tScene, vUv).rgb;
        c += texture2D(tBloom, vUv).rgb * uBloom;

        // Split tone: pull the darks cold and the brights sodium-warm.
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c * (vec3(0.78) + uShadowTint * 3.0), mix(c, uHighTint * l * 1.12, 0.22), smoothstep(0.1, 0.68, l));

        // A gentle S-curve for contrast.
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);

        // Vignette.
        vec2 d = vUv - 0.5;
        c *= 1.0 - dot(d, d) * uVignette * 2.2;

        // Grain: animated, subtle, breaks up the banding in the fog.
        c += (hash(vUv * 917.0 + uTime) - 0.5) * 0.028;

        // ShaderMaterial gets no automatic output encode, so the linear ->
        // sRGB conversion for the canvas happens here, by hand. Without this
        // the whole game reads several stops darker than authored.
        c = max(c, vec3(0.0));
        c = pow(c, vec3(1.0 / 2.2));

        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

  function setSize(width, height, pixelRatio) {
    const w = Math.max(2, Math.floor(width * pixelRatio));
    const h = Math.max(2, Math.floor(height * pixelRatio));
    sceneRT.setSize(w, h);
    blurA.setSize(w >> 2, h >> 2);
    blurB.setSize(w >> 2, h >> 2);
  }

  /** Renders `scene` through the chain to the screen. */
  function render(scene, camera, time) {
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    quad.material = brightMaterial;
    brightMaterial.uniforms.tInput.value = sceneRT.texture;
    renderer.setRenderTarget(blurA);
    renderer.render(quadScene, quadCamera);

    quad.material = blurMaterial;
    blurMaterial.uniforms.tInput.value = blurA.texture;
    blurMaterial.uniforms.uStep.value.set(1 / blurA.width, 0);
    renderer.setRenderTarget(blurB);
    renderer.render(quadScene, quadCamera);

    blurMaterial.uniforms.tInput.value = blurB.texture;
    blurMaterial.uniforms.uStep.value.set(0, 1 / blurA.height);
    renderer.setRenderTarget(blurA);
    renderer.render(quadScene, quadCamera);

    quad.material = compositeMaterial;
    compositeMaterial.uniforms.tScene.value = sceneRT.texture;
    compositeMaterial.uniforms.tBloom.value = blurA.texture;
    compositeMaterial.uniforms.uTime.value = time % 97;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCamera);
  }

  return {
    render,
    setSize,
    uniforms: compositeMaterial.uniforms,
    dispose() {
      sceneRT.dispose();
      blurA.dispose();
      blurB.dispose();
      brightMaterial.dispose();
      blurMaterial.dispose();
      compositeMaterial.dispose();
      quad.geometry.dispose();
    },
  };
}
