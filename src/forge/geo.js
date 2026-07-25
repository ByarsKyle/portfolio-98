// ─────────────────────────────────────────────────────────────
// forge/geo — geometry constructors used by every asset.
// Rounded/bevelled primitives, lathes, lofts, cloth relaxation.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

export { mergeGeometries };

/**
 * Rounded box built by pushing a subdivided cube out to a rounded-cube SDF.
 * Real bevels catch specular highlights — this is what sells "not a Three.js
 * BoxGeometry" more than anything else in the scene.
 */
export function roundedBox(w, h, d, r = 0.02, seg = 3) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = Math.max(-hw, Math.min(hw, v.x));
    const cy = Math.max(-hh, Math.min(hh, v.y));
    const cz = Math.max(-hd, Math.min(hd, v.z));
    const dx = v.x - cx, dy = v.y - cy, dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-6) {
      const s = r / len;
      pos.setXYZ(i, cx + dx * s, cy + dy * s, cz + dz * s);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Box with only the top edges rounded (desk tops, shelves, plinths). */
export function slab(w, h, d, r = 0.01) {
  const g = roundedBox(w, h, d, r, 2);
  return g;
}

/** Lathe a 2D profile around Y. profile = [[x,y], ...] bottom→top. */
export function lathe(profile, segments = 48, phiLength = Math.PI * 2) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y));
  const g = new THREE.LatheGeometry(pts, segments, 0, phiLength);
  g.computeVertexNormals();
  return g;
}

/** Extrude a 2D shape with bevel — picture frames, keycaps, cabinet fronts. */
export function extrude(shapePts, depth, bevel = 0.004, curveSeg = 6) {
  const shape = new THREE.Shape();
  shape.moveTo(shapePts[0][0], shapePts[0][1]);
  for (let i = 1; i < shapePts.length; i++) shape.lineTo(shapePts[i][0], shapePts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelSegments: 2, curveSegments: curveSeg,
  });
  g.center();
  g.computeVertexNormals();
  return g;
}

/** Rounded-rectangle shape points (for extrude). */
export function roundRectPts(w, h, r, seg = 6) {
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2],
                   [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, -Math.PI / 2]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/**
 * Capsule-ish tapered tube through a list of [x,y,z,radius] control points.
 * Catmull-Rom through the spine; radius lerps. Every organic part of the pug
 * (legs, tail, muzzle, ears) is one of these.
 */
export function tube(points, radialSeg = 12, tubularSeg = 40, capped = true) {
  const spine = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const radii = points.map((p) => p[3]);
  const curve = new THREE.CatmullRomCurve3(spine, false, 'centripetal', 0.5);
  const g = new THREE.TubeGeometry(curve, tubularSeg, 1, radialSeg, false);
  // re-radius: TubeGeometry bakes radius 1, so push verts back along the normal
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const seg = Math.floor(i / (radialSeg + 1));
    const t = seg / tubularSeg;
    const fi = t * (radii.length - 1);
    const i0 = Math.min(radii.length - 1, Math.floor(fi));
    const i1 = Math.min(radii.length - 1, i0 + 1);
    const r = radii[i0] + (radii[i1] - radii[i0]) * (fi - i0);
    v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const center = v.clone().sub(n); // radius was 1
    v.copy(center).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  if (!capped) return g;
  const caps = [g];
  const capAt = (idx, flip) => {
    const p = spine[idx], r = radii[idx];
    const s = new THREE.SphereGeometry(r, radialSeg, 8);
    s.translate(p.x, p.y, p.z);
    return s;
  };
  caps.push(capAt(0), capAt(spine.length - 1));
  const merged = mergeGeometries(caps.map((x) => x.toNonIndexed()));
  caps.forEach((c, i) => i > 0 && c.dispose());
  merged.computeVertexNormals();
  return merged;
}

/**
 * Metaball-free organic blob: a sphere deformed by weighted ellipsoid pulls.
 * Used for the pug's head/body so the silhouette isn't obviously "spheres".
 */
export function blob(radius, detail, deformers, seed = 3) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const rnd = mulberry32(seed);
  const jitter = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) jitter[i] = (rnd() - 0.5) * 2;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    let scale = 1;
    for (const d of deformers) {
      // d = {dir:[x,y,z], amount, falloff}
      const dd = new THREE.Vector3(...d.dir).normalize();
      const dot = Math.max(0, dir.dot(dd));
      scale += d.amount * Math.pow(dot, d.falloff ?? 2);
    }
    v.copy(dir).multiplyScalar(radius * scale + jitter[i] * (radius * 0.004));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Cloth relaxation over a grid — duvets, pillows, curtains, the rug.
 * Verlet-ish: pull toward a target surface, keep edge lengths, settle under
 * gravity around collider spheres. A few hundred iterations at bake time gives
 * folds that no amount of normal-mapping can fake.
 */
