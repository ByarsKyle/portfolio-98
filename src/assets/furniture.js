// ─────────────────────────────────────────────────────────────
// assets/furniture — bed (with relaxed bedding), desk, chair,
// bookcase, nightstand, rug.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../forge/materials.js';
import {
  roundedBox, extrude, roundRectPts, lathe, withUV2, mergeGeometries, cloth, scatter,
} from '../forge/geo.js';
import { draw } from '../forge/texture.js';
import { mulberry32, Noise2D } from '../forge/noise.js';
import { ROOM } from './room.js';

const mesh = (geo, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(withUV2(geo), material);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  return m;
};

// bed occupies x∈[1.16,2.14], z∈[0.42,2.40]; head at the +z (south) end
export const BED = { x: 1.65, w: 0.98, len: 1.98, z0: 0.42, z1: 2.40, top: 0.585, base: 0.30 };
export const DESK = { x: 0.55, w: 1.80, d: 0.72, h: 0.745, z: ROOM.z0 + 0.36 };

/** A plump pillow: rounded box inflated by a dome and pinched at the corners. */
function pillow(w, h, d, squash = 0.0, seed = 4) {
  const g = roundedBox(w, h, d, Math.min(w, h, d) * 0.42, 6);
  const pos = g.attributes.position;
  const n = new Noise2D(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const u = v.x / (w / 2), t = v.z / (d / 2);
    const dome = Math.cos(u * Math.PI * 0.5) * Math.cos(t * Math.PI * 0.5);
    // inflate the middle, pinch the seams
    v.y *= 1 + dome * 0.85;
    v.x *= 1 - Math.abs(v.y / h) * 0.06;
    v.z *= 1 - Math.abs(v.y / h) * 0.06;
    // head dent
    if (squash > 0 && v.y > 0) {
      const dd = Math.max(0, 1 - Math.hypot(u * 1.1, t * 0.9) * 1.6);
      v.y -= dd * squash;
    }
    // creased fabric micro-relief
    const wrinkle = n.fbm(v.x * 9, v.z * 9, 3) * 0.006;
    v.y += wrinkle;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function buildBed(group) {
  const walnutM = mat('walnut');
  const pineM = mat('pine');
  const g = new THREE.Group();
  g.position.set(BED.x, 0, 0);
  group.add(g);

  const legR = 0.05;
  const railT = 0.035;

  // four turned legs
  const legProfile = [
    [0.035, 0], [0.042, 0.02], [0.040, 0.06], [0.030, 0.10],
    [0.034, 0.13], [0.032, 0.26], [0.038, 0.29], [0.036, 0.31],
  ];
  for (const sx of [-1, 1]) for (const sz of [BED.z0 + 0.07, BED.z1 - 0.07]) {
    const leg = mesh(lathe(legProfile, 20), walnutM, [sx * (BED.w / 2 - 0.03), 0, sz]);
    g.add(leg);
  }

  // side + end rails
  const rails = [];
  for (const sx of [-1, 1]) {
    const r = roundedBox(railT, 0.11, BED.z1 - BED.z0, 0.006, 1);
    r.translate(sx * (BED.w / 2 - railT / 2), 0.28, (BED.z0 + BED.z1) / 2);
    rails.push(r);
  }
  const foot = roundedBox(BED.w, 0.11, railT, 0.006, 1);
  foot.translate(0, 0.28, BED.z0 + railT / 2);
  rails.push(foot);
  g.add(mesh(mergeGeometries(rails), walnutM));

  // headboard: posts + top rail + vertical spindles
  const hbZ = BED.z1;
  const hb = [];
  for (const sx of [-1, 1]) {
    const post = roundedBox(0.058, 0.95, 0.058, 0.010, 2);
    post.translate(sx * (BED.w / 2 - 0.029), 0.475, hbZ - 0.029);
    hb.push(post);
  }
  const top = roundedBox(BED.w, 0.075, 0.05, 0.012, 2);
  top.translate(0, 0.905, hbZ - 0.029); hb.push(top);
  const mid = roundedBox(BED.w - 0.11, 0.045, 0.035, 0.008, 1);
  mid.translate(0, 0.40, hbZ - 0.029); hb.push(mid);
  const SPINDLES = 7;
  for (let i = 0; i < SPINDLES; i++) {
    const t = (i + 0.5) / SPINDLES;
    const x = (t - 0.5) * (BED.w - 0.16);
    const sp = lathe([
      [0.014, 0], [0.018, 0.03], [0.013, 0.10], [0.016, 0.20],
      [0.013, 0.32], [0.018, 0.42], [0.014, 0.47],
    ], 14);
    sp.translate(x, 0.42, hbZ - 0.029);
    hb.push(sp);
  }
  g.add(mesh(mergeGeometries(hb), walnutM));

  // slats + mattress
  const slats = [];
  for (let i = 0; i < 11; i++) {
    const z = BED.z0 + 0.10 + i * ((BED.z1 - BED.z0 - 0.2) / 10);
    const s = new THREE.BoxGeometry(BED.w - 0.09, 0.016, 0.07);
    s.translate(0, 0.335, z);
    slats.push(s);
  }
  g.add(mesh(mergeGeometries(slats), pineM));

  // mattress — rounded, with a body-shaped sag
  const mg = roundedBox(BED.w - 0.06, 0.235, BED.z1 - BED.z0 - 0.09, 0.045, 5);
  {
    const pos = mg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y > 0) {
        const t = (v.z + 0.95) / 1.9;
        const sag = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 0.012;
        v.y -= sag;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    mg.computeVertexNormals();
  }
  mg.translate(0, 0.345 + 0.1175, (BED.z0 + BED.z1) / 2 - 0.005);
  g.add(mesh(mg, mat('cotton', { color: 0xe8e2d6, repeat: [2, 4] })));

  // Fitted sheet: a thin cloth relaxed onto the mattress.
  // NB colliders live in the sim's own space — the grid is built centred on
  // the origin and only translated into the room afterwards, so a collider
  // written in room coordinates sits nowhere near the cloth and the whole
  // sheet drops through the bed.
  const sheetLen = BED.z1 - BED.z0 + 0.02;
  const sheet = cloth({
    w: BED.w + 0.06, d: sheetLen, segW: 26, segD: 46,
    y: BED.top + 0.055, gravity: 0.0016, iterations: 150, stiffness: 0.96, seed: 31,
    colliders: [
      { type: 'box', x0: -BED.w / 2 + 0.03, x1: BED.w / 2 - 0.03,
        y0: 0.3, y1: BED.top, z0: -sheetLen / 2 + 0.05, z1: sheetLen / 2 - 0.05 },
      { type: 'plane', y: 0.44 },
    ],
  });
  sheet.translate(0, 0, (BED.z0 + BED.z1) / 2 - 0.005);
  const sheetMesh = mesh(sheet, mat('cotton', { side: THREE.DoubleSide, color: 0xf2ece0, repeat: [3, 5] }));
  g.add(sheetMesh);

  // duvet: dropped from above, drapes over the mattress and hangs off both sides
  const duvetZ = BED.z0 + 0.72;          // where the finished sheet ends up
  const duvetGeo = cloth({
    w: BED.w + 0.30, d: 1.42, segW: 40, segD: 54,
    y: BED.top + 0.30, gravity: 0.0019, iterations: 300, stiffness: 0.86, seed: 47,
    drape: 0.05,
    colliders: [
      { type: 'box', x0: -BED.w / 2 + 0.02, x1: BED.w / 2 - 0.02,
        y0: 0.30, y1: BED.top + 0.02,
        z0: BED.z0 + 0.04 - duvetZ, z1: BED.z1 - 0.04 - duvetZ },
      // a knee-shaped lump, as though someone just got out of bed
      { type: 'sphere', x: -0.16, y: BED.top - 0.02, z: 1.12 - duvetZ, r: 0.19 },
      { type: 'sphere', x: 0.14, y: BED.top - 0.05, z: 0.85 - duvetZ, r: 0.15 },
      { type: 'plane', y: 0.42 },
    ],
  });
  duvetGeo.translate(0, 0, duvetZ);
  const duvet = mesh(duvetGeo, mat('duvet', { side: THREE.DoubleSide, repeat: [2, 3] }));
  g.add(duvet);

  // a second, thinner throw crumpled at the foot
  const throwZ = BED.z0 + 0.30;
  const throwGeo = cloth({
    w: BED.w + 0.22, d: 0.52, segW: 30, segD: 22,
    y: BED.top + 0.34, gravity: 0.0022, iterations: 260, stiffness: 0.7, seed: 53,
    drape: 0.10,
    colliders: [
      { type: 'box', x0: -BED.w / 2 + 0.02, x1: BED.w / 2 - 0.02,
        y0: 0.30, y1: BED.top + 0.015,
        z0: BED.z0 + 0.04 - throwZ, z1: BED.z1 - 0.04 - throwZ },
      { type: 'sphere', x: 0.06, y: BED.top + 0.01, z: 0.04, r: 0.11 },
      { type: 'plane', y: 0.40 },
    ],
  });
  throwGeo.translate(0, 0, throwZ);
  g.add(mesh(throwGeo, mat('duvet', {
    side: THREE.DoubleSide, color: 0xc08a5a, roughness: 1, repeat: [3, 2],
  })));

  // pillows, stacked and slightly askew
  const p1 = pillow(0.56, 0.15, 0.36, 0.02, 4);
  const m1 = mesh(p1, mat('cotton', { repeat: [1.6, 1] }), [-0.14, BED.top + 0.075, BED.z1 - 0.30], [0, 0.14, 0.03]);
  g.add(m1);
  const p2 = pillow(0.54, 0.14, 0.34, 0.035, 9);
  const m2 = mesh(p2, mat('cotton', { color: 0xdcd2c0, repeat: [1.6, 1] }), [0.18, BED.top + 0.072, BED.z1 - 0.26], [0, -0.19, -0.04]);
  g.add(m2);
  // a small accent cushion propped against the headboard
  const p3 = pillow(0.28, 0.12, 0.28, 0, 12);
  g.add(mesh(p3, mat('duvet', { color: 0xd9a25e, repeat: [3, 3] }),
    [0.02, BED.top + 0.16, BED.z1 - 0.14], [0.55, 0.3, 0.1]));

  return g;
}

function buildDesk(group) {
  const walnutM = mat('walnut', { repeat: [2, 1] });
  const steelM = mat('steel', { color: 0x4a4a4e, roughness: 0.45 });
  const g = new THREE.Group();
  g.position.set(DESK.x, 0, DESK.z);
  group.add(g);

  // top with a bullnose front edge and a slight lip at the back
  const top = roundedBox(DESK.w, 0.035, DESK.d, 0.010, 3);
  g.add(mesh(top, walnutM, [0, DESK.h, 0]));

  // apron
  const apron = [];
  const a1 = roundedBox(DESK.w - 0.10, 0.075, 0.022, 0.004, 1);
  a1.translate(0, DESK.h - 0.058, DESK.d / 2 - 0.04); apron.push(a1);
  const a2 = roundedBox(0.022, 0.075, DESK.d - 0.10, 0.004, 1);
  a2.translate(-DESK.w / 2 + 0.06, DESK.h - 0.058, 0); apron.push(a2);
  const a3 = a2.clone(); a3.translate(DESK.w - 0.12, 0, 0); apron.push(a3);
  g.add(mesh(mergeGeometries(apron), walnutM));

  // square steel legs with adjustable feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = roundedBox(0.042, DESK.h - 0.02, 0.042, 0.006, 2);
    g.add(mesh(leg, steelM, [sx * (DESK.w / 2 - 0.06), (DESK.h - 0.02) / 2, sz * (DESK.d / 2 - 0.06)]));
    const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.014, 12), mat('darkPlastic'));
    footPad.position.set(sx * (DESK.w / 2 - 0.06), 0.007, sz * (DESK.d / 2 - 0.06));
    footPad.castShadow = true; footPad.receiveShadow = true;
    g.add(footPad);
  }
  // stretcher between the back legs
  const str = roundedBox(DESK.w - 0.12, 0.028, 0.028, 0.004, 1);
  g.add(mesh(str, steelM, [0, 0.14, -(DESK.d / 2 - 0.06)]));

  // pull-out keyboard tray on runners
  const trayG = roundedBox(0.72, 0.018, 0.30, 0.006, 2);
  const tray = mesh(trayG, walnutM, [-0.18, DESK.h - 0.115, 0.10]);
  g.add(tray);
  for (const sx of [-1, 1]) {
    const runner = roundedBox(0.012, 0.028, 0.32, 0.003, 1);
    g.add(mesh(runner, steelM, [-0.18 + sx * 0.365, DESK.h - 0.108, 0.10]));
  }

  // a single drawer on the right with a brushed pull
  const drawerFace = roundedBox(0.42, 0.135, 0.020, 0.006, 2);
  g.add(mesh(drawerFace, walnutM, [DESK.w / 2 - 0.27, DESK.h - 0.10, DESK.d / 2 - 0.012]));
  const pull = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.13, 4, 8),
    mat('steel', { color: 0x8f8d88, roughness: 0.3 }));
  pull.rotation.z = Math.PI / 2;
  pull.position.set(DESK.w / 2 - 0.27, DESK.h - 0.10, DESK.d / 2 + 0.012);
  pull.castShadow = true;
  g.add(pull);

  return g;
}

