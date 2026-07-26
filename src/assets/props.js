// ─────────────────────────────────────────────────────────────
// assets/props — the small stuff. An empty room reads as a demo;
// clutter reads as somewhere a person lives.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../forge/materials.js';
import {
  roundedBox, extrude, roundRectPts, lathe, tube, blob, withUV2, mergeGeometries,
  cable, scatter, cloth,
} from '../forge/geo.js';
import { draw, glowSprite } from '../forge/texture.js';
import { Noise2D, mulberry32 } from '../forge/noise.js';
import { ROOM } from './room.js';
import { DESK, BED, BOOKCASE } from './furniture.js';

const mesh = (geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(withUV2(geo), material);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

/** Articulated desk lamp — the one everybody had. */
function buildLamp(group) {
  const g = new THREE.Group();
  g.position.set(1.36, DESK.h, DESK.z - 0.20);
  g.rotation.y = -0.5;
  group.add(g);

  const shell = mat('steel', { color: 0x2f6a52, roughness: 0.42, metalness: 0.65 });
  const dark = mat('darkPlastic');

  // weighted base
  g.add(mesh(lathe([
    [0.075, 0], [0.078, 0.006], [0.070, 0.014], [0.030, 0.019], [0.022, 0.024], [0.018, 0.026],
  ], 32), shell));

  // lower arm
  const arm1 = new THREE.Group();
  arm1.position.set(0, 0.026, 0);
  arm1.rotation.x = -0.62;
  g.add(arm1);
  arm1.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.26, 12), shell, [0, 0.13, 0]));
  // spring
  {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      pts.push(new THREE.Vector3(Math.cos(t * Math.PI * 14) * 0.011, t * 0.20 + 0.03, Math.sin(t * Math.PI * 14) * 0.011 + 0.014));
    }
    const spring = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0016, 5, false),
      mat('steel', { color: 0x9a9a9a, roughness: 0.35, metalness: 1 }),
    );
    spring.castShadow = true;
    arm1.add(spring);
  }

  // elbow + upper arm
  const joint = new THREE.Group();
  joint.position.set(0, 0.26, 0);
  arm1.add(joint);
  joint.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.020, 14), shell, [0, 0, 0], [0, 0, Math.PI / 2]));

  const arm2 = new THREE.Group();
  arm2.rotation.x = 1.30;
  joint.add(arm2);
  arm2.add(mesh(new THREE.CylinderGeometry(0.0080, 0.0090, 0.235, 12), shell, [0, 0.117, 0]));

  // shade
  const head = new THREE.Group();
  head.position.set(0, 0.235, 0);
  head.rotation.x = 0.95;
  arm2.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 12), shell, [0, 0, 0], [0, 0, Math.PI / 2]));

  const shadeGeo = lathe([
    [0.020, 0], [0.028, 0.012], [0.048, 0.048], [0.062, 0.076], [0.064, 0.080],
  ], 34);
  const shade = mesh(shadeGeo, shell, [0, 0.012, 0]);
  shade.rotation.x = Math.PI;
  head.add(shade);
  // white interior so the bounce reads warm
  const inner = new THREE.Mesh(
    lathe([[0.019, 0], [0.027, 0.012], [0.047, 0.048], [0.061, 0.076]], 34),
    new THREE.MeshStandardMaterial({ color: 0xfff2e0, roughness: 0.55, side: THREE.BackSide }),
  );
  inner.rotation.x = Math.PI;
  inner.position.y = 0.012;
  head.add(inner);

  // the bulb, glowing
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff0d0 }),
  );
  bulb.position.set(0, -0.030, 0);
  head.add(bulb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowSprite(128, '#ffd9a0', 2.0), color: 0xffc27a,
    transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(0.22);
  halo.position.set(0, -0.030, 0);
  head.add(halo);

  // cord down the back of the desk
  const cord = new THREE.Mesh(
    cable([0, 0.004, -0.06], [0.26, -DESK.h + 0.02, -0.20], 0.10, 0.0035, 26, 0.02, 17),
    mat('darkPlastic', { color: 0x2a2724, roughness: 0.85 }),
  );
  cord.castShadow = true;
  g.add(cord);

  return g;
}

