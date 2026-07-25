// ─────────────────────────────────────────────────────────────
// assets/desktop — the machine.
//
//  · 17" beige CRT with a real curved tube, aperture-grille shader,
//    glass layer, vents, badge and a green power LED
//  · Dell mid-tower under the desk: bays, floppy, LEDs, badge
//  · keyboard with 104 individually-modelled keycaps, ball mouse,
//    speakers, mousepad, cabling
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../forge/materials.js';
import {
  roundedBox, extrude, roundRectPts, lathe, withUV2, mergeGeometries, cable,
} from '../forge/geo.js';
import { draw } from '../forge/texture.js';
import { mulberry32 } from '../forge/noise.js';
import { DESK } from './furniture.js';
import { ROOM } from './room.js';
import { createOS } from '../os/os.js';

const mesh = (geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(withUV2(geo), material);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

// where the monitor sits, in world space
export const CRT = {
  x: DESK.x - 0.30, y: DESK.h, z: DESK.z - 0.10,
  screenW: 0.325, screenH: 0.245,      // visible tube area (17" 4:3)
};

/* ── the tube shader ──────────────────────────────────────────
   Barrel-distorted UVs, aperture-grille RGB mask, scanlines with
   a slow roll, bloom halo, phosphor tint, corner vignette and the
   faint interlace flicker of a 60 Hz tube.                       */
export const CRTShader = {
  uniforms: {
    uMap: { value: null },
    uTime: { value: 0 },
    uCurve: { value: 0.055 },
    uScan: { value: 0.34 },
    uGrille: { value: 0.28 },
    uBright: { value: 1.30 },
    uPower: { value: 1.0 },       // 0..1 warm-up / power-down
    uRes: { value: new THREE.Vector2(640, 480) },
    uFlicker: { value: 0.02 },
    uGlow: { value: 0.55 },
    uWarp: { value: 1.0 },        // 1 = in-world tube, 0 = flat fullscreen
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D uMap;
    uniform float uTime, uCurve, uScan, uGrille, uBright, uPower, uFlicker, uGlow, uWarp;
    uniform vec2 uRes;
    varying vec2 vUv;

    vec2 barrel(vec2 uv){
      vec2 c = uv * 2.0 - 1.0;
      float r2 = dot(c, c);
      c *= 1.0 + uCurve * r2 * uWarp;
      return c * 0.5 + 0.5;
    }

    float rand(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = barrel(vUv);

      // off the edge of the tube = black glass
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
        gl_FragColor = vec4(0.005, 0.006, 0.010, 1.0);
        return;
      }

      // power-down collapses the image into a horizontal line
      float p = clamp(uPower, 0.0, 1.0);
      if (p < 0.999){
        float band = (1.0 - p);
        float y = (uv.y - 0.5) / max(0.0001, p) + 0.5;
        if (y < 0.0 || y > 1.0){
          gl_FragColor = vec4(0.004, 0.005, 0.008, 1.0);
          return;
        }
        uv.y = y;
      }

      // slight per-channel convergence error, like a tube that needs adjusting
      vec2 conv = vec2(0.55, 0.0) / uRes;
      vec3 col;
      col.r = texture2D(uMap, uv + conv).r;
      col.g = texture2D(uMap, uv).g;
      col.b = texture2D(uMap, uv - conv).b;

      // cheap glow: 4 taps of the neighbourhood added back in
      vec2 px = 2.2 / uRes;
      vec3 halo = texture2D(uMap, uv + vec2(px.x, 0.0)).rgb
                + texture2D(uMap, uv - vec2(px.x, 0.0)).rgb
                + texture2D(uMap, uv + vec2(0.0, px.y)).rgb
                + texture2D(uMap, uv - vec2(0.0, px.y)).rgb;
      col += halo * 0.25 * uGlow;

      // aperture grille: vertical RGB stripes at the pitch of the shadow mask
      float sx = uv.x * uRes.x;
      vec3 mask = vec3(
        0.92 + 0.55 * cos((sx) * 2.0944),
        0.92 + 0.55 * cos((sx + 1.0) * 2.0944),
        0.92 + 0.55 * cos((sx + 2.0) * 2.0944)
      );
      col *= mix(vec3(1.0), mask, uGrille);

      // scanlines + a very slow vertical roll
      float sy = uv.y * uRes.y + uTime * 0.6;
      float scan = 0.5 + 0.5 * cos(sy * 6.28318);
      col *= 1.0 - uScan * scan;

      // interlace shimmer + mains flicker
      col *= 1.0 + uFlicker * sin(uTime * 120.0);
      col *= 1.0 - 0.05 * step(0.5, fract(uv.y * uRes.y * 0.5 + uTime * 30.0));

      // phosphor tint: P22 runs a touch cool with warm falloff in the reds
      col *= vec3(1.0, 1.005, 1.045);
      col = pow(max(col, 0.0), vec3(0.94));
      col *= uBright * p;

      // tube vignette + corner darkening
      vec2 c = uv * 2.0 - 1.0;
      float vig = 1.0 - 0.30 * dot(c, c) - 0.16 * pow(max(abs(c.x), abs(c.y)), 8.0);
      col *= clamp(vig, 0.0, 1.0);

      // static noise floor so the black is never dead
      col += (rand(uv * 320.0 + fract(uTime)) - 0.5) * 0.012;
      col += vec3(0.004, 0.006, 0.012);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Vent slots cut as a repeating dark inset strip. */
function ventStrip(w, d, count, slotW) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const g = new THREE.BoxGeometry(slotW, 0.004, d);
    g.translate((t - 0.5) * w, 0, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function buildMonitor(group, os) {
  const g = new THREE.Group();
  g.position.set(CRT.x, CRT.y, CRT.z);
  g.rotation.y = 0.055;                    // angled slightly toward the chair
  group.add(g);

  const beige = mat('beige');
  const beigeDark = mat('beige', { color: 0xd7cfba, roughness: 0.62 });
  const black = mat('darkPlastic');

  const BW = 0.415, BH = 0.395, BD = 0.42;   // bezel box
  const BASE_H = 0.052;

  // ── tilt/swivel base
  const baseTop = lathe([
    [0.150, 0], [0.155, 0.006], [0.152, 0.020], [0.138, 0.034], [0.100, 0.044], [0.02, 0.047],
  ], 40);
  g.add(mesh(baseTop, beige, [0, 0, 0.02]));
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.152, 0.008, 10, 44),
    beigeDark,
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.set(0, 0.008, 0.02);
  baseRing.castShadow = true; baseRing.receiveShadow = true;
  g.add(baseRing);
  // rubber feet
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.006, 10), black);
    f.position.set(Math.cos(a) * 0.115, 0.003, 0.02 + Math.sin(a) * 0.115);
    f.receiveShadow = true;
    g.add(f);
  }

  // ── the housing: bezel + tapered funnel + neck
  const hous = new THREE.Group();
  hous.position.set(0, BASE_H + BH / 2 - 0.006, 0.02);
  hous.rotation.x = -0.045;                // tilted back a touch
  g.add(hous);

  // front bezel — a rounded shell with the tube opening
  const bezelOuter = roundedBox(BW, BH, 0.075, 0.028, 4);
  const bezel = mesh(bezelOuter, beige, [0, 0, BD / 2 - 0.0375]);
  hous.add(bezel);

  // the recessed lip that surrounds the glass
  const lipShape = [];
  {
    const outer = roundRectPts(BW - 0.028, BH - 0.028, 0.030, 5);
    const shape = new THREE.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
    shape.closePath();
    const hole = new THREE.Path();
    const inner = roundRectPts(CRT.screenW + 0.012, CRT.screenH + 0.012, 0.026, 5);
    hole.moveTo(inner[0][0], inner[0][1]);
    for (let i = 1; i < inner.length; i++) hole.lineTo(inner[i][0], inner[i][1]);
    hole.closePath();
    shape.holes.push(hole);
    const fg = new THREE.ExtrudeGeometry(shape, {
      depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2,
    });
    fg.translate(0, 0, BD / 2 - 0.001 - 0.022);
    hous.add(mesh(fg, beige, [0, 0.012, 0]));
  }

  // ── the tube itself: a spherical-section screen
  const SEG = 96;
  const screenGeo = new THREE.PlaneGeometry(CRT.screenW, CRT.screenH, SEG, SEG);
  {
    const pos = screenGeo.attributes.position;
    const R = 1.15;   // tube radius — gentle, like a late-90s flat-ish Trinitron
    // The glass bulges *outward*, as a real tube does. (Curving it inward
    // buries the corners inside the bezel and leaves only a disc of picture
    // showing through the aperture.)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, (x * x + y * y * 1.15) / (2 * R));
    }
    screenGeo.computeVertexNormals();
  }

  const screenMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(CRTShader.uniforms),
    vertexShader: CRTShader.vertexShader,
    fragmentShader: CRTShader.fragmentShader,
    toneMapped: true,
  });
  screenMat.uniforms.uMap.value = os.texture;

  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, 0.012, BD / 2 + 0.002);
  screen.name = 'crt-screen';
  hous.add(screen);

  // glass in front of the phosphor: reflections + dust
  const glassGeo = screenGeo.clone();
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshPhysicalMaterial({
    color: 0x0a0d12, metalness: 0.0, roughness: 0.075, transmission: 0.0,
    transparent: true, opacity: 0.12, envMapIntensity: 1.9,
    clearcoat: 1.0, clearcoatRoughness: 0.06, side: THREE.FrontSide,
  }));
  glass.position.set(0, 0.012, BD / 2 + 0.0055);
  glass.scale.set(1.005, 1.005, 1);
  hous.add(glass);

  // ── funnel: bezel cross-section tapering back to the neck
  const funnel = new THREE.Group();
  hous.add(funnel);
  {
    const steps = [
      [BW * 0.5, BH * 0.5, BD / 2 - 0.075],
      [BW * 0.47, BH * 0.47, BD / 2 - 0.13],
      [BW * 0.40, BH * 0.40, BD / 2 - 0.21],
      [BW * 0.29, BH * 0.30, BD / 2 - 0.30],
      [BW * 0.19, BH * 0.20, BD / 2 - 0.365],
      [BW * 0.13, BH * 0.135, BD / 2 - 0.40],
    ];
    const parts = [];
    for (let i = 0; i < steps.length - 1; i++) {
      const [w0, h0, z0] = steps[i];
      const [w1, h1, z1] = steps[i + 1];
      // build a lofted quad band around the rounded rect
      const ptsA = roundRectPts(w0 * 2, h0 * 2, Math.min(w0, h0) * 0.34, 5);
      const ptsB = roundRectPts(w1 * 2, h1 * 2, Math.min(w1, h1) * 0.34, 5);
      const verts = [], idx = [];
      const n = ptsA.length;
      for (let k = 0; k < n; k++) {
        verts.push(ptsA[k][0], ptsA[k][1], z0);
        verts.push(ptsB[k][0], ptsB[k][1], z1);
      }
      for (let k = 0; k < n; k++) {
        const a = k * 2, b = a + 1;
        const c = ((k + 1) % n) * 2, d = c + 1;
        idx.push(a, b, c, c, b, d);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      bg.setIndex(idx);
      bg.computeVertexNormals();
      const uv = new Float32Array((verts.length / 3) * 2);
      for (let k = 0; k < verts.length / 3; k++) { uv[k * 2] = (k % 2); uv[k * 2 + 1] = k / (verts.length / 3); }
      bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      parts.push(bg);
    }
    const shell = mergeGeometries(parts);
    const shellMesh = new THREE.Mesh(shell, beige);
    shellMesh.castShadow = true; shellMesh.receiveShadow = true;
    withUV2(shell);
    funnel.add(shellMesh);

    // back plate + neck + degauss coil bulge
    const backPlate = roundedBox(BW * 0.27, BH * 0.28, 0.03, 0.012, 2);
    funnel.add(mesh(backPlate, beige, [0, 0, BD / 2 - 0.412]));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.075, 16), beigeDark);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 0, BD / 2 - 0.445);
    neck.castShadow = true;
    funnel.add(neck);
  }

  // ── top vents
  const vents = ventStrip(BW - 0.10, 0.10, 13, 0.010);
  const ventMesh = new THREE.Mesh(vents, new THREE.MeshStandardMaterial({ color: 0x1a1815, roughness: 0.95 }));
  ventMesh.position.set(0, BH / 2 - 0.004, BD / 2 - 0.20);
  hous.add(ventMesh);
  const ventsBack = ventStrip(BW * 0.5, 0.08, 9, 0.009);
  const vb = new THREE.Mesh(ventsBack, ventMesh.material);
  vb.position.set(0, BH * 0.34, BD / 2 - 0.33);
  hous.add(vb);

  // ── front controls: a row of tactile buttons + power + LED
  const btnRowY = -BH / 2 + 0.028;
  const btnMat = beigeDark;
  for (let i = 0; i < 5; i++) {
    const b = roundedBox(0.020, 0.010, 0.008, 0.002, 1);
    hous.add(mesh(b, btnMat, [-0.11 + i * 0.027, btnRowY, BD / 2 + 0.0005]));
  }
  const power = new THREE.Mesh(
    withUV2(roundedBox(0.032, 0.020, 0.010, 0.004, 2)), btnMat,
  );
  power.position.set(BW / 2 - 0.048, btnRowY, BD / 2 + 0.001);
  power.castShadow = true;
  hous.add(power);

  const ledMat = new THREE.MeshBasicMaterial({ color: 0x35ff6a });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 10, 8), ledMat);
  led.position.set(BW / 2 - 0.086, btnRowY, BD / 2 + 0.004);
  hous.add(led);

  // ── badges: brand wordmark + model plate, drawn as textures
  const badgeTex = draw(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#3b3730';
    ctx.font = '600 62px ui-sans-serif, system-ui, Helvetica, Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = '10px';
    ctx.fillText('TRINITRON', 20, h / 2 + 2);
  }, { srgb: true });
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.115, 0.029),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true, opacity: 0.55 }),
  );
  badge.position.set(-BW / 2 + 0.085, btnRowY + 0.001, BD / 2 + 0.0012);
  hous.add(badge);

  const modelTex = draw(256, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#57514540';
    ctx.font = '500 26px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('CPD-17SF2', w - 8, h / 2);
  });
  const modelBadge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.075, 0.019),
    new THREE.MeshBasicMaterial({ map: modelTex, transparent: true, opacity: 0.5 }),
  );
  modelBadge.position.set(BW / 2 - 0.135, btnRowY - 0.001, BD / 2 + 0.0012);
  hous.add(modelBadge);

  return { group: g, housing: hous, screen, screenMat, led, glass, BW, BH, BD, BASE_H };
}