function buildChair(group) {
  const g = new THREE.Group();
  g.position.set(DESK.x - 0.08, 0, DESK.z + 0.86);
  g.rotation.y = -0.24;                     // pushed back and turned, as you'd leave it
  group.add(g);

  const plastic = mat('darkPlastic');
  const leatherM = mat('leather');
  const steelM = mat('steel', { color: 0x53545a, roughness: 0.38 });

  // 5-star base + castors
  const SEAT = 0.44;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = roundedBox(0.05, 0.030, 0.29, 0.010, 2);
    arm.translate(0, 0.055, 0.145);
    arm.rotateY?.(0);
    const armMesh = mesh(arm, plastic, [0, 0, 0], [0, a, 0]);
    // taper the outer end
    g.add(armMesh);
    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(Math.sin(a) * 0.27, 0.032, Math.cos(a) * 0.27);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.011, 8, 18), plastic);
    wheel.rotation.y = a;
    wheel.castShadow = true;
    wheelPivot.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 10), steelM);
    hub.rotation.z = Math.PI / 2; hub.rotation.y = a;
    wheelPivot.add(hub);
    g.add(wheelPivot);
  }

  // gas cylinder
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.30, 16), steelM);
  cyl.position.y = 0.20; cyl.castShadow = true; g.add(cyl);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.16, 16), plastic);
  shroud.position.y = 0.14; shroud.castShadow = true; g.add(shroud);

  // seat pan: leather cushion with a compressed dish and piped edge
  const seatG = roundedBox(0.46, 0.085, 0.44, 0.035, 5);
  {
    const pos = seatG.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y > 0) {
        const dish = Math.max(0, 1 - Math.hypot(v.x / 0.20, v.z / 0.19));
        v.y -= dish * 0.022;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    seatG.computeVertexNormals();
  }
  g.add(mesh(seatG, leatherM, [0, SEAT, 0]));
  const seatBase = roundedBox(0.44, 0.03, 0.42, 0.01, 2);
  g.add(mesh(seatBase, plastic, [0, SEAT - 0.055, 0]));

  // backrest on a curved stem, leaning back a little
  const stem = roundedBox(0.055, 0.30, 0.045, 0.012, 2);
  g.add(mesh(stem, plastic, [0, SEAT + 0.13, -0.19], [0.20, 0, 0]));

  const backG = roundedBox(0.42, 0.46, 0.085, 0.045, 5);
  {
    // curve the back around the occupant
    const pos = backG.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = v.x / 0.21;
      v.z += t * t * 0.045;
      if (v.z > 0) {
        const dish = Math.max(0, 1 - Math.hypot(v.x / 0.17, (v.y + 0.03) / 0.20));
        v.z -= dish * 0.020;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    backG.computeVertexNormals();
  }
  g.add(mesh(backG, leatherM, [0, SEAT + 0.36, -0.235], [0.20, 0, 0]));

  // armrests
  for (const sx of [-1, 1]) {
    const post = roundedBox(0.030, 0.19, 0.030, 0.008, 2);
    g.add(mesh(post, plastic, [sx * 0.235, SEAT + 0.09, -0.04]));
    const pad = roundedBox(0.055, 0.028, 0.22, 0.013, 3);
    g.add(mesh(pad, leatherM, [sx * 0.235, SEAT + 0.19, 0.01]));
  }

  // tilt lever
  const lever = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.09, 4, 8), plastic);
  lever.rotation.set(0, 0, Math.PI / 2);
  lever.position.set(0.20, SEAT - 0.05, 0.08);
  lever.castShadow = true;
  g.add(lever);

  return g;
}