/** Rice-paper ceiling lantern. */
function buildLantern(group) {
  const g = new THREE.Group();
  g.position.set(-0.45, ROOM.y1, 0.35);
  group.add(g);

  // flex + ceiling rose
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.014, 20),
    mat('plaster', { color: 0xf2ece1 }), [0, -0.007, 0]));
  const flex = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0035, 0.0035, 0.30, 8),
    mat('darkPlastic', { color: 0xe8e2d4, roughness: 0.7 }),
  );
  flex.position.y = -0.16;
  flex.castShadow = true;
  g.add(flex);

  // the paper globe: ribbed, translucent
  const globe = lathe([
    [0.012, 0], [0.075, 0.03], [0.125, 0.09], [0.140, 0.16], [0.125, 0.235],
    [0.078, 0.295], [0.022, 0.325], [0.014, 0.330],
  ], 40);
  const paperMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff4e2, roughness: 0.92, transmission: 0.55, thickness: 0.02,
    side: THREE.DoubleSide, emissive: 0xffbb70, emissiveIntensity: 0.16,
    ior: 1.2, transparent: true, opacity: 0.96,
  });
  const globeMesh = new THREE.Mesh(withUV2(globe), paperMat);
  globeMesh.position.y = -0.665;
  globeMesh.castShadow = false;
  g.add(globeMesh);

  // the ribs read through the paper
  const ribs = [];
  for (let i = 0; i < 9; i++) {
    const y = 0.04 + i * 0.033;
    const r = 0.014 + Math.sin((i / 8) * Math.PI) * 0.126;
    const t = new THREE.TorusGeometry(r, 0.0016, 5, 34);
    t.rotateX(Math.PI / 2);
    t.translate(0, y, 0);
    ribs.push(t);
  }
  const ribMesh = new THREE.Mesh(mergeGeometries(ribs),
    new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.85 }));
  ribMesh.position.y = -0.665;
  g.add(ribMesh);

  // kept dim and small: the paper globe is translucent, so a hot bulb behind
  // it reads as one blown-out blob once bloom gets hold of it
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.020, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffcf96 }),
  );
  bulb.position.y = -0.50;
  g.add(bulb);

  return g;
}