function buildTower(group) {
  const g = new THREE.Group();
  // tucked under the right end of the desk, turned out a little
  g.position.set(DESK.x + 0.60, 0, DESK.z - 0.10);
  g.rotation.y = -0.18;
  group.add(g);

  const beige = mat('beige');
  const beigeD = mat('beige', { color: 0xd9d1bc, roughness: 0.6 });
  const black = mat('darkPlastic');
  const steelM = mat('steel', { color: 0x8d8f92, roughness: 0.42 });

  const W = 0.20, H = 0.44, D = 0.44;

  // steel chassis
  g.add(mesh(roundedBox(W, H, D, 0.006, 2), steelM, [0, H / 2, 0]));

  // beige front bezel
  const bezel = roundedBox(W + 0.006, H + 0.004, 0.028, 0.010, 3);
  g.add(mesh(bezel, beige, [0, H / 2, D / 2]));

  // 5.25" bays: CD-ROM in the top one, blank below
  const bayY = [H - 0.06, H - 0.115];
  // CD-ROM drive
  {
    const face = roundedBox(W - 0.028, 0.042, 0.010, 0.003, 1);
    g.add(mesh(face, beigeD, [0, bayY[0], D / 2 + 0.016]));
    const tray = new THREE.Mesh(new THREE.BoxGeometry(W - 0.052, 0.006, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x2a2823, roughness: 0.9 }));
    tray.position.set(-0.004, bayY[0] - 0.004, D / 2 + 0.022);
    g.add(tray);
    const eject = new THREE.Mesh(withUV2(roundedBox(0.012, 0.006, 0.006, 0.002, 1)), beigeD);
    eject.position.set(W / 2 - 0.026, bayY[0] - 0.012, D / 2 + 0.022);
    g.add(eject);
    const dled = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x1a4a20 }));
    dled.position.set(-W / 2 + 0.022, bayY[0] - 0.012, D / 2 + 0.022);
    g.add(dled);
    // "48X MAX" silk-screen
    const cdTex = draw(256, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#4a463c'; ctx.font = '500 20px ui-sans-serif, Helvetica';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('48X MAX  CD-ROM', 6, h / 2);
    });
    const cdLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.0155),
      new THREE.MeshBasicMaterial({ map: cdTex, transparent: true, opacity: 0.6 }));
    cdLabel.position.set(-0.02, bayY[0] + 0.011, D / 2 + 0.0225);
    g.add(cdLabel);
  }
  // blank bay
  g.add(mesh(roundedBox(W - 0.028, 0.040, 0.008, 0.003, 1), beigeD, [0, bayY[1], D / 2 + 0.016]));

  // 3.5" floppy
  {
    const y = H - 0.175;
    g.add(mesh(roundedBox(W - 0.052, 0.026, 0.010, 0.002, 1), beigeD, [0, y, D / 2 + 0.016]));
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.005, 0.004),
      new THREE.MeshStandardMaterial({ color: 0x1c1a16, roughness: 0.95 }));
    slot.position.set(0, y + 0.002, D / 2 + 0.022);
    g.add(slot);
    const ej = new THREE.Mesh(withUV2(roundedBox(0.016, 0.005, 0.005, 0.001, 1)), beigeD);
    ej.position.set(0.034, y - 0.008, D / 2 + 0.022);
    g.add(ej);
  }

  // front vent grille + power button + LEDs
  const grilleG = ventStrip(W - 0.05, 0.10, 9, 0.007);
  const grille = new THREE.Mesh(grilleG, new THREE.MeshStandardMaterial({ color: 0x17150f, roughness: 0.95 }));
  grille.rotation.x = Math.PI / 2;
  grille.position.set(0, 0.12, D / 2 + 0.014);
  g.add(grille);

  const powerBtn = new THREE.Mesh(withUV2(roundedBox(0.026, 0.026, 0.010, 0.005, 2)), beigeD);
  powerBtn.position.set(-W / 2 + 0.040, 0.245, D / 2 + 0.018);
  powerBtn.castShadow = true;
  g.add(powerBtn);

  const powerLed = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x4dff7a }));
  powerLed.position.set(W / 2 - 0.036, 0.248, D / 2 + 0.018);
  g.add(powerLed);

  const hddLed = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb020 }));
  hddLed.position.set(W / 2 - 0.036, 0.228, D / 2 + 0.018);
  g.add(hddLed);

  // badge
  const dellTex = draw(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = '#3f3a31';
    ctx.font = '700 44px ui-sans-serif, Helvetica, Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2px';
    // the tilted E
    const text = 'DELL';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });
  const dellBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.070, 0.035),
    new THREE.MeshBasicMaterial({ map: dellTex, transparent: true, opacity: 0.75 }));
  dellBadge.position.set(0, 0.30, D / 2 + 0.0155);
  g.add(dellBadge);

  const modelTex = draw(256, 48, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#55503f'; ctx.font = '500 19px ui-sans-serif, Helvetica';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillText('DIMENSION XPS T500', w / 2, h / 2);
  });
  const modelBadge = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.019),
    new THREE.MeshBasicMaterial({ map: modelTex, transparent: true, opacity: 0.5 }));
  modelBadge.position.set(0, 0.055, D / 2 + 0.0155);
  g.add(modelBadge);

  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.012, 0.006, 8), black);
    f.position.set(sx * (W / 2 - 0.02), 0.003, sz * (D / 2 - 0.03));
    f.receiveShadow = true;
    g.add(f);
  }

  // rear I/O + the mess of cables leaving it
  const io = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, 0.11, 0.006),
    new THREE.MeshStandardMaterial({ color: 0x3c3d40, roughness: 0.55, metalness: 0.8 }));
  io.position.set(0, 0.30, -D / 2 - 0.002);
  g.add(io);

  return { group: g, powerLed, hddLed, W, H, D };
}