/** Books: procedurally sized, coloured, some leaning, some stacked flat. */
function makeBooks(shelfW, shelfH, seed) {
  const rnd = mulberry32(seed);
  const group = new THREE.Group();
  const palette = [
    0x7a2f28, 0x2f4a63, 0x3f5a3a, 0x6b5230, 0x2b2b33, 0x8a6a3a,
    0x513a5c, 0x9a5c3a, 0x2f4f4a, 0x6d2d3c, 0xc9b48a, 0x35405e,
  ];
  let x = 0.015;
  let lean = 0;
  while (x < shelfW - 0.08) {
    if (rnd() > 0.86) { x += 0.02 + rnd() * 0.05; lean = 0; continue; }  // gap
    // occasional flat stack
    if (rnd() > 0.9) {
      let sy = 0;
      const n = 2 + Math.floor(rnd() * 3);
      const sw = 0.14 + rnd() * 0.05;
      for (let i = 0; i < n; i++) {
        const th = 0.022 + rnd() * 0.018;
        const g = roundedBox(sw - i * 0.006, th, 0.17 - i * 0.004, 0.003, 1);
        const m = new THREE.Mesh(withUV2(g), mat('paper', { color: palette[(rnd() * palette.length) | 0], roughness: 0.75 }));
        m.position.set(x + sw / 2, sy + th / 2, 0);
        m.rotation.y = (rnd() - 0.5) * 0.06;
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
        sy += th;
      }
      x += sw + 0.02;
      continue;
    }
    const th = 0.018 + rnd() * 0.026;
    const h = shelfH * (0.62 + rnd() * 0.30);
    const d = 0.13 + rnd() * 0.045;
    const g = roundedBox(th, h, d, 0.0025, 1);
    const col = palette[(rnd() * palette.length) | 0];
    const m = new THREE.Mesh(withUV2(g), mat('paper', { color: col, roughness: 0.72 + rnd() * 0.2 }));
    if (rnd() > 0.9) lean = (rnd() - 0.5) * 0.35;
    m.rotation.z = lean * 0.6;
    m.position.set(x + th / 2 + Math.abs(lean) * h * 0.2, h / 2, (rnd() - 0.5) * 0.012);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    // paper block, slightly inset and lighter
    const block = new THREE.Mesh(
      withUV2(roundedBox(th * 0.82, h * 0.95, d * 0.93, 0.002, 1)),
      mat('paper', { color: 0xe8dcc4 }),
    );
    block.position.copy(m.position); block.rotation.copy(m.rotation);
    block.position.z += 0.004;
    block.castShadow = true;
    group.add(block);
    x += th + 0.003 + Math.abs(lean) * 0.05;
    lean *= 0.5;
  }
  return group;
}