/** Framed posters, each with a procedurally-drawn print. */
function buildPosters(group) {
  const frameM = mat('walnut', { color: 0x9a7a52, roughness: 0.45 });
  const frameBlack = mat('darkPlastic');

  const makePoster = (w, h, tex, framed, pos, rot, frameMat) => {
    const g = new THREE.Group();
    g.position.set(...pos); g.rotation.set(...rot);
    group.add(g);
    if (framed) {
      const t = 0.016, d = 0.020;
      const parts = [];
      const a = roundedBox(w + t * 2, t, d, 0.002, 1); a.translate(0, h / 2 + t / 2, 0); parts.push(a);
      const b = roundedBox(w + t * 2, t, d, 0.002, 1); b.translate(0, -h / 2 - t / 2, 0); parts.push(b);
      const c = roundedBox(t, h, d, 0.002, 1); c.translate(-w / 2 - t / 2, 0, 0); parts.push(c);
      const dd = roundedBox(t, h, d, 0.002, 1); dd.translate(w / 2 + t / 2, 0, 0); parts.push(dd);
      g.add(mesh(mergeGeometries(parts), frameMat ?? frameM, [0, 0, 0.010]));
      // glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07,
        envMapIntensity: 1.6, clearcoat: 1,
      }));
      glass.position.z = 0.019;
      g.add(glass);
    }
    const print = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.86,
        normalMap: mat('paper').normalMap, normalScale: new THREE.Vector2(0.25, 0.25),
      }),
    );
    print.position.z = 0.004;
    print.receiveShadow = true;
    g.add(print);
    return g;
  };

  // 1 · a swiss-style gig poster above the bed
  const gig = draw(512, 700, (ctx, w, h) => {
    ctx.fillStyle = '#e8e2d4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8342a';
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.36, w * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#1a3a8a';
    ctx.beginPath(); ctx.arc(w * 0.36, h * 0.44, w * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#14120f';
    ctx.font = 'bold 74px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('THE', 44, h * 0.68);
    ctx.fillText('MIDNIGHT', 44, h * 0.68 + 78);
    ctx.fillText('HOUR', 44, h * 0.68 + 156);
    ctx.font = '500 26px Helvetica, Arial, sans-serif';
    ctx.fillText('SAT 14 NOV · THE OLD ROOM · 8PM', 44, h * 0.68 + 210);
    // paper grain
    const n = new Noise2D(31);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % w, py = Math.floor(i / 4 / w);
      const v = n.fbm(px * 0.05, py * 0.05, 3) * 9;
      d[i] += v; d[i + 1] += v; d[i + 2] += v;
    }
    ctx.putImageData(img, 0, 0);
  });
  makePoster(0.42, 0.58, gig, true, [ROOM.x1 - 0.028, 1.60, 1.05], [0, -Math.PI / 2, 0]);

  // 2 · a star chart over the desk
  const chart = draw(600, 440, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050914'); g.addColorStop(1, '#0d1428');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(9);
    // constellations
    const nodes = [];
    for (let i = 0; i < 340; i++) {
      const x = rnd() * w, y = rnd() * h;
      const m = rnd();
      const r = m > 0.97 ? 2.6 : m > 0.85 ? 1.7 : 1.0;
      ctx.fillStyle = `rgba(220,232,255,${0.35 + rnd() * 0.65})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (m > 0.94) nodes.push([x, y]);
    }
    ctx.strokeStyle = 'rgba(140,180,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length - 1; i++) {
      const [x1, y1] = nodes[i], [x2, y2] = nodes[i + 1];
      if (Math.hypot(x2 - x1, y2 - y1) < 130) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(200,220,255,0.22)';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.44, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(210,225,255,0.75)';
    ctx.font = '500 17px Georgia, serif'; ctx.textAlign = 'center';
    ctx.letterSpacing = '7px';
    ctx.fillText('THE NORTHERN SKY', w / 2, h - 26);
  });
  makePoster(0.50, 0.365, chart, true, [DESK.x + 0.10, 1.62, ROOM.z0 + 0.026], [0, 0, 0], frameBlack);

  // 3 · an unframed, slightly curled print, taped up
  const grid = draw(400, 520, (ctx, w, h) => {
    ctx.fillStyle = '#f2ede2'; ctx.fillRect(0, 0, w, h);
    const cols = ['#e0533f', '#2f6fb0', '#e8b23a', '#3f8a63', '#1a1a1a'];
    const rnd = mulberry32(55);
    const N = 7;
    const cell = (w - 60) / N;
    for (let y = 0; y < 9; y++) for (let x = 0; x < N; x++) {
      if (rnd() > 0.55) continue;
      ctx.fillStyle = cols[(rnd() * cols.length) | 0];
      ctx.globalAlpha = 0.75 + rnd() * 0.25;
      const px = 30 + x * cell, py = 40 + y * cell;
      if (rnd() > 0.6) { ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(px + 3, py + 3, cell - 6, cell - 6);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '500 15px Helvetica, Arial'; ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('COMPOSITION No. 4', w / 2, h - 22);
  });
  const p3 = makePoster(0.30, 0.39, grid, false, [ROOM.x1 - 0.010, 1.20, 1.72], [0, -Math.PI / 2, 0.03]);
  // masking tape at the corners
  for (const [tx, ty] of [[-0.13, 0.19], [0.13, 0.19], [-0.13, -0.19], [0.13, -0.19]]) {
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.045, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.85, transparent: true, opacity: 0.82 }),
    );
    tape.position.set(tx, ty, 0.006);
    tape.rotation.z = Math.PI / 4 * (tx > 0 ? 1 : -1);
    p3.add(tape);
  }

  return group;
}

/** Trailing pothos in a ceramic pot on the bookcase. */
function buildPlant(group, pos, scale = 1) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.scale.setScalar(scale);
  group.add(g);

  const pot = lathe([
    [0.001, 0], [0.052, 0], [0.056, 0.006], [0.060, 0.055], [0.068, 0.090],
    [0.070, 0.096], [0.066, 0.098], [0.064, 0.094], [0.056, 0.055], [0.052, 0.008],
  ], 28);
  g.add(mesh(pot, mat('ceramic', { color: 0xb9754c })));

  // soil
  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 24),
    new THREE.MeshStandardMaterial({ color: 0x2c211a, roughness: 1 }),
  );
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.088;
  g.add(soil);

  // vines: catmull curves drooping over the rim, with leaves along them
  const leafGeo = (() => {
    const shape = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI;
      shape.push([Math.sin(a) * 0.021 * (0.4 + t * 0.8), (t - 0.5) * 0.062]);
    }
    for (let i = 16; i >= 0; i--) {
      const t = i / 16;
      const a = t * Math.PI;
      shape.push([-Math.sin(a) * 0.021 * (0.4 + t * 0.8), (t - 0.5) * 0.062]);
    }
    const g2 = extrude(shape, 0.0016, 0.0006, 3);
    return g2;
  })();

  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3f7a3a, roughness: 0.62, side: THREE.DoubleSide,
  });
  const leafMat2 = new THREE.MeshStandardMaterial({
    color: 0x67a04a, roughness: 0.6, side: THREE.DoubleSide,
  });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6a38, roughness: 0.8 });

  const rnd = mulberry32(88);
  const vines = [];
  for (let v = 0; v < 7; v++) {
    const a0 = (v / 7) * Math.PI * 2 + rnd() * 0.5;
    const len = 0.22 + rnd() * 0.36;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const droop = t * t * len;
      const r = 0.03 + t * (0.05 + rnd() * 0.03);
      pts.push(new THREE.Vector3(
        Math.cos(a0 + t * 1.2) * r,
        0.10 + Math.sin(t * 2.2) * 0.03 - droop,
        Math.sin(a0 + t * 1.2) * r,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.0022, 5, false), stemMat);
    stem.castShadow = true;
    g.add(stem);
    vines.push(curve);

    const LEAVES = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < LEAVES; i++) {
      const t = 0.15 + (i / LEAVES) * 0.85;
      const p = curve.getPoint(t);
      const leaf = new THREE.Mesh(leafGeo, rnd() > 0.55 ? leafMat : leafMat2);
      leaf.position.copy(p);
      leaf.rotation.set(
        rnd() * 0.9 - 0.45 - 0.6,
        a0 + t * 1.2 + (rnd() - 0.5) * 1.4,
        (rnd() - 0.5) * 0.8,
      );
      leaf.scale.setScalar(0.75 + rnd() * 0.6);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  return g;
}

/** Bedside alarm clock with a live red seven-segment display. */
function buildAlarmClock(group) {
  const g = new THREE.Group();
  g.position.set(0.98, 0.52, 2.12);
  g.rotation.y = -0.55;
  group.add(g);

  const body = roundedBox(0.115, 0.056, 0.075, 0.010, 3);
  g.add(mesh(body, mat('darkPlastic'), [0, 0.028, 0]));

  // the display is a live canvas texture
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = 192; dispCanvas.height = 84;
  const dctx = dispCanvas.getContext('2d');
  const dispTex = new THREE.CanvasTexture(dispCanvas);
  dispTex.colorSpace = THREE.SRGBColorSpace;

  const SEG = {
    0: [1, 1, 1, 1, 1, 1, 0], 1: [0, 1, 1, 0, 0, 0, 0], 2: [1, 1, 0, 1, 1, 0, 1],
    3: [1, 1, 1, 1, 0, 0, 1], 4: [0, 1, 1, 0, 0, 1, 1], 5: [1, 0, 1, 1, 0, 1, 1],
    6: [1, 0, 1, 1, 1, 1, 1], 7: [1, 1, 1, 0, 0, 0, 0], 8: [1, 1, 1, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1], ' ': [0, 0, 0, 0, 0, 0, 0],
  };
  function paintDisplay(colon) {
    dctx.fillStyle = '#0a0604';
    dctx.fillRect(0, 0, 192, 84);
    const d = new Date();
    let hh = d.getHours() % 12 || 12;
    const mm = d.getMinutes();
    const str = `${hh < 10 ? ' ' : ''}${hh}${String(mm).padStart(2, '0')}`;
    const positions = [10, 52, 108, 150];
    for (let i = 0; i < 4; i++) {
      const segs = SEG[str[i]] ?? SEG[' '];
      const ox = positions[i], oy = 14;
      const on = '#ff2410', off = '#2a0603';
      const T = 6, L = 26;
      const bar = (bx, by, bw, bh, lit) => { dctx.fillStyle = lit ? on : off; dctx.fillRect(ox + bx, oy + by, bw, bh); };
      bar(T, 0, L, T, segs[0]);
      bar(T + L, T, T, L, segs[1]);
      bar(T + L, T * 2 + L, T, L, segs[2]);
      bar(T, T * 2 + L * 2, L, T, segs[3]);
      bar(0, T * 2 + L, T, L, segs[4]);
      bar(0, T, T, L, segs[5]);
      bar(T, T + L, L, T, segs[6]);
    }
    dctx.fillStyle = colon ? '#ff2410' : '#2a0603';
    dctx.fillRect(94, 30, 7, 7);
    dctx.fillRect(94, 50, 7, 7);
    // AM/PM dot
    dctx.fillStyle = new Date().getHours() >= 12 ? '#ff2410' : '#2a0603';
    dctx.fillRect(4, 70, 6, 6);
    dispTex.needsUpdate = true;
  }
  paintDisplay(true);

  const disp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.082, 0.036),
    new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: true }),
  );
  disp.position.set(0, 0.032, 0.0378);
  disp.rotation.x = -0.06;
  g.add(disp);

  // recessed bezel around the display
  const bezel = new THREE.Mesh(
    withUV2(roundedBox(0.092, 0.044, 0.006, 0.004, 2)),
    mat('darkPlastic', { color: 0x101010, roughness: 0.5 }),
  );
  bezel.position.set(0, 0.032, 0.035);
  g.add(bezel);

  // snooze bar
  const snooze = new THREE.Mesh(withUV2(roundedBox(0.062, 0.010, 0.026, 0.004, 2)), mat('darkPlastic', { color: 0x3a3a3e }));
  snooze.position.set(0, 0.058, -0.008);
  snooze.castShadow = true;
  g.add(snooze);

  const update = (t) => paintDisplay(Math.floor(t * 1) % 2 === 0);
  return { group: g, update };
}

/** Everything else. */
function buildClutter(group) {
  const beige = mat('beige');
  const dark = mat('darkPlastic');
  const paperM = mat('paper');

  // ── coffee mug with a tide line
  {
    const mug = lathe([
      [0.001, 0], [0.034, 0], [0.036, 0.004], [0.036, 0.082], [0.034, 0.086],
      [0.030, 0.086], [0.031, 0.006], [0.001, 0.006],
    ], 28);
    const m = mesh(mug, mat('ceramic', { color: 0xdcdad4 }), [DESK.x - 0.66, DESK.h, DESK.z + 0.06]);
    group.add(m);
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.005, 8, 22, Math.PI * 1.25),
      mat('ceramic', { color: 0xdcdad4 }),
    );
    handle.rotation.set(0, Math.PI / 2, -0.6);
    handle.position.set(DESK.x - 0.66 + 0.036, DESK.h + 0.046, DESK.z + 0.06);
    handle.castShadow = true;
    group.add(handle);
    // cold coffee
    const coffee = new THREE.Mesh(
      new THREE.CircleGeometry(0.030, 22),
      new THREE.MeshPhysicalMaterial({ color: 0x2a1608, roughness: 0.12, clearcoat: 1 }),
    );
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(DESK.x - 0.66, DESK.h + 0.034, DESK.z + 0.06);
    group.add(coffee);
  }

  // ── stack of floppies + a couple of jewel cases
  {
    const rnd = mulberry32(4);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(
        withUV2(roundedBox(0.090, 0.0032, 0.094, 0.004, 1)),
        mat('darkPlastic', { color: [0x2a2a30, 0x1a3a6a, 0x6a1a2a, 0x2a2a30, 0x3a5a2a][i] }),
      );
      f.position.set(DESK.x + 0.66, DESK.h + 0.002 + i * 0.0034, DESK.z - 0.20 + i * 0.002);
      f.rotation.y = (rnd() - 0.5) * 0.24;
      f.castShadow = true; f.receiveShadow = true;
      group.add(f);
      // shutter
      const sh = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.0034, 0.016),
        mat('steel', { color: 0xb8b8bc, roughness: 0.35 }),
      );
      sh.position.copy(f.position);
      sh.position.z += 0.036;
      sh.position.y += 0.0004;
      sh.rotation.y = f.rotation.y;
      group.add(sh);
      // label
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.070, 0.036),
        new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 }),
      );
      lbl.rotation.x = -Math.PI / 2;
      lbl.rotation.z = -f.rotation.y;
      lbl.position.copy(f.position);
      lbl.position.y += 0.0019;
      lbl.position.z -= 0.020;
      group.add(lbl);
    }
  }

  // ── open notebook and a pen on the desk
  {
    const nb = new THREE.Group();
    nb.position.set(DESK.x - 0.60, DESK.h + 0.002, DESK.z + 0.19);
    nb.rotation.y = 0.30;
    group.add(nb);
    const pages = draw(512, 384, (ctx, w, h) => {
      ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#9db6d8'; ctx.lineWidth = 1;
      for (let y = 28; y < h; y += 20) {
        ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(w - 10, y); ctx.stroke();
      }
      ctx.strokeStyle = '#d88a8a';
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      // scrawled handwriting
      ctx.strokeStyle = '#22304a'; ctx.lineWidth = 1.6;
      const rnd = mulberry32(66);
      for (let line = 0; line < 14; line++) {
        const y = 24 + line * 20 + 12;
        const side = line < 7 ? 20 : w / 2 + 16;
        const maxx = line < 7 ? w / 2 - 24 : w - 24;
        let x = side;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (x < maxx - 20) {
          const seg = 6 + rnd() * 14;
          x += seg;
          ctx.lineTo(x, y - rnd() * 6);
          ctx.lineTo(x + 2, y);
          if (rnd() > 0.86) { x += 8; ctx.moveTo(x, y); }
          if (rnd() > 0.94) break;
        }
        ctx.stroke();
      }
    });
    const pg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.17),
      new THREE.MeshStandardMaterial({ map: pages, roughness: 0.92 }),
    );
    pg.rotation.x = -Math.PI / 2;
    pg.receiveShadow = true;
    nb.add(pg);
    // page block underneath
    nb.add(mesh(roundedBox(0.245, 0.006, 0.175, 0.002, 1), mat('paper'), [0, -0.004, 0]));
    // spiral binding
    for (let i = 0; i < 11; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.005, 0.0012, 5, 12),
        mat('steel', { color: 0xa8a8ac, roughness: 0.3 }),
      );
      ring.position.set(0, 0.0, -0.075 + i * 0.015);
      ring.rotation.y = Math.PI / 2;
      nb.add(ring);
    }
    // pen
    const pen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0034, 0.135, 10),
      mat('darkPlastic', { color: 0x14181f }),
    );
    pen.rotation.set(0, 0.2, Math.PI / 2 - 0.15);
    pen.position.set(0.03, 0.006, 0.10);
    pen.castShadow = true;
    nb.add(pen);
    const nib = new THREE.Mesh(
      new THREE.ConeGeometry(0.0034, 0.014, 8),
      mat('steel', { color: 0xb0b0b4, roughness: 0.3 }),
    );
    nib.rotation.copy(pen.rotation);
    nib.position.set(0.03 + 0.073, 0.006, 0.10 + 0.012);
    nb.add(nib);
  }

  // ── wastebasket with crumpled paper
  {
    const bin = lathe([
      [0.001, 0], [0.078, 0], [0.080, 0.004], [0.098, 0.185], [0.100, 0.192],
      [0.096, 0.192], [0.094, 0.186], [0.076, 0.006], [0.001, 0.006],
    ], 26);
    group.add(mesh(bin, mat('darkPlastic', { color: 0x35383c }),
      [DESK.x - 1.03, 0, DESK.z + 0.02]));
    const rnd = mulberry32(12);
    for (let i = 0; i < 4; i++) {
      const ball = blob(0.030, 1, [
        { dir: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], amount: -0.3, falloff: 1.5 },
        { dir: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], amount: 0.25, falloff: 1.5 },
        { dir: [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], amount: -0.2, falloff: 1.2 },
      ], 100 + i);
      const b = mesh(ball, mat('paper', { color: 0xe6e0d0 }), [
        DESK.x - 1.03 + (rnd() - 0.5) * 0.09,
        0.12 + i * 0.045,
        DESK.z + 0.02 + (rnd() - 0.5) * 0.09,
      ], [rnd() * 3, rnd() * 3, rnd() * 3]);
      group.add(b);
    }
    // one that missed
    const missed = blob(0.032, 1, [
      { dir: [0.4, -0.2, 0.6], amount: -0.28, falloff: 1.4 },
      { dir: [-0.5, 0.3, 0.2], amount: 0.22, falloff: 1.4 },
    ], 200);
    group.add(mesh(missed, mat('paper', { color: 0xe6e0d0 }),
      [DESK.x - 1.20, 0.030, DESK.z + 0.30], [0.4, 1.2, 0.8]));
  }

  // ── books and a trophy on the free bookcase shelf.
  // Parented to the bookcase's own transform, so they turn with it.
  {
    const shelfY = BOOKCASE.shelfY;
    const shelf = new THREE.Group();
    shelf.position.set(BOOKCASE.x, 0, BOOKCASE.z);
    shelf.rotation.y = BOOKCASE.ry;
    group.add(shelf);

    // stacked paperbacks
    let sy = shelfY + 0.012;
    for (let i = 0; i < 3; i++) {
      const th = 0.026 + i * 0.004;
      const b = mesh(roundedBox(0.14 - i * 0.008, th, 0.19, 0.003, 1),
        mat('paper', { color: [0x3a5a7a, 0x7a3a3a, 0xc8b48a][i] }),
        [-0.22, sy + th / 2, 0]);
      b.rotation.y = (i - 1) * 0.05;
      shelf.add(b);
      sy += th;
    }
    // a small trophy
    const trophy = new THREE.Group();
    trophy.position.set(0.24, shelfY + 0.012, 0.02);
    shelf.add(trophy);
    const brass = mat('steel', { color: 0xc9a04a, roughness: 0.28, metalness: 1 });
    trophy.add(mesh(roundedBox(0.055, 0.020, 0.055, 0.004, 2), mat('walnut'), [0, 0.010, 0]));
    trophy.add(mesh(lathe([[0.010, 0], [0.008, 0.02], [0.007, 0.045], [0.020, 0.055],
      [0.030, 0.075], [0.032, 0.098], [0.030, 0.100], [0.026, 0.098], [0.024, 0.078], [0.016, 0.060], [0.001, 0.055]], 20),
      brass, [0, 0.020, 0]));
    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0026, 6, 16, Math.PI), brass);
      handle.rotation.set(Math.PI / 2, 0, sx > 0 ? 0 : Math.PI);
      handle.position.set(sx * 0.030, 0.100, 0);
      handle.castShadow = true;
      trophy.add(handle);
    }
  }

  // ── a hoodie thrown over the end of the bed
  {
    const hoodie = cloth({
      w: 0.44, d: 0.62, segW: 20, segD: 26,
      y: BED.top + 0.28, gravity: 0.0021, iterations: 240, stiffness: 0.72, seed: 91,
      drape: 0.06,
      colliders: [
        { type: 'box', x0: -0.5, x1: 0.5, y0: 0.3, y1: BED.top, z0: -1.2, z1: 1.2 },
        { type: 'sphere', x: 0.02, y: BED.top, z: 0.06, r: 0.13 },
        { type: 'plane', y: 0.40 },
      ],
    });
    const m = new THREE.Mesh(withUV2(hoodie), mat('duvet', {
      color: 0x4a5560, side: THREE.DoubleSide, repeat: [3, 4],
    }));
    m.position.set(BED.x - 0.10, 0, BED.z0 + 0.52);
    m.rotation.y = 0.4;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // ── slippers by the bed
  {
    for (const [sx, ang] of [[-1, 0.3], [1, -0.15]]) {
      const s = blob(0.052, 2, [
        { dir: [0, 0, 1], amount: 0.55, falloff: 1.6 },
        { dir: [0, 1, 0.2], amount: -0.35, falloff: 2.0 },
      ], 300 + sx);
      s.scale(0.62, 0.55, 1.35);
      const m = mesh(s, mat('duvet', { color: 0x6a5a4a, repeat: [4, 4] }),
        [BED.x - 0.62 + sx * 0.085, 0.030, BED.z0 + 0.62], [0, ang, 0]);
      group.add(m);
    }
  }

  // ── a phone on the nightstand, cord trailing
  {
    const base = mesh(roundedBox(0.115, 0.038, 0.150, 0.012, 3), mat('beige', { color: 0xdad2bc }),
      [0.92, 0.545, 2.10], [0, 0.06, 0]);
    group.add(base);
    // keypad
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const k = mesh(roundedBox(0.018, 0.005, 0.014, 0.002, 1),
        mat('beige', { color: 0xe8e0cc }),
        [0.92 - 0.026 + c * 0.026, 0.5645, 2.10 - 0.038 + r * 0.021], [0, 0.06, 0]);
      group.add(k);
    }
    // handset
    const handset = new THREE.Group();
    handset.position.set(0.92, 0.578, 2.145);
    handset.rotation.y = 0.06;
    group.add(handset);
    const hs = blob(0.042, 2, [
      { dir: [0, 0, 1], amount: 0.85, falloff: 1.4 },
      { dir: [0, 0, -1], amount: 0.85, falloff: 1.4 },
      { dir: [0, 1, 0], amount: -0.45, falloff: 2.0 },
    ], 44);
    hs.scale(0.46, 0.42, 1.55);
    handset.add(mesh(hs, mat('beige', { color: 0xdad2bc })));
    // coiled cord
    {
      const pts = [];
      for (let i = 0; i <= 70; i++) {
        const t = i / 70;
        pts.push(new THREE.Vector3(
          0.98 + Math.cos(t * Math.PI * 11) * 0.016 + t * 0.02,
          0.54 - t * 0.30 + Math.sin(t * Math.PI) * 0.06,
          2.06 + Math.sin(t * Math.PI * 11) * 0.016 - t * 0.05,
        ));
      }
      const cordM = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.0026, 5, false),
        mat('darkPlastic', { color: 0xd8d0ba, roughness: 0.8 }),
      );
      cordM.castShadow = true;
      group.add(cordM);
    }
  }

  // ── a glass of water on the nightstand
  {
    const glass = lathe([
      [0.001, 0], [0.026, 0], [0.027, 0.003], [0.030, 0.085], [0.031, 0.088],
      [0.029, 0.088], [0.028, 0.004], [0.001, 0.004],
    ], 26);
    const gm = new THREE.Mesh(withUV2(glass), new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.04, transmission: 0.96, thickness: 0.02,
      ior: 1.5, transparent: true, envMapIntensity: 1.5,
    }));
    gm.position.set(0.80, 0.545, 2.24);
    gm.castShadow = true;
    group.add(gm);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0265, 0.025, 0.048, 22),
      new THREE.MeshPhysicalMaterial({
        color: 0xdff0ff, roughness: 0.02, transmission: 0.94, thickness: 0.04,
        ior: 1.33, transparent: true,
      }),
    );
    water.position.set(0.80, 0.570, 2.24);
    group.add(water);
  }

  // ── dog bowl on the floor
  {
    const bowl = lathe([
      [0.001, 0], [0.042, 0], [0.046, 0.004], [0.070, 0.042], [0.074, 0.048],
      [0.070, 0.048], [0.066, 0.042], [0.042, 0.006], [0.001, 0.006],
    ], 26);
    group.add(mesh(bowl, mat('ceramic', { color: 0x3f6f8a }), [-1.32, 0, 1.62]));
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(0.058, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x9ecfe8, roughness: 0.02, transmission: 0.9, thickness: 0.01,
        ior: 1.33, transparent: true,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-1.32, 0.030, 1.62);
    group.add(water);
  }

  // ── a chew toy, because the dog lives here
  {
    const toy = tube([
      [-0.05, 0.022, 0, 0.020], [-0.02, 0.026, 0.004, 0.013],
      [0.02, 0.026, -0.004, 0.013], [0.05, 0.022, 0, 0.020],
    ], 10, 20);
    const m = mesh(toy, new THREE.MeshStandardMaterial({ color: 0xc84a5a, roughness: 0.55 }),
      [-0.72, 0, 0.98], [0, 0.7, 0]);
    group.add(m);
  }
}

export function buildProps(scene) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  buildLamp(group);
  buildLantern(group);
  buildPosters(group);
  // top of the bookcase, offset along the shelf toward the window end
  const plantA = buildPlant(group, [BOOKCASE.x, 1.735, BOOKCASE.z - 0.24], 0.9);
  const plantB = buildPlant(group, [ROOM.x1 - 0.24, 0, ROOM.z0 + 0.26], 1.9); // floor plant in the corner
  const clocks = [buildAlarmClock(group)];
  buildClutter(group);

  const colliders = [
    { x0: ROOM.x1 - 0.44, x1: ROOM.x1, z0: ROOM.z0, z1: ROOM.z0 + 0.46 },  // floor plant
    { x0: DESK.x - 1.14, x1: DESK.x - 0.90, z0: DESK.z - 0.10, z1: DESK.z + 0.14 }, // bin
  ];

  const update = (t, dt) => {
    for (const c of clocks) c.update(t);
    // the plants breathe in the draught from the window
    const sway = Math.sin(t * 0.6) * 0.006;
    plantB.rotation.z = sway;
    plantA.rotation.z = -sway * 0.6;
  };

  return { group, colliders, update };
}