function buildKeyboard(group) {
  const g = new THREE.Group();
  // on the pull-out tray
  g.position.set(DESK.x - 0.18, DESK.h - 0.097, DESK.z + 0.10);
  g.rotation.y = 0.03;
  group.add(g);

  const beige = mat('beige', { color: 0xe0d8c4 });
  const key = mat('beige', { color: 0xe6dfcd, roughness: 0.58 });
  const keyDark = mat('beige', { color: 0xcfc6b0, roughness: 0.6 });

  const KW = 0.445, KD = 0.155, KH = 0.020;

  // case with the classic back-tilt wedge
  const caseG = roundedBox(KW, KH, KD, 0.006, 2);
  {
    const pos = caseG.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setY(i, pos.getY(i) - (z / KD) * 0.012);
    }
    caseG.computeVertexNormals();
  }
  g.add(mesh(caseG, beige, [0, KH / 2, 0]));

  // 104-key layout, generated from row descriptors (widths in units)
  const U = 0.0176;             // 1 key unit
  const GAP = 0.0018;
  const rows = [
    { z: -0.058, keys: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], mods: [13] },
    { z: -0.0385, keys: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], mods: [0, 13] },
    { z: -0.019, keys: [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], mods: [0, 12] },
    { z: 0.0005, keys: [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], mods: [0, 11] },
    { z: 0.020, keys: [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25], mods: [0, 1, 2, 4, 5, 6, 7] },
  ];
  const keyParts = [], darkParts = [];
  for (const row of rows) {
    let x = -KW / 2 + 0.014;
    row.keys.forEach((wU, i) => {
      const w = wU * U - GAP;
      const isMod = row.mods?.includes(i);
      // keycap: cylindrical dish on top
      const cap = roundedBox(w, 0.0092, U - GAP, 0.0016, 2);
      const pos = cap.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y > 0) {
          const zz = pos.getZ(k) / (U / 2);
          pos.setY(k, y - (1 - zz * zz) * 0.0016);
          // taper the cap
          pos.setX(k, pos.getX(k) * 0.88);
          pos.setZ(k, pos.getZ(k) * 0.86);
        }
      }
      cap.computeVertexNormals();
      cap.translate(x + w / 2, KH - 0.001 - (row.z / KD) * 0.012 + 0.0046, row.z);
      (isMod ? darkParts : keyParts).push(cap);
      x += wU * U;
    });
  }
  // function row + nav cluster + numpad
  const fRow = [];
  let fx = -KW / 2 + 0.014;
  for (let i = 0; i < 13; i++) {
    const cap = roundedBox(U - GAP, 0.007, U * 0.78 - GAP, 0.0015, 1);
    cap.translate(fx + U / 2, KH + 0.0038, -0.076);
    fRow.push(cap);
    fx += U * (i === 0 ? 1.5 : 1);
    if (i === 0 || i === 4 || i === 8) fx += U * 0.4;
  }
  darkParts.push(...fRow);

  g.add(mesh(mergeGeometries(keyParts), key));
  g.add(mesh(mergeGeometries(darkParts), keyDark));

  // legends layer: one texture stretched over the whole key field
  const legendTex = draw(1024, 384, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#3a352c';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const rowsTxt = [
      '` 1 2 3 4 5 6 7 8 9 0 - = ⌫',
      '⇥ Q W E R T Y U I O P [ ] \\',
      '⇪ A S D F G H J K L ; \' ⏎',
      '⇧ Z X C V B N M , . / ⇧',
    ];
    ctx.font = '500 21px ui-sans-serif, Helvetica, Arial';
    rowsTxt.forEach((r, i) => {
      const chars = r.split(' ');
      const step = w / (chars.length + 1);
      chars.forEach((c, j) => ctx.fillText(c, step * (j + 1), 108 + i * 62));
    });
  });
  const legends = new THREE.Mesh(
    new THREE.PlaneGeometry(KW - 0.03, 0.088),
    new THREE.MeshBasicMaterial({ map: legendTex, transparent: true, opacity: 0.62 }),
  );
  legends.rotation.x = -Math.PI / 2 + 0.075;
  legends.position.set(0, KH + 0.0092, -0.019);
  g.add(legends);

  // three status LEDs
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 6),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0x50ff70 : 0x1e3a22 }));
    l.position.set(KW / 2 - 0.05 + i * 0.012, KH + 0.001, -0.070);
    g.add(l);
  }

  return g;
}

