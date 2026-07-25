// ─────────────────────────────────────────────────────────────
// core/engine — renderer, post chain, procedural IBL.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

/**
 * Final grade: filmic vignette, subtle chromatic aberration toward the edges,
 * animated grain, and a warm/cool split-tone that pushes the "dusk indoors"
 * feeling harder than lighting alone can.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.05 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0016 },
    uWarmth: { value: 0.06 },
    uFade: { value: 0.0 },        // 1 = fully black (used for the dive transition)
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uWarmth, uFade;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);

      // lateral chromatic aberration, zero at centre
      vec2 off = c * r2 * uAberration * 8.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;

      // split tone: lift warmth in the mids, cool the shadows slightly
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(uWarmth, uWarmth * 0.45, -uWarmth * 0.55) * smoothstep(0.05, 0.75, lum);
      col.b += (1.0 - smoothstep(0.0, 0.25, lum)) * 0.018;

      // vignette
      float vig = 1.0 - uVignette * r2 * (0.9 + 0.35 * r2);
      col *= clamp(vig, 0.0, 1.0);

      // grain, slightly stronger in the shadows like real film
      float g = hash(uv * vec2(1024.0, 768.0) + fract(uTime) * 91.7) - 0.5;
      col += g * uGrain * (1.25 - lum);

      col *= (1.0 - uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.02, 60);

  // The post chain wants a float buffer so bloom has real HDR headroom, but
  // a handful of drivers (and every software rasteriser) ship half-float
  // render targets without OES_texture_half_float_linear — sampling one then
  // returns black. Detect that and fall back to 8-bit rather than render
  // nothing at all.
  const gl = renderer.getContext();
  const canFilterHalfFloat = !!gl.getExtension('OES_texture_half_float_linear');
  const bufferType = canFilterHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const dpr = Math.min(devicePixelRatio, 2);
  const target = new THREE.WebGLRenderTarget(
    Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr),
    {
      type: bufferType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
    },
  );

  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(dpr);
  composer.setSize(innerWidth, innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.68, 0.90,
  );
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  const smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  composer.addPass(smaa);

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, composer, bloom, grade, renderPass, hdr: canFilterHalfFloat };
}

/**
 * Procedural IBL. Instead of shipping an HDR, we render a tiny scene of
 * emissive quads — dusk window, warm ceiling bounce, dark floor — through
 * PMREM. Gives the CRT glass and chrome something believable to reflect.
 */
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const env = new THREE.Scene();

  const quad = (w, h, color, intensity, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.rotation.set(...rot);
    env.add(m);
    return m;
  };

  // enclosing shell: dim warm walls, darker floor, faint ceiling bounce
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(12, 7, 12),
    new THREE.MeshBasicMaterial({ color: 0x2a2119, side: THREE.BackSide }),
  );
  env.add(shell);
  quad(12, 12, 0x14100c, 1.0, [0, -3.4, 0], [-Math.PI / 2, 0, 0]);   // floor
  quad(12, 12, 0x3a2f22, 0.5, [0, 3.4, 0], [Math.PI / 2, 0, 0]);     // ceiling
  quad(2.4, 2.0, 0x5f7fb8, 2.2, [0, 0.6, -5.9]);                     // dusk window
  quad(1.2, 0.6, 0xffb066, 9.0, [1.9, 1.4, -1.0]);                   // desk lamp
  quad(0.9, 0.9, 0xffc98a, 4.0, [-2.2, 2.6, 1.0]);                   // ceiling lantern
  quad(1.0, 0.75, 0x9fd0ff, 2.6, [0.4, 0.5, -2.4]);                  // CRT spill

  const target = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return target.texture;
}
