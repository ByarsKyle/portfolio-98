// ─────────────────────────────────────────────────────────────
// core/lighting — dusk outside, tungsten inside.
//
// Budget: 3 shadow-casting lights (lantern, desk lamp, window sun).
// Everything else is RectAreaLight fill, emissive geometry + bloom.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { glowSprite } from '../forge/texture.js';
import { mulberry32 } from '../forge/noise.js';
import { ROOM } from '../assets/room.js';

export function buildLighting(scene) {
  RectAreaLightUniformsLib.init();
  const L = {};

  // ── ambient floor: almost nothing. Cozy means contrast.
  const hemi = new THREE.HemisphereLight(0x35405c, 0x2a1d12, 0.16);
  scene.add(hemi);
  L.hemi = hemi;

  // ── dusk through the window: cold, low, raking across the floor
  const sun = new THREE.DirectionalLight(0x8fb0e8, 0.55);
  sun.position.set(-7.2, 3.4, 1.6);
  sun.target.position.set(0.6, 0.6, -0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 16;
  const sc = sun.shadow.camera;
  sc.left = -3.4; sc.right = 3.4; sc.top = 3.0; sc.bottom = -1.2;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);
  L.sun = sun;

  // soft sky fill filling the window aperture
  const skyFill = new THREE.RectAreaLight(0x7d9fd8, 2.6, 1.7, 1.1);
  skyFill.position.set(ROOM.x0 + 0.09, 1.5, 0);
  skyFill.lookAt(2, 1.2, 0);
  scene.add(skyFill);
  L.skyFill = skyFill;

  // ── paper lantern on the ceiling — the room's key light
  const lantern = new THREE.PointLight(0xffb765, 9.5, 8.5, 1.9);
  lantern.position.set(-0.45, 2.18, 0.35);
  lantern.castShadow = true;
  lantern.shadow.mapSize.set(1024, 1024);
  lantern.shadow.bias = -0.0035;
  lantern.shadow.normalBias = 0.03;
  lantern.shadow.camera.near = 0.08;
  lantern.shadow.camera.far = 8;
  scene.add(lantern);
  L.lantern = lantern;

  // ── desk lamp — warm pool on the desk, hard-ish shadow
  const lamp = new THREE.SpotLight(0xffc07a, 11.0, 3.6, Math.PI * 0.36, 0.55, 1.6);
  lamp.position.set(1.36, 1.28, -2.02);
  lamp.target.position.set(1.0, 0.74, -1.85);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0022;
  lamp.shadow.normalBias = 0.018;
  lamp.shadow.camera.near = 0.05;
  lamp.shadow.camera.far = 4;
  lamp.shadow.focus = 1.0;
  scene.add(lamp, lamp.target);
  L.lamp = lamp;

  // ── bedside warmth (no shadow, just bounce)
  const bedside = new THREE.PointLight(0xff9a4e, 1.15, 2.2, 2.0);
  bedside.position.set(1.90, 0.92, 1.86);
  scene.add(bedside);
  L.bedside = bedside;

  // ── the CRT itself lights the desk. Colour is driven by screen content.
  const crtLight = new THREE.RectAreaLight(0xa8d0ff, 0.0, 0.34, 0.26);
  crtLight.position.set(0.62, 1.06, -1.83);
  crtLight.lookAt(0.62, 0.95, 0.6);
  scene.add(crtLight);
  L.crtLight = crtLight;

  const crtBounce = new THREE.PointLight(0x93c4ff, 0.0, 2.2, 2.0);
  crtBounce.position.set(0.62, 1.02, -1.70);
  scene.add(crtBounce);
  L.crtBounce = crtBounce;

  // ── fairy lights strung along the north/east corner
  const fairy = new THREE.Group();
  const bulbGeo = new THREE.SphereGeometry(0.011, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const sprite = glowSprite(128, '#ffcf8f', 2.6);
  const rnd = mulberry32(64);
  const pts = [];
  const A = new THREE.Vector3(ROOM.x0 + 0.25, 2.28, ROOM.z0 + 0.06);
  const B = new THREE.Vector3(ROOM.x1 - 0.15, 2.36, ROOM.z0 + 0.06);
  const COUNT = 17;
  for (let i = 0; i < COUNT; i++) {
    const t = i / (COUNT - 1);
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * 0.16 + Math.sin(t * Math.PI * 3.1) * 0.03;
    pts.push(p);
    const b = new THREE.Mesh(bulbGeo, bulbMat);
    b.position.copy(p);
    fairy.add(b);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sprite, color: 0xffc27a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.scale.setScalar(0.10 + rnd() * 0.03);
    s.position.copy(p);
    fairy.add(s);
  }
  // the wire itself
  const wireCurve = new THREE.CatmullRomCurve3(pts);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(wireCurve, 80, 0.0016, 5, false),
    new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.85 }),
  );
  fairy.add(wire);
  scene.add(fairy);
  L.fairy = fairy;

  const fairyLight = new THREE.PointLight(0xffb060, 1.5, 3.2, 2.0);
  fairyLight.position.set(0.2, 2.1, ROOM.z0 + 0.35);
  scene.add(fairyLight);
  L.fairyLight = fairyLight;

  // ── dust motes drifting in the window shaft
  const MOTES = 190;
  const mg = new THREE.BufferGeometry();
  const mp = new Float32Array(MOTES * 3);
  const ms = new Float32Array(MOTES);
  const mr = mulberry32(19);
  for (let i = 0; i < MOTES; i++) {
    mp[i * 3] = ROOM.x0 + mr() * 2.6;
    mp[i * 3 + 1] = 0.2 + mr() * 2.2;
    mp[i * 3 + 2] = -1.4 + mr() * 2.8;
    ms[i] = 0.4 + mr() * 0.8;
  }
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('aScale', new THREE.BufferAttribute(ms, 1));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTex: { value: glowSprite(64, '#ffffff', 2.0) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aScale;
      uniform float uTime;
      varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * 0.12;
        p.x += sin(t + position.z * 3.1 + position.y * 2.0) * 0.09;
        p.y += sin(t * 0.8 + position.x * 2.4) * 0.06 + mod(t * 0.05, 0.4);
        p.z += cos(t * 0.7 + position.y * 2.7) * 0.07;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aScale * 7.5 / -mv.z;
        // brightest where the window shaft cuts through
        float shaft = smoothstep(1.4, -0.3, abs(p.z - 0.1) * 1.6 + abs(p.x + 0.9) * 0.7);
        vA = shaft * 0.16 * aScale;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex;
      varying float vA;
      void main(){
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vec3(0.85, 0.88, 1.0), t.a * vA);
      }
    `,
  });
  const motes = new THREE.Points(mg, moteMat);
  scene.add(motes);
  L.motes = motes;

  // ── a faint light shaft from the window. A flat additive quad reads as a
  // hard-edged triangle painted on the wall, so it's a sprite with a soft
  // radial falloff instead, and it never touches a surface.
  const shaft = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowSprite(256, '#a8c4f0', 1.5),
    color: 0x9ab8e8, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  shaft.scale.set(2.1, 1.5, 1);
  shaft.position.set(ROOM.x0 + 0.95, 1.45, 0.05);
  scene.add(shaft);
  L.shaft = shaft;

  // flicker state
  const flick = { lantern: lantern.intensity, lamp: lamp.intensity, fairy: fairyLight.intensity };

  L.update = (t, dt) => {
    moteMat.uniforms.uTime.value = t;
    // tungsten filaments wobble a touch on old wiring
    lantern.intensity = flick.lantern * (1 + Math.sin(t * 2.3) * 0.012 + Math.sin(t * 11.7) * 0.006);
    lamp.intensity = flick.lamp * (1 + Math.sin(t * 3.1 + 1.2) * 0.010);
    fairyLight.intensity = flick.fairy * (1 + Math.sin(t * 1.7) * 0.06);
    for (let i = 0; i < fairy.children.length; i++) {
      const c = fairy.children[i];
      if (c.isSprite) c.material.opacity = 0.48 + Math.sin(t * 1.4 + i * 0.9) * 0.10;
    }
  };

  /** Called each frame by the CRT so the monitor actually lights the room. */
  L.setScreen = (r, g, b, power) => {
    crtLight.color.setRGB(r, g, b);
    crtLight.intensity = power * 4.6;
    crtBounce.color.setRGB(r, g, b);
    crtBounce.intensity = power * 0.9;
  };

  return L;
}