function buildMouse(group) {
  const g = new THREE.Group();
  g.position.set(DESK.x + 0.30, DESK.h + 0.003, DESK.z + 0.13);
  g.rotation.y = -0.22;
  group.add(g);

  const beige = mat('beige', { color: 0xe2dac6 });

  // body: a squashed, tapered dome
  const body = roundedBox(0.058, 0.030, 0.098, 0.014, 5);
  {
    const pos = body.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = (v.z + 0.049) / 0.098;                 // 0 front, 1 back
      const taper = 0.80 + t * 0.32;
      v.x *= taper;
      if (v.y > 0) v.y *= 0.62 + Math.sin(t * Math.PI) * 0.85;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    body.computeVertexNormals();
  }
  g.add(mesh(body, beige, [0, 0.015, 0]));

  // two buttons with a seam
  for (const sx of [-1, 1]) {
    const b = roundedBox(0.024, 0.008, 0.040, 0.005, 3);
    const m = mesh(b, mat('beige', { color: 0xe8e1cd, roughness: 0.55 }), [sx * 0.0135, 0.0295, -0.028]);
    m.rotation.x = -0.06;
    g.add(m);
  }

  // cable running off the back toward the tower
  const c = cable([0, 0.016, 0.05], [0.30, 0.004, 0.30], 0.05, 0.0032, 30, 0.03, 9);
  const cm = new THREE.Mesh(c, mat('darkPlastic', { color: 0xdad2be, roughness: 0.75 }));
  cm.castShadow = true;
  g.add(cm);

  return g;
}

