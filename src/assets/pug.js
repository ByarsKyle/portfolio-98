// ─────────────────────────────────────────────────────────────
// assets/pug — one (1) goofy pug, sitting on the rug.
//
// Body and head are deformed icosahedra with per-vertex colouring
// for the fawn coat and the black mask. Fur is shell-rendered:
// twelve alpha-cut copies of each surface pushed out along their
// normals, so the silhouette breaks up the way fur actually does.
//
// He breathes, blinks, wags, flicks an ear, and looks at you if
// you stand in front of him for long enough.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { blob, tube, withUV2, mergeGeometries, roundedBox } from '../forge/geo.js';
import { draw } from '../forge/texture.js';
import { Noise2D, mulberry32, clamp, smoothstep, mix } from '../forge/noise.js';

const FAWN = new THREE.Color(0xc9a877);
const FAWN_DARK = new THREE.Color(0x9c8358);
const MASK = new THREE.Color(0x2a231e);
const MUZZLE = new THREE.Color(0x191512);

const SHELLS = 12;
const FUR_LEN = 0.011;

/** Sparse dot mask — each shell keeps a smaller fraction of the surface. */
function furAlpha(size = 256, density = 0.42, seed = 3) {
  return draw(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const rnd = mulberry32(seed);
    const field = new Float32Array(w * h);
    // scatter strand roots
    const strands = Math.floor(w * h * density * 0.06);
    for (let i = 0; i < strands; i++) {
      const x = (rnd() * w) | 0, y = (rnd() * h) | 0;
      const r = 1 + rnd() * 1.6;
      const strength = 0.55 + rnd() * 0.45;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const px = (x + dx + w) % w, py = (y + dy + h) % h;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const v = strength * (1 - dist / r);
        const k = py * w + px;
        if (v > field[k]) field[k] = v;
      }
    }
    for (let i = 0; i < w * h; i++) {
      const a = Math.min(255, field[i] * 255);
      d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false, repeat: [1, 1] });
}

/** Apply per-vertex colour based on local position — mask, ears, chest blaze. */
function colourCoat(geo, kind) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const n = new Noise2D(77);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    c.copy(FAWN);
    if (kind === 'head') {
      // The mask is a soft gradient hugging the muzzle, not a hard patch —
      // vertex colours interpolate across big triangles, and a steep ramp
      // turns into visible facets.
      const front = smoothstep(0.028, 0.082, z);
      const low = smoothstep(0.055, -0.015, y);
      const maskAmt = clamp(front * front * 0.9 + low * front * 0.35);
      c.lerp(MASK, maskAmt);
      const brow = smoothstep(0.02, 0.065, y) * smoothstep(0.005, 0.055, z);
      c.lerp(FAWN_DARK, brow * 0.30);
    } else if (kind === 'body') {
      // dorsal shading, pale belly, faint spinal stripe
      const belly = smoothstep(0.02, -0.09, y);
      c.lerp(new THREE.Color(0xdcc79c), belly * 0.45);
      const spine = smoothstep(0.05, 0.10, y) * smoothstep(0.06, 0.0, Math.abs(x));
      c.lerp(FAWN_DARK, spine * 0.30);
    } else if (kind === 'ear') {
      c.copy(MASK).lerp(FAWN_DARK, 0.18);
    }
    // per-vertex noise so the coat isn't flat
    const v = n.fbm(x * 26, z * 26 + y * 14, 3) * 0.07;
    c.offsetHSL(0, 0, v);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Build the shell stack for one furry surface. */
function furStack(geo, alphaTex, { shells = SHELLS, len = FUR_LEN, tipDark = 0.55 } = {}) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0,
  }));
  base.castShadow = true; base.receiveShadow = true;
  group.add(base);

  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;

  for (let s = 1; s <= shells; s++) {
    const t = s / shells;
    const g = geo.clone();
    const gp = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // push out along the normal, with gravity droop toward the tips
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      const d = len * t;
      gp.setXYZ(i,
        pos.getX(i) + nx * d,
        pos.getY(i) + ny * d - t * t * len * 0.55,
        pos.getZ(i) + nz * d);
    }
    gp.needsUpdate = true;
    g.computeVertexNormals();
    // UVs for the fur mask: project so strands stay a consistent size
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      uv[i * 2] = (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 5.5;
      uv[i * 2 + 1] = (y * 8.5 + 0.5) * 1.6;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      alphaMap: alphaTex,
      transparent: false,
      alphaTest: 0.06 + t * 0.62,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      color: new THREE.Color().setScalar(1 - t * tipDark * 0.35).convertSRGBToLinear ? 0xffffff : 0xffffff,
    });
    // tips catch more light, roots sit in shadow
    m.color.setScalar(0.72 + t * 0.42);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = s < 4;
    group.add(mesh);
  }
  return group;
}