function buildBookcase(group) {
  const g = new THREE.Group();
  g.position.set(ROOM.x0 + 0.19, 0, 1.45);
  group.add(g);

  const W = 0.86, H = 1.72, D = 0.30, T = 0.022;
  const woodM = mat('walnut', { repeat: [1, 2] });
  const backM = mat('pine', { color: 0x8a7358 });

  const parts = [];
  for (const sx of [-1, 1]) {
    const side = roundedBox(T, H, D, 0.004, 1);
    side.translate(sx * (W / 2 - T / 2), H / 2, 0);
    parts.push(side);
  }
  const SHELVES = [0.03, 0.40, 0.76, 1.10, 1.42, H - T / 2];
  for (const y of SHELVES) {
    const s = roundedBox(W - T * 2, T, D - 0.01, 0.004, 1);
    s.translate(0, y, 0.005);
    parts.push(s);
  }
  const back = new THREE.BoxGeometry(W - T * 1.6, H - 0.04, 0.010);
  back.translate(0, H / 2, -D / 2 + 0.006);
  g.add(mesh(back, backM));
  // plinth
  const plinth = roundedBox(W, 0.03, D - 0.03, 0.004, 1);
  plinth.translate(0, 0.015, 0);
  parts.push(plinth);
  g.add(mesh(mergeGeometries(parts), woodM));

  // fill the shelves
  for (let i = 0; i < SHELVES.length - 1; i++) {
    const y = SHELVES[i] + T / 2;
    const h = SHELVES[i + 1] - SHELVES[i] - T;
    if (i === 2) continue;                     // leave one shelf for props
    const books = makeBooks(W - T * 2 - 0.02, h, 900 + i * 17);
    books.position.set(-(W / 2 - T) + 0.01, y, 0.01);
    g.add(books);
  }

  return g;
}

