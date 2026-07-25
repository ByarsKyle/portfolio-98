// ─────────────────────────────────────────────────────────────
// assets/room — the shell: floor, walls, ceiling, trim, window, door.
// Room occupies x ∈ [-2.2, 2.2], z ∈ [-2.5, 2.5], y ∈ [0, 2.6].
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mat } from '../forge/materials.js';
import { roundedBox, extrude, roundRectPts, withUV2, mergeGeometries, cloth } from '../forge/geo.js';
import { draw } from '../forge/texture.js';
import { Noise2D, mulberry32 } from '../forge/noise.js';

export const ROOM = {
  x0: -2.2, x1: 2.2, z0: -2.5, z1: 2.5, y0: 0, y1: 2.6,
  get w() { return this.x1 - this.x0; },
  get d() { return this.z1 - this.z0; },
  get h() { return this.y1 - this.y0; },
};

const add = (parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], cast = true, receive = true) => {
  const m = new THREE.Mesh(withUV2(geo), material);
  m.position.set(...pos); m.rotation.set(...rot);
  m.castShadow = cast; m.receiveShadow = receive;
  parent.add(m);
  return m;
};

/** Night-time exterior painted onto a plane a couple of metres past the glass. */
function exteriorBackdrop() {
  const tex = draw(1024, 768, (ctx, w, h) => {
    // deep dusk gradient
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.0, '#0a1224');
    sky.addColorStop(0.42, '#1d2b46');
    sky.addColorStop(0.62, '#3d3550');
    sky.addColorStop(0.78, '#6b4a52');
    sky.addColorStop(1.0, '#241a20');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // stars
    const rnd = mulberry32(88);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h * 0.45;
      const a = rnd() * 0.6 + 0.1;
      ctx.fillStyle = `rgba(220,230,255,${a * (1 - y / (h * 0.5))})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    // distant rooftops with lit windows
    const drawBlock = (x, y, bw, bh, shade) => {
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, bw, bh);
      for (let wy = y + 12; wy < y + bh - 10; wy += 26) {
        for (let wx = x + 10; wx < x + bw - 12; wx += 22) {
          if (rnd() > 0.62) {
            const warm = rnd();
            ctx.fillStyle = warm > 0.75 ? 'rgba(180,215,255,0.75)' : `rgba(255,${170 + rnd() * 50 | 0},${90 + rnd() * 60 | 0},${0.5 + rnd() * 0.45})`;
            ctx.fillRect(wx, wy, 9, 13);
          }
        }
      }
    };
    let x = -40;
    while (x < w + 40) {
      const bw = 70 + rnd() * 120;
      const bh = 120 + rnd() * 240;
      drawBlock(x, h * 0.62 - bh, bw, bh, `rgb(${16 + rnd() * 10 | 0},${18 + rnd() * 10 | 0},${30 + rnd() * 12 | 0})`);
      x += bw + 8 + rnd() * 26;
    }

    // bare tree silhouette in front
    ctx.strokeStyle = '#0d0d14'; ctx.lineCap = 'round';
    const branch = (bx, by, ang, len, wdt, depth) => {
      if (depth === 0 || len < 6) return;
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      ctx.lineWidth = wdt; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      branch(ex, ey, ang - 0.35 - rnd() * 0.35, len * (0.66 + rnd() * 0.13), wdt * 0.66, depth - 1);
      branch(ex, ey, ang + 0.32 + rnd() * 0.35, len * (0.66 + rnd() * 0.13), wdt * 0.66, depth - 1);
      if (rnd() > 0.6) branch(ex, ey, ang + (rnd() - 0.5) * 0.3, len * 0.55, wdt * 0.5, depth - 1);
    };
    branch(200, h + 40, -Math.PI / 2 - 0.08, 150, 22, 8);
    branch(880, h + 60, -Math.PI / 2 + 0.1, 120, 18, 7);

    // ground haze / street glow
    const glow = ctx.createLinearGradient(0, h * 0.55, 0, h);
    glow.addColorStop(0, 'rgba(255,170,90,0)');
    glow.addColorStop(1, 'rgba(255,160,80,0.16)');
    ctx.fillStyle = glow; ctx.fillRect(0, h * 0.55, w, h * 0.45);
  }, { repeat: [1, 1] });

  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6.5),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: true }),
  );
  return m;
}

/** Window on the west wall: casing, mullions, glass, sill, exterior. */
function buildWindow(group) {
  const plasterM = mat('plaster');
  const trimM = mat('plaster', { color: 0xece2d2, roughness: 0.55 });
  const W = { y0: 0.95, y1: 2.05, z0: -0.85, z1: 0.85 };  // opening on the x0 wall
  const x = ROOM.x0;

  // wall built around the opening
  const wallH = ROOM.h, wallD = ROOM.d;
  const pieces = [
    // [w(z-extent), h, centreZ, centreY]
    [wallD, W.y0, 0, W.y0 / 2],                                   // below
    [wallD, wallH - W.y1, 0, (W.y1 + wallH) / 2],                 // above
    [(wallD / 2) + W.z0, W.y1 - W.y0, (-wallD / 2 + W.z0) / 2, (W.y0 + W.y1) / 2],  // left
    [(wallD / 2) - W.z1, W.y1 - W.y0, (wallD / 2 + W.z1) / 2, (W.y0 + W.y1) / 2],   // right
  ];
  for (const [pw, ph, cz, cy] of pieces) {
    if (pw <= 0 || ph <= 0) continue;
    const g = new THREE.BoxGeometry(0.12, ph, pw);
    // scale UVs so plaster tiles consistently regardless of piece size
    add(group, g, plasterM, [x - 0.06, cy, cz], [0, 0, 0], false, true);
  }

  // reveal (the thickness of the wall around the opening)
  const revealM = trimM;
  const rv = 0.12;
  add(group, new THREE.BoxGeometry(rv, 0.03, W.z1 - W.z0 + 0.06), revealM, [x - rv / 2, W.y0 + 0.015, 0]);
  add(group, new THREE.BoxGeometry(rv, 0.03, W.z1 - W.z0 + 0.06), revealM, [x - rv / 2, W.y1 - 0.015, 0]);
  add(group, new THREE.BoxGeometry(rv, W.y1 - W.y0, 0.03), revealM, [x - rv / 2, (W.y0 + W.y1) / 2, W.z0 - 0.015]);
  add(group, new THREE.BoxGeometry(rv, W.y1 - W.y0, 0.03), revealM, [x - rv / 2, (W.y0 + W.y1) / 2, W.z1 + 0.015]);

  // painted timber casing on the room side
  const casingG = [];
  const cw = 0.075, ct = 0.022;
  const oz = W.z1 - W.z0, oy = W.y1 - W.y0;
  const mk = (w, h, y, z) => { const g = roundedBox(ct, h, w, 0.004, 1); g.translate(0, y, z); return g; };
  casingG.push(mk(oz + cw * 2, cw, W.y0 - cw / 2, 0));
  casingG.push(mk(oz + cw * 2, cw, W.y1 + cw / 2, 0));
  casingG.push(mk(cw, oy, (W.y0 + W.y1) / 2, W.z0 - cw / 2));
  casingG.push(mk(cw, oy, (W.y0 + W.y1) / 2, W.z1 + cw / 2));
  const casing = mergeGeometries(casingG);
  add(group, casing, trimM, [x + ct / 2 + 0.001, 0, 0]);

  // sill, with a bullnose front edge
  const sill = roundedBox(0.26, 0.035, oz + 0.20, 0.014, 2);
  add(group, sill, mat('walnut', { roughness: 0.42 }), [x + 0.10, W.y0 - 0.02, 0]);

  // sash bars — two over two
  const barM = trimM;
  const barT = 0.028;
  add(group, roundedBox(0.03, oy, barT, 0.004, 1), barM, [x + 0.055, (W.y0 + W.y1) / 2, 0]);
  add(group, roundedBox(0.03, barT, oz, 0.004, 1), barM, [x + 0.055, (W.y0 + W.y1) / 2, 0]);
  for (const z of [-oz / 4, oz / 4]) {
    add(group, roundedBox(0.024, oy, 0.018, 0.003, 1), barM, [x + 0.055, (W.y0 + W.y1) / 2, z]);
  }

  // glass — thin, physical, slightly dirty
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(oz, oy),
    new THREE.MeshPhysicalMaterial({
      color: 0xdfe9f5, metalness: 0, roughness: 0.06, transmission: 0.94,
      thickness: 0.01, ior: 1.52, transparent: true, opacity: 1,
      envMapIntensity: 1.4, side: THREE.DoubleSide,
    }),
  );
  glass.rotation.y = Math.PI / 2;
  glass.position.set(x + 0.055, (W.y0 + W.y1) / 2, 0);
  group.add(glass);

  // the world outside
  const back = exteriorBackdrop();
  back.rotation.y = Math.PI / 2;
  back.position.set(x - 2.6, 1.5, 0);
  group.add(back);

  // ── linen curtains, simulated so they actually hang in folds.
  // The sheet is relaxed lying flat with one edge pinned; gravity swings it
  // down into a vertical hang all by itself, so the finished geometry already
  // occupies the XY plane — width along local X, falling along -Y. A parent
  // group then turns the whole thing to face into the room.
  const curtainM = mat('linen', { side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const curtainRig = new THREE.Group();
  curtainRig.position.set(x + 0.15, W.y1 + 0.13, 0);
  curtainRig.rotation.y = Math.PI / 2;     // panels run along the wall (world Z)
  group.add(curtainRig);

  const PANEL_W = 0.62, PANEL_H = 1.18;
  for (const side of [-1, 1]) {
    const g = cloth({
      w: PANEL_W, d: PANEL_H, segW: 26, segD: 40,
      y: 0, gravity: 0.0016, iterations: 260, stiffness: 0.9,
      seed: side > 0 ? 21 : 22,
      pins: (u, v) => v < 0.03,
      colliders: [],
    });
    // gather the fabric into pleats across the width, strongest at the rod
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const t = (px + PANEL_W / 2) / PANEL_W;
      const hang = Math.min(1, Math.max(0, -py / PANEL_H));
      const gather = Math.sin(t * Math.PI * 8) * 0.026 * (1 - hang * 0.45);
      pos.setZ(i, pz + gather);
      // let the free edge drift into the room a little
      pos.setX(i, px * (1 + hang * 0.06));
    }
    // the relaxed sheet hangs from the pinned row at z = -d/2; bring that
    // edge back to the origin so the panel pivots on the rod, not half a
    // metre out into the room
    g.translate(0, 0, PANEL_H / 2);
    g.computeVertexNormals();

    const panel = new THREE.Mesh(withUV2(g), curtainM);
    panel.position.set(side * (oz / 2 + PANEL_W / 2 - 0.10), 0, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    curtainRig.add(panel);
  }

  // curtain rod + finials
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, oz + 0.75, 12),
    mat('steel', { color: 0x6b5a45, roughness: 0.4, metalness: 0.9 }),
  );
  rod.rotation.x = Math.PI / 2;
  rod.position.set(x + 0.16, W.y1 + 0.16, 0);
  rod.castShadow = true;
  group.add(rod);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), rod.material);
    f.position.set(x + 0.16, W.y1 + 0.16, s * (oz / 2 + 0.375));
    f.castShadow = true;
    group.add(f);
  }

  return { W, x };
}

/** Panelled door on the south wall + frame + handle. */
function buildDoor(group) {
  const trimM = mat('plaster', { color: 0xe8dcc9, roughness: 0.5 });
  const z = ROOM.z1;
  const dw = 0.82, dh = 2.03, dx = -1.25;

  // door leaf, recessed into the wall, ajar by a few degrees
  const pivot = new THREE.Group();
  pivot.position.set(dx - dw / 2, 0, z - 0.06);
  pivot.rotation.y = -0.13;
  group.add(pivot);

  const leaf = new THREE.Group();
  leaf.position.set(dw / 2, dh / 2, 0);
  pivot.add(leaf);

  const doorM = mat('plaster', { color: 0xdfd3c0, roughness: 0.46 });
  const body = new THREE.Mesh(withUV2(roundedBox(dw, dh, 0.042, 0.004, 2)), doorM);
  body.castShadow = true; body.receiveShadow = true;
  leaf.add(body);

  // four raised panels
  const panel = (w, h, y) => {
    const g = extrude(roundRectPts(w, h, 0.02, 4), 0.014, 0.006);
    const m = new THREE.Mesh(withUV2(g), doorM);
    m.position.set(0, y, 0.026);
    m.castShadow = true; m.receiveShadow = true;
    leaf.add(m);
    const m2 = m.clone(); m2.position.z = -0.026; m2.rotation.y = Math.PI; leaf.add(m2);
  };
  panel(dw - 0.20, 0.50, 0.62);
  panel(dw - 0.20, 0.50, 0.06);
  panel(dw - 0.20, 0.42, -0.52);
  panel(dw - 0.20, 0.20, -0.86);

  // brass handle
  const brass = mat('steel', { color: 0xb8863a, roughness: 0.28, metalness: 1 });
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 20), brass);
  rose.rotation.x = Math.PI / 2; rose.position.set(dw / 2 - 0.08, 0.02, 0.026);
  rose.castShadow = true; leaf.add(rose);
  const lever = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.09, 4, 10), brass);
  lever.rotation.z = Math.PI / 2; lever.position.set(dw / 2 - 0.125, 0.02, 0.048);
  lever.castShadow = true; leaf.add(lever);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 12), brass);
  stem.rotation.x = Math.PI / 2; stem.position.set(dw / 2 - 0.08, 0.02, 0.04);
  leaf.add(stem);

  // architrave
  const arch = [];
  const aw = 0.07, at = 0.02;
  const g1 = roundedBox(dw + aw * 2, aw, at, 0.004, 1); g1.translate(dx, dh + aw / 2, 0);
  const g2 = roundedBox(aw, dh, at, 0.004, 1); g2.translate(dx - dw / 2 - aw / 2, dh / 2, 0);
  const g3 = roundedBox(aw, dh, at, 0.004, 1); g3.translate(dx + dw / 2 + aw / 2, dh / 2, 0);
  arch.push(g1, g2, g3);
  add(group, mergeGeometries(arch), trimM, [0, 0, z - at / 2 - 0.001]);

  // dark hallway visible through the gap
  const hall = new THREE.Mesh(
    new THREE.PlaneGeometry(dw, dh),
    new THREE.MeshBasicMaterial({ color: 0x05040a }),
  );
  hall.position.set(dx, dh / 2, z + 0.02);
  hall.rotation.y = Math.PI;
  group.add(hall);

  return { dx, dw, dh, z };
}

export function buildRoom(scene) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);

  const plasterM = mat('plaster');
  const floorM = mat('oakFloor');

  // ── floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d, 1, 1), floorM);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  withUV2(floor.geometry);
  group.add(floor);

  // ── ceiling, very slightly warmer than the walls
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    mat('plaster', { color: 0xf2ece1, roughness: 0.95 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.y1;
  ceil.receiveShadow = true;
  withUV2(ceil.geometry);
  group.add(ceil);

  // ── walls (north / south / east; the west wall is built by buildWindow)
  const wallGeoZ = new THREE.PlaneGeometry(ROOM.w, ROOM.h);
  const wallGeoX = new THREE.PlaneGeometry(ROOM.d, ROOM.h);

  const north = new THREE.Mesh(wallGeoZ, plasterM);
  north.position.set(0, ROOM.h / 2, ROOM.z0);
  north.receiveShadow = true; withUV2(north.geometry); group.add(north);

  const south = new THREE.Mesh(wallGeoZ.clone(), plasterM);
  south.position.set(0, ROOM.h / 2, ROOM.z1);
  south.rotation.y = Math.PI;
  south.receiveShadow = true; group.add(south);

  const east = new THREE.Mesh(wallGeoX, plasterM);
  east.position.set(ROOM.x1, ROOM.h / 2, 0);
  east.rotation.y = -Math.PI / 2;
  east.receiveShadow = true; withUV2(east.geometry); group.add(east);

  // ── skirting board + picture rail, mitred around the room
  const trimM = mat('plaster', { color: 0xe9dece, roughness: 0.5 });
  const skirtProfile = (len) => {
    const g = roundedBox(len, 0.135, 0.022, 0.004, 1);
    return g;
  };
  const skirts = [];
  const s1 = skirtProfile(ROOM.w); s1.translate(0, 0.0675, ROOM.z0 + 0.011); skirts.push(s1);
  const s2 = skirtProfile(ROOM.w); s2.translate(0, 0.0675, ROOM.z1 - 0.011); skirts.push(s2);
  const s3 = skirtProfile(ROOM.d); s3.rotateY(Math.PI / 2); s3.translate(ROOM.x1 - 0.011, 0.0675, 0); skirts.push(s3);
  const s4 = skirtProfile(ROOM.d); s4.rotateY(Math.PI / 2); s4.translate(ROOM.x0 + 0.011, 0.0675, 0); skirts.push(s4);
  add(group, mergeGeometries(skirts), trimM, [0, 0, 0], [0, 0, 0], true, true);

  const rails = [];
  const railProfile = (len) => roundedBox(len, 0.035, 0.016, 0.003, 1);
  const r1 = railProfile(ROOM.w); r1.translate(0, 2.05, ROOM.z0 + 0.008); rails.push(r1);
  const r2 = railProfile(ROOM.d); r2.rotateY(Math.PI / 2); r2.translate(ROOM.x1 - 0.008, 2.05, 0); rails.push(r2);
  add(group, mergeGeometries(rails), trimM, [0, 0, 0]);

  const win = buildWindow(group);
  const door = buildDoor(group);

  // ── light switch + a couple of outlets, because empty walls read as fake
  const plateM = mat('plaster', { color: 0xf4efe6, roughness: 0.35 });
  const switchPlate = new THREE.Mesh(withUV2(roundedBox(0.085, 0.085, 0.012, 0.008, 2)), plateM);
  switchPlate.position.set(-0.72, 1.22, ROOM.z1 - 0.006);
  switchPlate.rotation.y = Math.PI;
  switchPlate.castShadow = true; group.add(switchPlate);
  const rocker = new THREE.Mesh(withUV2(roundedBox(0.03, 0.05, 0.012, 0.004, 1)), plateM);
  rocker.position.set(-0.72, 1.22, ROOM.z1 - 0.016);
  rocker.rotation.set(0.12, Math.PI, 0);
  group.add(rocker);

  const outlet = (x, z, ry) => {
    const p = new THREE.Mesh(withUV2(roundedBox(0.085, 0.085, 0.012, 0.008, 2)), plateM);
    p.position.set(x, 0.26, z); p.rotation.y = ry;
    p.castShadow = true; group.add(p);
    for (const dx of [-0.018, 0.018]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.004), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
      slot.position.set(x + Math.cos(ry) * 0 + dx * Math.cos(ry), 0.275, z - Math.sin(ry) * 0.008 + dx * -Math.sin(ry));
      slot.rotation.y = ry;
      group.add(slot);
    }
  };
  outlet(1.55, ROOM.z0 + 0.007, 0);
  outlet(ROOM.x1 - 0.007, -1.4, -Math.PI / 2);

  // ── a strip of ceiling artex / age stain near the window, keeps it lived-in
  const stain = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.4),
    new THREE.MeshBasicMaterial({
      color: 0x6b5a45, transparent: true, opacity: 0.13, depthWrite: false,
    }),
  );
  stain.rotation.x = Math.PI / 2;
  stain.position.set(ROOM.x0 + 0.55, ROOM.y1 - 0.002, 0.2);
  group.add(stain);

  return { group, win, door };
}