export function buildPug(scene) {
  const root = new THREE.Group();
  root.name = 'pug';
  // sitting on the rug, turned toward the door so he sees you come in
  root.position.set(-0.30, 0, 0.62);
  root.rotation.y = -0.34;
  scene.add(root);

  const alphaTex = furAlpha(256, 0.5, 11);
  const alphaFine = furAlpha(256, 0.75, 19);

  // ── body: pear-shaped, sitting, chest up
  const bodyGeo = blob(0.115, 3, [
    { dir: [0, -1, -0.35], amount: 0.34, falloff: 1.6 },   // haunches on the floor
    { dir: [0, 0.45, 0.7], amount: 0.16, falloff: 2.2 },   // chest
    { dir: [0, -0.6, 0.5], amount: -0.10, falloff: 2.5 },  // tuck under the chest
    { dir: [1, -0.3, -0.2], amount: 0.12, falloff: 2.0 },
    { dir: [-1, -0.3, -0.2], amount: 0.12, falloff: 2.0 },
  ], 5);
  bodyGeo.scale(1.0, 1.06, 0.92);
  bodyGeo.translate(0, 0.135, 0);
  colourCoat(bodyGeo, 'body');
  const body = furStack(bodyGeo, alphaTex);
  root.add(body);

  // ── head group (animated separately)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.235, 0.045);
  root.add(headPivot);

  const headGeo = blob(0.079, 3, [
    { dir: [0, 0.2, 1], amount: 0.10, falloff: 2.4 },     // brow forward
    { dir: [0, -0.5, 0.85], amount: 0.16, falloff: 2.0 }, // jowls
    { dir: [0, 1, -0.1], amount: 0.06, falloff: 2.4 },    // domed skull
    { dir: [1, 0.1, 0.2], amount: 0.09, falloff: 1.8 },   // cheeks
    { dir: [-1, 0.1, 0.2], amount: 0.09, falloff: 1.8 },
  ], 9);
  headGeo.scale(1.02, 0.94, 0.95);
  // wrinkle the brow: fold the surface with a few sine ridges
  {
    const p = headGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const front = clamp((v.z - 0.01) / 0.07);
      const wrinkle = Math.sin(v.y * 105 + 0.8) * 0.0022 * front
                    + Math.sin(v.y * 61 - 0.4) * 0.0016 * front;
      const n = v.clone().normalize();
      v.addScaledVector(n, wrinkle);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    headGeo.computeVertexNormals();
  }
  colourCoat(headGeo, 'head');
  const head = furStack(headGeo, alphaFine, { len: 0.007 });
  headPivot.add(head);

  // ── muzzle: short, flat, very black
  const muzzleGeo = blob(0.036, 2, [
    { dir: [0, -0.3, 1], amount: 0.22, falloff: 2.0 },
    { dir: [0, -1, 0.2], amount: 0.14, falloff: 2.2 },
  ], 4);
  muzzleGeo.scale(1.25, 0.82, 0.72);
  muzzleGeo.translate(0, -0.022, 0.062);
  const muzzleMat = new THREE.MeshStandardMaterial({ color: MUZZLE, roughness: 0.86 });
  const muzzle = new THREE.Mesh(withUV2(muzzleGeo), muzzleMat);
  muzzle.castShadow = true; muzzle.receiveShadow = true;
  headPivot.add(muzzle);

  // nose: two nostril dimples in a wet, glossy pad
  const noseGeo = blob(0.017, 2, [{ dir: [0, -0.2, 1], amount: 0.18, falloff: 2 }], 6);
  noseGeo.scale(1.35, 0.85, 0.7);
  const nose = new THREE.Mesh(withUV2(noseGeo), new THREE.MeshPhysicalMaterial({
    color: 0x14100e, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15,
  }));
  nose.position.set(0, -0.012, 0.088);
  nose.castShadow = true;
  headPivot.add(nose);
  for (const sx of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.SphereGeometry(0.0045, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x060505, roughness: 1 }),
    );
    nostril.scale.set(1, 1.5, 0.6);
    nostril.position.set(sx * 0.0072, -0.012, 0.0975);
    headPivot.add(nostril);
  }

  // ── eyes: big, round, slightly too far apart
  const eyeGroup = new THREE.Group();
  headPivot.add(eyeGroup);
  const eyes = [];
  const lids = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.036, 0.012, 0.058);
    eyeGroup.add(g);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.0155, 24, 18),
      new THREE.MeshPhysicalMaterial({
        color: 0x120c08, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03,
        envMapIntensity: 2.2,
      }),
    );
    ball.castShadow = true;
    g.add(ball);
    // the wet highlight that makes eyes read as alive
    const glint = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    glint.position.set(sx * -0.005, 0.006, 0.0125);
    g.add(glint);
    const glint2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.0016, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xd8e4ff }),
    );
    glint2.position.set(sx * 0.006, -0.004, 0.0125);
    g.add(glint2);

    // eyelid: a hemisphere shell that scales down to blink
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0168, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.9, side: THREE.DoubleSide }),
    );
    lid.rotation.x = -0.35;
    lid.scale.y = 0.12;
    g.add(lid);
    lids.push(lid);
    eyes.push(g);
  }

  // ── ears: folded button ears, one flopped forward more than the other
  const earMeshes = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.062, 0.045, -0.008);
    pivot.rotation.set(0.55, sx * 0.45, sx * -0.55);
    headPivot.add(pivot);

    const g = blob(0.032, 2, [
      { dir: [0, -1, 0.2], amount: 0.55, falloff: 1.5 },
      { dir: [0, 0, 1], amount: -0.35, falloff: 1.4 },
    ], 12 + sx);
    g.scale(0.62, 1.25, 0.42);
    g.translate(0, -0.028, 0);
    colourCoat(g, 'ear');
    const ear = furStack(g, alphaFine, { len: 0.005 });
    // the fold at the tip
    ear.rotation.x = sx > 0 ? 0.30 : 0.55;
    pivot.add(ear);
    earMeshes.push(pivot);
  }

  // ── tongue, permanently a little bit out
  const tongueGeo = blob(0.014, 2, [{ dir: [0, -1, 0.3], amount: 0.5, falloff: 1.6 }], 15);
  tongueGeo.scale(0.9, 0.42, 1.5);
  const tongue = new THREE.Mesh(withUV2(tongueGeo), new THREE.MeshPhysicalMaterial({
    color: 0xc4707e, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3,
  }));
  tongue.position.set(0.004, -0.044, 0.072);
  tongue.rotation.x = 0.5;
  tongue.castShadow = true;
  headPivot.add(tongue);

  // ── legs
  const legMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const legs = new THREE.Group();
  root.add(legs);

  const makeLeg = (x, z, pts) => {
    const g = tube(pts, 10, 18);
    // colour: fawn, darkening toward the paw
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      c.copy(FAWN).lerp(FAWN_DARK, clamp(1 - y / 0.16) * 0.35);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.translate(x, 0, z);
    const m = new THREE.Mesh(withUV2(g), legMat);
    m.castShadow = true; m.receiveShadow = true;
    legs.add(m);
    // paw
    const pawGeo = blob(0.026, 2, [{ dir: [0, 0, 1], amount: 0.25, falloff: 2 }], 21);
    pawGeo.scale(0.85, 0.55, 1.1);
    const pawCols = new Float32Array(pawGeo.attributes.position.count * 3);
    for (let i = 0; i < pawCols.length; i += 3) {
      pawCols[i] = FAWN_DARK.r; pawCols[i + 1] = FAWN_DARK.g; pawCols[i + 2] = FAWN_DARK.b;
    }
    pawGeo.setAttribute('color', new THREE.BufferAttribute(pawCols, 3));
    const paw = new THREE.Mesh(withUV2(pawGeo), legMat);
    paw.position.set(x + pts[0][0], 0.014, z + pts[0][2] + 0.012);
    paw.castShadow = true; paw.receiveShadow = true;
    legs.add(paw);
    // toes
    for (let i = -1; i <= 1; i++) {
      const toe = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x8d7550, roughness: 0.9 }),
      );
      toe.scale.set(1, 0.7, 1.35);
      toe.position.set(x + pts[0][0] + i * 0.0135, 0.010, z + pts[0][2] + 0.030);
      toe.castShadow = true;
      legs.add(toe);
    }
    return m;
  };

  // front legs: straight, propping him up
  makeLeg(0.048, 0.088, [[0, 0.018, 0, 0.019], [0.002, 0.075, -0.004, 0.021], [0.004, 0.135, -0.012, 0.026]]);
  makeLeg(-0.048, 0.088, [[0, 0.018, 0, 0.019], [-0.002, 0.075, -0.004, 0.021], [-0.004, 0.135, -0.012, 0.026]]);
  // hind legs: folded, knees out to the sides
  for (const sx of [-1, 1]) {
    const g = blob(0.052, 2, [
      { dir: [0, 0.4, 0.8], amount: 0.28, falloff: 1.8 },
      { dir: [0, -1, 0], amount: -0.18, falloff: 2.4 },
    ], 30 + sx);
    g.scale(0.62, 0.86, 1.25);
    g.translate(sx * 0.086, 0.055, -0.012);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = FAWN.r; cols[i + 1] = FAWN.g; cols[i + 2] = FAWN.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(withUV2(g), legMat);
    m.castShadow = true; m.receiveShadow = true;
    legs.add(m);
    // back paw peeking out front
    const paw = new THREE.Mesh(
      withUV2((() => {
        const pg = blob(0.024, 2, [{ dir: [0, 0, 1], amount: 0.3, falloff: 2 }], 40 + sx);
        pg.scale(0.8, 0.5, 1.2);
        const pc = new Float32Array(pg.attributes.position.count * 3);
        for (let i = 0; i < pc.length; i += 3) { pc[i] = FAWN_DARK.r; pc[i + 1] = FAWN_DARK.g; pc[i + 2] = FAWN_DARK.b; }
        pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
        return pg;
      })()),
      legMat,
    );
    paw.position.set(sx * 0.082, 0.012, 0.052);
    paw.castShadow = true; paw.receiveShadow = true;
    legs.add(paw);
  }

  // ── tail: the curl
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.155, -0.098);
  root.add(tailPivot);
  {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI * 2.15;
      const r = 0.042 * (1 - t * 0.42);
      pts.push([
        Math.sin(a) * r * 0.55 + 0.012,
        0.030 + Math.cos(a) * r + t * 0.014,
        -Math.sin(a) * r * 0.85 - t * 0.006,
        0.016 * (1 - t * 0.55),
      ]);
    }
    const g = tube(pts, 8, 34);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = FAWN.r; cols[i + 1] = FAWN.g; cols[i + 2] = FAWN.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const tail = new THREE.Mesh(withUV2(g), legMat);
    tail.castShadow = true;
    tailPivot.add(tail);
  }

  // ── a collar, because he is a loved animal
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.062, 0.007, 8, 30),
    new THREE.MeshStandardMaterial({ color: 0x8a2c2c, roughness: 0.7 }),
  );
  collar.rotation.x = Math.PI / 2 - 0.22;
  collar.position.set(0, 0.198, 0.022);
  collar.scale.set(1, 1, 0.85);
  collar.castShadow = true;
  root.add(collar);

  const tag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.010, 0.010, 0.0022, 14),
    new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.28, metalness: 1 }),
  );
  tag.rotation.set(Math.PI / 2 - 0.3, 0, 0);
  tag.position.set(0, 0.176, 0.072);
  tag.castShadow = true;
  root.add(tag);

  // ── animation state
  const anim = {
    blinkT: 1.5 + Math.random() * 3,
    blink: 0,
    lookT: 4,
    lookAt: new THREE.Vector3(),
    looking: 0,
    earFlick: 3 + Math.random() * 5,
    earPhase: 0,
    pant: 0,
  };

  const baseHead = headPivot.rotation.clone();
  const _v = new THREE.Vector3();
  const _target = new THREE.Vector3();

  function update(t, dt, camera) {
    // breathing — chest and belly, slightly out of phase
    const breath = Math.sin(t * 1.55);
    body.scale.set(1 + breath * 0.014, 1 + breath * 0.010, 1 + breath * 0.017);
    body.position.y = breath * 0.0025;

    // tail: a lazy wag that occasionally gets excited
    if (anim.excited > 0) anim.excited = Math.max(0, anim.excited - dt);
    const excite = Math.min(1,
      smoothstep(0.55, 1.0, Math.sin(t * 0.23) * 0.5 + 0.5) + (anim.excited ?? 0));
    const wagSpeed = 2.4 + excite * 7;
    tailPivot.rotation.z = Math.sin(t * wagSpeed) * (0.10 + excite * 0.30);
    tailPivot.rotation.y = Math.sin(t * wagSpeed * 0.5) * 0.06;

    // head: idle sway plus the occasional confused tilt
    anim.lookT -= dt;
    if (anim.lookT <= 0) {
      anim.lookT = 3.5 + Math.random() * 6;
      anim.looking = Math.random() > 0.42 ? 1 : 0;
      anim.tilt = (Math.random() - 0.5) * 0.55;
    }
    const sway = Math.sin(t * 0.85) * 0.05;
    const bob = Math.sin(t * 1.55 + 0.6) * 0.012;

    headPivot.rotation.x = baseHead.x + bob + Math.sin(t * 0.6) * 0.03;
    headPivot.rotation.y = baseHead.y + sway;
    headPivot.rotation.z = baseHead.z;

    if (anim.looking && camera) {
      // turn toward the player, but only so far — he is a pug, not an owl
      _target.copy(camera.position);
      root.worldToLocal(_target.clone());
      _v.copy(camera.position);
      root.updateMatrixWorld();
      const local = root.worldToLocal(_v.clone());
      const dx = local.x - headPivot.position.x;
      const dz = local.z - headPivot.position.z;
      const dy = local.y - (headPivot.position.y + 0.25);
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const k = Math.min(1, dt * 2.4);
      headPivot.rotation.y += (clamp(yaw, -0.85, 0.85) - headPivot.rotation.y) * k;
      headPivot.rotation.x += (clamp(pitch * 0.5, -0.28, 0.35) - headPivot.rotation.x) * k;
      headPivot.rotation.z += ((anim.tilt ?? 0) - headPivot.rotation.z) * k;
    } else {
      headPivot.rotation.z += (0 - headPivot.rotation.z) * Math.min(1, dt * 1.6);
    }

    // blinking — quick, occasionally a double
    anim.blinkT -= dt;
    if (anim.blinkT <= 0) {
      anim.blink = 1;
      anim.blinkT = 1.8 + Math.random() * 4.5;
    }
    if (anim.blink > 0) {
      anim.blink = Math.max(0, anim.blink - dt * 7.5);
      const closed = Math.sin((1 - anim.blink) * Math.PI);
      for (const lid of lids) lid.scale.y = 0.12 + closed * 1.05;
    }

    // ear flicks
    anim.earFlick -= dt;
    if (anim.earFlick <= 0) { anim.earFlick = 2.5 + Math.random() * 7; anim.earPhase = 1; }
    if (anim.earPhase > 0) {
      anim.earPhase = Math.max(0, anim.earPhase - dt * 4.5);
      const f = Math.sin(anim.earPhase * Math.PI * 3) * anim.earPhase;
      earMeshes[0].rotation.z = -0.55 + f * 0.35;
      earMeshes[1].rotation.z = 0.55 - f * 0.12;
    } else {
      earMeshes[0].rotation.z += (-0.55 - earMeshes[0].rotation.z) * Math.min(1, dt * 4);
      earMeshes[1].rotation.z += (0.55 - earMeshes[1].rotation.z) * Math.min(1, dt * 4);
    }
    // ears also swing a little with the head
    earMeshes[0].rotation.x = 0.55 + Math.sin(t * 1.55) * 0.035;
    earMeshes[1].rotation.x = 0.55 + Math.sin(t * 1.55 + 0.4) * 0.035;

    // panting: the tongue bobs
    tongue.position.y = -0.044 + Math.sin(t * 5.2) * 0.0022;
    tongue.rotation.x = 0.5 + Math.sin(t * 5.2) * 0.05;
  }

  /** Called when the player says hello: perk up and wag hard for a moment. */
  function excite(amount = 2) {
    anim.excited = Math.max(anim.excited ?? 0, amount);
    anim.looking = 1;
    anim.lookT = 3.5;
    anim.tilt = (Math.random() - 0.5) * 0.5;
    anim.blinkT = 0.15;
    anim.earPhase = 1;
    anim.earFlick = 2.5;
  }

  return { root, update, excite, headPivot };
}