function buildNightstand(group) {
  const g = new THREE.Group();
  g.position.set(0.92, 0, 2.16);
  g.rotation.y = 0.06;
  group.add(g);

  const W = 0.40, H = 0.52, D = 0.36;
  const woodM = mat('walnut');
  const parts = [];
  const body = roundedBox(W, H, D, 0.008, 2);
  body.translate(0, H / 2, 0);
  parts.push(body);
  g.add(mesh(mergeGeometries(parts), woodM));

  // two drawer faces, the top one open a crack
  for (let i = 0; i < 2; i++) {
    const y = 0.14 + i * 0.20;
    const out = i === 1 ? 0.035 : 0.004;
    const face = roundedBox(W - 0.035, 0.165, 0.018, 0.005, 2);
    g.add(mesh(face, mat('walnut', { color: 0xd8c8ac, roughness: 0.5 }), [0, y, D / 2 + out]));
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 14, 10),
      mat('steel', { color: 0xb08a4a, roughness: 0.3, metalness: 1 }),
    );
    knob.position.set(0, y, D / 2 + out + 0.020);
    knob.castShadow = true;
    g.add(knob);
    if (i === 1) {
      // dark gap where the drawer is pulled out
      const gap = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.14, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x0d0a07, roughness: 1 }));
      gap.position.set(0, y, D / 2 - 0.01);
      g.add(gap);
    }
  }
  // stubby legs
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = lathe([[0.018, 0], [0.022, 0.01], [0.016, 0.06]], 12);
    g.add(mesh(leg, woodM, [sx * (W / 2 - 0.04), -0.0, sz * (D / 2 - 0.04)]));
  }
  return g;
}