function buildSpeakers(group) {
  const g = new THREE.Group();
  group.add(g);
  const black = mat('darkPlastic');
  const grilleM = mat('grille');

  for (const [sx, x] of [[-1, DESK.x - 0.72], [1, DESK.x + 0.44]]) {
    const s = new THREE.Group();
    s.position.set(x, DESK.h, DESK.z - 0.24);
    s.rotation.y = -sx * 0.42;
    g.add(s);

    const W = 0.085, H = 0.185, D = 0.10;
    s.add(mesh(roundedBox(W, H, D, 0.005, 2), black, [0, H / 2, 0]));
    // grille cloth panel
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.014, H - 0.030), grilleM);
    panel.position.set(0, H / 2 + 0.004, D / 2 + 0.001);
    panel.receiveShadow = true;
    withUV2(panel.geometry);
    s.add(panel);
    // driver bulges behind the cloth
    const drv = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), black);
    drv.rotation.x = Math.PI / 2;
    drv.position.set(0, H / 2 + 0.028, D / 2 - 0.004);
    s.add(drv);
    const tweet = new THREE.Mesh(new THREE.SphereGeometry(0.010, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), black);
    tweet.rotation.x = Math.PI / 2;
    tweet.position.set(0, H / 2 - 0.045, D / 2 - 0.004);
    s.add(tweet);
    // volume knob on the right-hand unit
    if (sx > 0) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.010, 16), black);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0.024, 0.030, D / 2 + 0.004);
      knob.castShadow = true;
      s.add(knob);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x50ff70 }));
      led.position.set(-0.024, 0.030, D / 2 + 0.003);
      s.add(led);
    }
  }
  return g;
}