export function cloth({ w, d, segW = 40, segD = 40, y = 0, gravity = 0.0016,
                        colliders = [], pins = () => false, iterations = 220,
                        stiffness = 0.9, seed = 11, drape = 0.0 }) {
  const nx = segW + 1, nz = segD + 1;
  const P = new Float32Array(nx * nz * 3);
  const prev = new Float32Array(nx * nz * 3);
  const pinned = new Uint8Array(nx * nz);
  const rnd = mulberry32(seed);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      const u = i / segW, v = j / segD;
      P[k] = (u - 0.5) * w;
      P[k + 1] = y + drape * Math.sin(u * Math.PI) * Math.sin(v * Math.PI) + (rnd() - 0.5) * 0.002;
      P[k + 2] = (v - 0.5) * d;
      prev[k] = P[k]; prev[k + 1] = P[k + 1]; prev[k + 2] = P[k + 2];
      pinned[j * nx + i] = pins(u, v) ? 1 : 0;
    }
  }
  const restX = w / segW, restZ = d / segD;
  const solveLink = (a, b, rest) => {
    const ka = a * 3, kb = b * 3;
    const dx = P[kb] - P[ka], dy = P[kb + 1] - P[ka + 1], dz = P[kb + 2] - P[ka + 2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const diff = ((len - rest) / len) * 0.5 * stiffness;
    const ox = dx * diff, oy = dy * diff, oz = dz * diff;
    if (!pinned[a]) { P[ka] += ox; P[ka + 1] += oy; P[ka + 2] += oz; }
    if (!pinned[b]) { P[kb] -= ox; P[kb + 1] -= oy; P[kb + 2] -= oz; }
  };
  for (let it = 0; it < iterations; it++) {
    for (let n = 0; n < nx * nz; n++) {
      if (pinned[n]) continue;
      const k = n * 3;
      const vx = (P[k] - prev[k]) * 0.94, vy = (P[k + 1] - prev[k + 1]) * 0.94, vz = (P[k + 2] - prev[k + 2]) * 0.94;
      prev[k] = P[k]; prev[k + 1] = P[k + 1]; prev[k + 2] = P[k + 2];
      P[k] += vx; P[k + 1] += vy - gravity; P[k + 2] += vz;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const n = j * nx + i;
      if (i < nx - 1) solveLink(n, n + 1, restX);
      if (j < nz - 1) solveLink(n, n + nx, restZ);
      if (i < nx - 2) solveLink(n, n + 2, restX * 2);   // bend
      if (j < nz - 2) solveLink(n, n + nx * 2, restZ * 2);
    }
    for (let n = 0; n < nx * nz; n++) {
      if (pinned[n]) continue;
      const k = n * 3;
      for (const c of colliders) {
        if (c.type === 'plane') {
          if (P[k + 1] < c.y) P[k + 1] = c.y;
        } else if (c.type === 'sphere') {
          const dx = P[k] - c.x, dy = P[k + 1] - c.y, dz = P[k + 2] - c.z;
          const len = Math.hypot(dx, dy, dz);
          if (len < c.r && len > 1e-6) {
            const s = c.r / len;
            P[k] = c.x + dx * s; P[k + 1] = c.y + dy * s; P[k + 2] = c.z + dz * s;
          }
        } else if (c.type === 'box') {
          // push out of an AABB along the shortest axis
          if (P[k] > c.x0 && P[k] < c.x1 && P[k + 1] > c.y0 && P[k + 1] < c.y1 && P[k + 2] > c.z0 && P[k + 2] < c.z1) {
            const dTop = c.y1 - P[k + 1], dxa = P[k] - c.x0, dxb = c.x1 - P[k];
            const dza = P[k + 2] - c.z0, dzb = c.z1 - P[k + 2];
            const m = Math.min(dTop, dxa, dxb, dza, dzb);
            if (m === dTop) P[k + 1] = c.y1;
            else if (m === dxa) P[k] = c.x0; else if (m === dxb) P[k] = c.x1;
            else if (m === dza) P[k + 2] = c.z0; else P[k + 2] = c.z1;
          }
        }
      }
    }
  }
  // build geometry (two-sided-ready, with UVs)
  const g = new THREE.BufferGeometry();
  const verts = [], uvs = [], idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    verts.push(P[k], P[k + 1], P[k + 2]);
    uvs.push(i / segW, j / segD);
  }
  for (let j = 0; j < segD; j++) for (let i = 0; i < segW; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, dd = c + 1;
    idx.push(a, c, b, b, c, dd);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Wire/cable that hangs in a catenary between two points, with sag + slack. */
export function cable(a, b, sag = 0.25, r = 0.006, seg = 40, wobble = 0.02, seed = 5) {
  const rnd = mulberry32(seed);
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = A.clone().lerp(B, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    p.x += (rnd() - 0.5) * wobble * Math.sin(t * Math.PI);
    p.z += (rnd() - 0.5) * wobble * Math.sin(t * Math.PI);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, seg * 2, r, 8, false);
}

/** Uniformly scatter N transforms on a disc — plant leaves, rug fringe. */
export function scatter(n, radius, seed = 2) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a, t: rnd() });
  }
  return out;
}

/** Add a second UV set (uv2) required for aoMap / lightMap. */
export function withUV2(g) {
  if (g.attributes.uv && !g.attributes.uv2) {
    g.setAttribute('uv2', new THREE.BufferAttribute(g.attributes.uv.array, 2));
  }
  return g;
}