function buildRug(group) {
  const g = cloth({
    w: 2.15, d: 1.62, segW: 40, segD: 32, y: 0.008,
    gravity: 0.0006, iterations: 90, stiffness: 0.99, seed: 77,
    colliders: [{ type: 'plane', y: 0.006 }],
  });
  // curl one corner and add a gentle ripple — rugs are never flat
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const curl = Math.max(0, (x - 0.72) / 0.36) * Math.max(0, (z - 0.5) / 0.31);
    const ripple = Math.sin(x * 3.4) * Math.cos(z * 2.7) * 0.004;
    pos.setY(i, pos.getY(i) + curl * 0.045 + ripple);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(withUV2(g), mat('rug', { side: THREE.DoubleSide }));
  m.position.set(-0.05, 0, 0.42);
  m.rotation.y = 0.04;
  m.receiveShadow = true; m.castShadow = true;
  group.add(m);

  // fringe along the short ends
  const fringeM = mat('rug', { color: 0xd8c9a8 });
  const fringe = [];
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 46; i++) {
      const x = -1.06 + i * (2.12 / 45);
      const rnd = mulberry32(i * 31 + (sz > 0 ? 3 : 7));
      const len = 0.035 + rnd() * 0.02;
      const t = new THREE.CylinderGeometry(0.0035, 0.0028, len, 5);
      t.rotateX(Math.PI / 2 + (rnd() - 0.5) * 0.25);
      t.translate(x + (rnd() - 0.5) * 0.008, 0.006, sz * (0.81 + len / 2));
      fringe.push(t);
    }
  }
  const fm = new THREE.Mesh(mergeGeometries(fringe), fringeM);
  fm.position.copy(m.position); fm.rotation.copy(m.rotation);
  fm.castShadow = true; fm.receiveShadow = true;
  group.add(fm);

  return m;
}

export function buildFurniture(scene) {
  const group = new THREE.Group();
  group.name = 'furniture';
  scene.add(group);

  buildBed(group);
  buildDesk(group);
  const chair = buildChair(group);
  buildBookcase(group);
  buildNightstand(group);
  buildRug(group);

  const colliders = [
    { x0: BED.x - BED.w / 2 - 0.05, x1: ROOM.x1, z0: BED.z0 - 0.05, z1: ROOM.z1 },              // bed
    { x0: DESK.x - DESK.w / 2, x1: DESK.x + DESK.w / 2, z0: ROOM.z0, z1: DESK.z + DESK.d / 2 }, // desk
    { x0: ROOM.x0, x1: ROOM.x0 + 0.40, z0: 0.55, z1: 2.35 },                                    // bookcase
    { x0: 0.70, x1: 1.14, z0: 1.96, z1: 2.36 },                                                 // nightstand
    { x0: DESK.x - 0.42, x1: DESK.x + 0.34, z0: DESK.z + 0.55, z1: DESK.z + 1.18 },             // chair
  ];

  // the chair breathes very slightly, as if it just stopped swivelling
  const update = (t) => {
    chair.rotation.y = -0.24 + Math.sin(t * 0.21) * 0.006;
  };

  return { group, colliders, update, chair };
}