function buildMousepad(group) {
  const tex = draw(512, 400, (ctx, w, h) => {
    ctx.fillStyle = '#1d2733'; ctx.fillRect(0, 0, w, h);
    // faded gradient print of a mountain range at dusk
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#26364d'); gr.addColorStop(0.55, '#3c3550'); gr.addColorStop(1, '#171d26');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f1620';
    ctx.beginPath(); ctx.moveTo(0, h * 0.72);
    for (let x = 0; x <= w; x += 16) {
      ctx.lineTo(x, h * 0.72 - Math.abs(Math.sin(x * 0.011)) * 70 - Math.sin(x * 0.03) * 18);
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.font = '600 22px ui-sans-serif, Helvetica'; ctx.textAlign = 'right';
    ctx.letterSpacing = '5px';
    ctx.fillText('COMPUSERVE', w - 22, h - 26);
    // wear at the edges
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.globalAlpha = 1;
  });
  const pad = new THREE.Mesh(
    withUV2(roundedBox(0.22, 0.004, 0.18, 0.010, 2)),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, normalMap: mat('grille').normalMap, normalScale: new THREE.Vector2(0.12, 0.12) }),
  );
  pad.position.set(DESK.x + 0.30, DESK.h + 0.002, DESK.z + 0.13);
  pad.rotation.y = -0.22;
  pad.receiveShadow = true;
  group.add(pad);
  return pad;
}

export function buildDesktop(scene) {
  const group = new THREE.Group();
  group.name = 'desktop';
  scene.add(group);

  const os = createOS();

  const monitor = buildMonitor(group, os);
  const tower = buildTower(group);
  buildKeyboard(group);
  buildMousepad(group);
  buildMouse(group);
  buildSpeakers(group);

  // cables: monitor → tower, tower → wall
  const cm = new THREE.Mesh(
    cable([CRT.x + 0.02, DESK.h + 0.02, CRT.z - 0.19], [DESK.x + 0.56, 0.30, DESK.z - 0.30], 0.16, 0.0055, 34, 0.04, 3),
    mat('darkPlastic', { color: 0xd6cdb8, roughness: 0.8 }),
  );
  cm.castShadow = true; group.add(cm);

  const pw = new THREE.Mesh(
    cable([DESK.x + 0.62, 0.28, DESK.z - 0.32], [1.55, 0.24, ROOM.z0 + 0.04], 0.10, 0.005, 30, 0.03, 11),
    mat('darkPlastic', { color: 0x24211c, roughness: 0.85 }),
  );
  pw.castShadow = true; group.add(pw);

  // ── screen sampling: the CRT lights the room with its own image
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 12; sampleCanvas.height = 9;
  const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  let sampleTick = 0;
  const avg = { r: 0.55, g: 0.72, b: 1.0, p: 0 };

  const screenSample = () => {
    try {
      sctx.drawImage(os.canvas, 0, 0, 12, 9);
      const d = sctx.getImageData(0, 0, 12, 9).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      const lum = (r + g + b) / (n * 3 * 255);
      const mx = Math.max(r, g, b) / (n * 255) || 1;
      avg.r = (r / n / 255) / mx; avg.g = (g / n / 255) / mx; avg.b = (b / n / 255) / mx;
      avg.p = lum;
    } catch (e) { /* canvas not ready */ }
  };

  const colliders = [
    { x0: tower.group.position.x - 0.16, x1: tower.group.position.x + 0.16,
      z0: tower.group.position.z - 0.26, z1: tower.group.position.z + 0.26 },
  ];

  const state = { power: 1, targetPower: 1 };

  const update = (t, dt, camera) => {
    os.update(dt, t);
    monitor.screenMat.uniforms.uTime.value = t;

    state.power += (state.targetPower - state.power) * Math.min(1, dt * 3.2);
    monitor.screenMat.uniforms.uPower.value = state.power;

    if (++sampleTick % 5 === 0) screenSample();
    // hand the screen's colour to the lighting rig
    scene.userData.screenLight?.(avg.r, avg.g, avg.b, avg.p * state.power);

    // HDD light blinks while the OS is "busy"
    tower.hddLed.material.color.setHex(os.busy ? 0xffb020 : 0x3a2a08);
    monitor.led.material.color.setHex(state.power > 0.5 ? 0x35ff6a : 0xd8a020);
  };

  return {
    group, os, monitor, tower, colliders, update, state,
    screenObject: monitor.screen,
    crtUniforms: monitor.screenMat.uniforms,
  };
}
