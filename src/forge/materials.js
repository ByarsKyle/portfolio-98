// ─────────────────────────────────────────────────────────────
// forge/materials — the room's entire surface library.
// Each entry is a shading function fed to the baker in texture.js.
// Baked lazily, cached, and shared across every mesh that uses it.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bake } from './texture.js';
import { Noise2D, Worley, clamp, smoothstep, mix, mulberry32 } from './noise.js';

const N = {
  wood: new Noise2D(101), grain: new Noise2D(202), wall: new Noise2D(303),
  cloth: new Noise2D(404), plastic: new Noise2D(505), metal: new Noise2D(606),
  dust: new Noise2D(707), rug: new Noise2D(808), leather: new Noise2D(909),
};
const W = { carpet: new Worley(21, 42), leather: new Worley(33, 26), grille: new Worley(44, 60) };

// ── shading functions ────────────────────────────────────────

/** Tongue-and-groove oak planks. Rings, rays, pores, per-plank tint + wear. */
function oakFloor(u, v, out) {
  const PLANKS = 7;          // across V
  const row = v * PLANKS;
  const pi = Math.floor(row);
  let pv = row - pi;
  // stagger plank ends per row
  const stagger = ((pi * 0.37) % 1);
  const su = (u + stagger) % 1;
  const LEN = 2.2;           // plank length in U
  const bi = Math.floor(su * LEN);
  let bu = su * LEN - bi;
  const rnd = mulberry32(pi * 91 + bi * 7919);
  const seedA = rnd(), seedB = rnd(), seedC = rnd();

  // grain: stretched rings running along the plank
  const gx = (su * 12 + seedA * 30);
  const gy = (pv * 2.4 + seedB * 40);
  const rings = N.wood.ridged(gx * 0.55, gy * 7.5, 4);
  const flow = N.grain.fbm(gx * 0.8, gy * 2.0, 3) * 0.35;
  let grain = N.wood.ridged(gx * 0.5 + flow * 3, gy * 9.0, 3);
  grain = Math.pow(clamp(grain), 1.7);
  const fineFibre = N.grain.fbm(su * 900, pv * 60, 2) * 0.5 + 0.5;

  // seams between planks (both axes)
  const seamV = Math.min(pv, 1 - pv);
  const seamU = Math.min(bu, 1 - bu);
  const gap = smoothstep(0.0, 0.012, seamV) * smoothstep(0.0, 0.006, seamU);
  const bevel = smoothstep(0.0, 0.05, seamV) * smoothstep(0.0, 0.02, seamU);

  let h = 0.5 + grain * 0.06 + rings * 0.03 - (1 - gap) * 0.55 - (1 - bevel) * 0.05;
  h += (fineFibre - 0.5) * 0.02;

  // colour: warm honey oak, per-plank hue drift
  const tint = seedC * 0.22 - 0.11;
  const dark = grain * 0.42 + rings * 0.1;
  let r = 0.52 - dark * 0.30 + tint * 0.08;
  let g = 0.355 - dark * 0.26 + tint * 0.05;
  let b = 0.205 - dark * 0.17 + tint * 0.02;

  // traffic wear: a lighter, scuffed path through the middle of the room
  const wear = smoothstep(0.35, 0.0, Math.abs(v - 0.55)) * (N.dust.fbm(u * 4, v * 4, 3) * 0.5 + 0.5);
  r = mix(r, r * 1.14 + 0.03, wear * 0.5);
  g = mix(g, g * 1.14 + 0.03, wear * 0.5);
  b = mix(b, b * 1.10 + 0.03, wear * 0.5);

  const gapDark = 1 - (1 - gap) * 0.85;
  r *= gapDark; g *= gapDark; b *= gapDark;

  // satin varnish: rougher where worn, glossier in the grain valleys
  out[0] = h;
  out[1] = r; out[2] = g; out[3] = b;
  out[4] = clamp(0.34 + grain * 0.16 + wear * 0.22 + (1 - gap) * 0.35);
}

/** Painted plaster: orange-peel roll texture, faint trowel waves, scuffs. */
function plaster(u, v, out) {
  const peel = N.wall.fbm(u * 260, v * 260, 3) * 0.5 + 0.5;
  const roll = N.wall.fbm(u * 55, v * 55, 4) * 0.5 + 0.5;
  const wave = N.wall.fbm(u * 6, v * 6, 3) * 0.5 + 0.5;
  const h = 0.5 + (peel - 0.5) * 0.10 + (roll - 0.5) * 0.16 + (wave - 0.5) * 0.05;
  // warm off-white with a hint of clay
  const shade = 0.80 + (roll - 0.5) * 0.05 + (wave - 0.5) * 0.06;
  out[0] = h;
  out[1] = shade * 0.895; out[2] = shade * 0.855; out[3] = shade * 0.790;
  out[4] = clamp(0.86 + (peel - 0.5) * 0.10);
}

/** Dark walnut — desk top, bed frame, shelf. Tight ribbon grain + open pores. */
function walnut(u, v, out) {
  const gx = u * 6, gy = v * 1.2;
  const flow = N.grain.fbm(gx * 0.6, gy * 1.4, 3) * 0.5;
  let grain = N.wood.ridged(gx * 0.9 + flow * 2.2, gy * 16, 4);
  grain = Math.pow(clamp(grain), 1.5);
  const rings = N.wood.fbm(gx * 0.4, gy * 9, 3) * 0.5 + 0.5;
  // open pores: short dashes following the grain
  const pore = clamp(N.grain.ridged(u * 700, v * 90, 2) * 1.5 - 0.72) * 2.4;
  const fig = N.wood.fbm(gx * 2.5, gy * 30, 2) * 0.5 + 0.5;

  const h = 0.55 + grain * 0.05 + (rings - 0.5) * 0.03 - pore * 0.16 + (fig - 0.5) * 0.015;
  const d = grain * 0.5 + (1 - rings) * 0.18;
  let r = 0.225 - d * 0.13, g = 0.140 - d * 0.085, b = 0.098 - d * 0.062;
  r *= 1 - pore * 0.35; g *= 1 - pore * 0.35; b *= 1 - pore * 0.35;
  out[0] = h;
  out[1] = r; out[2] = g; out[3] = b;
  out[4] = clamp(0.30 + pore * 0.45 + grain * 0.12);   // pores kill the sheen
}

/** Pine — cheap bed slats, shelf brackets, back panels. */
function pine(u, v, out) {
  const gx = u * 5, gy = v * 1.0;
  let grain = N.wood.ridged(gx * 0.8, gy * 20, 3);
  grain = Math.pow(clamp(grain), 2.0);
  const knotD = Math.hypot((u % 0.5) - 0.25, (v % 0.7) - 0.35);
  const knot = smoothstep(0.06, 0.0, knotD);
  const h = 0.55 + grain * 0.05 - knot * 0.08;
  const d = grain * 0.35 + knot * 0.5;
  out[0] = h;
  out[1] = 0.70 - d * 0.34; out[2] = 0.565 - d * 0.30; out[3] = 0.385 - d * 0.24;
  out[4] = clamp(0.62 + grain * 0.14);
}

/** Quilted duvet cover — cotton weave + diamond stitch channels. */
function duvet(u, v, out) {
  // twill weave at high frequency
  const wx = u * 620, wy = v * 620;
  const weave = Math.sin(wx * Math.PI * 2) * Math.sin(wy * Math.PI * 2);
  const thread = (Math.sin(wx * Math.PI * 2) + Math.sin(wy * Math.PI * 2 + 1.2)) * 0.25;
  // diamond quilting
  const q = 9;
  const dq = Math.abs(((u * q + v * q) % 1) - 0.5) + Math.abs(((u * q - v * q) % 1) - 0.5);
  const stitch = smoothstep(0.30, 0.05, dq);
  const puff = smoothstep(0.05, 0.55, dq);
  const fuzz = N.cloth.fbm(u * 400, v * 400, 3) * 0.5 + 0.5;

  const h = 0.5 + puff * 0.20 - stitch * 0.30 + weave * 0.02 + (fuzz - 0.5) * 0.05 + thread * 0.02;
  // deep teal-slate, the kind of duvet cover that hides everything
  const shade = 0.85 + puff * 0.16 - stitch * 0.22 + (fuzz - 0.5) * 0.10;
  out[0] = h;
  out[1] = 0.255 * shade; out[2] = 0.345 * shade; out[3] = 0.395 * shade;
  out[4] = clamp(0.90 - puff * 0.05 + (fuzz - 0.5) * 0.06);
}

/** Pillow / sheet cotton — plain weave, slightly warm white. */
function cotton(u, v, out) {
  const wx = u * 700, wy = v * 700;
  const weave = Math.sin(wx * Math.PI * 2) * Math.sin(wy * Math.PI * 2);
  const slub = N.cloth.fbm(u * 130, v * 130, 3) * 0.5 + 0.5;
  const wrinkle = N.cloth.fbm(u * 9, v * 14, 4) * 0.5 + 0.5;
  const h = 0.5 + weave * 0.05 + (slub - 0.5) * 0.10 + (wrinkle - 0.5) * 0.22;
  const shade = 0.92 + (wrinkle - 0.5) * 0.10 + (slub - 0.5) * 0.05;
  out[0] = h;
  out[1] = shade * 0.95; out[2] = shade * 0.925; out[3] = shade * 0.875;
  out[4] = clamp(0.88 + (slub - 0.5) * 0.08);
}

/** Cut-pile rug — worley fibre clumps + a woven kilim pattern. */
function rug(u, v, out) {
  const fibre = W.carpet.f1(u, v);
  const micro = N.rug.fbm(u * 900, v * 900, 2) * 0.5 + 0.5;
  const clump = N.rug.fbm(u * 90, v * 90, 3) * 0.5 + 0.5;
  const h = 0.5 + (1 - fibre) * 0.22 + (micro - 0.5) * 0.18 + (clump - 0.5) * 0.10;

  // pattern: bordered field with stacked diamonds
  const bx = Math.min(u, 1 - u), by = Math.min(v, 1 - v);
  const border = Math.min(bx, by);
  const inBorder = border < 0.09;
  const stripe = border < 0.055 && border > 0.035;
  const dx = Math.abs(((u * 5) % 1) - 0.5), dy = Math.abs(((v * 3) % 1) - 0.5);
  const diamond = (dx + dy) < 0.42;
  const diamondIn = (dx + dy) < 0.24;

  // warm rust / cream / deep indigo
  let c;
  if (stripe) c = [0.62, 0.44, 0.22];
  else if (inBorder) c = [0.30, 0.14, 0.13];
  else if (diamondIn) c = [0.68, 0.55, 0.36];
  else if (diamond) c = [0.44, 0.19, 0.16];
  else c = [0.235, 0.135, 0.145];

  const shade = 0.82 + (1 - fibre) * 0.32 + (clump - 0.5) * 0.16;
  out[0] = h;
  out[1] = c[0] * shade; out[2] = c[1] * shade; out[3] = c[2] * shade;
  out[4] = clamp(0.94 + (micro - 0.5) * 0.05);
}

/** Aged beige computer plastic — pebbled grain, UV yellowing, edge scuffs. */
function beigePlastic(u, v, out) {
  // Injection-moulded ABS: a fine even pebble grain, not a wood grain. The
  // texture has to stay quiet — it is read from 30 cm away.
  const pebble = W.leather.f1(u * 11, v * 11);
  const micro = N.plastic.fbm(u * 620, v * 620, 2) * 0.5 + 0.5;
  const yellowing = N.plastic.fbm(u * 2.2, v * 2.2, 3) * 0.5 + 0.5;
  const scuff = clamp(N.plastic.ridged(u * 160, v * 34, 2) * 1.4 - 0.92) * 3;
  const h = 0.5 + (1 - pebble) * 0.030 + (micro - 0.5) * 0.020 - scuff * 0.018;

  // base putty, drifting toward nicotine-yellow in broad patches
  const y = yellowing * 0.5 + 0.5;
  let r = 0.672 + y * 0.038;
  let g = 0.624 + y * 0.028;
  let b = 0.516 + y * 0.006;
  const dirt = smoothstep(0.68, 1.0, N.dust.fbm(u * 6, v * 6, 3) * 0.5 + 0.5) * 0.05;
  r -= dirt; g -= dirt * 1.05; b -= dirt * 1.1;
  r += scuff * 0.010; g += scuff * 0.010; b += scuff * 0.008;

  out[0] = h;
  out[1] = r; out[2] = g; out[3] = b;
  out[4] = clamp(0.55 + (1 - pebble) * 0.10 + scuff * 0.12 + (micro - 0.5) * 0.05);
}

/** Black textured ABS — keyboard, tower bezel, speaker boxes. */
function darkPlastic(u, v, out) {
  const pebble = W.leather.f1(u * 4, v * 4);
  const micro = N.plastic.fbm(u * 800, v * 800, 2) * 0.5 + 0.5;
  const sheenVar = N.plastic.fbm(u * 20, v * 20, 3) * 0.5 + 0.5;
  const h = 0.5 + (1 - pebble) * 0.12 + (micro - 0.5) * 0.05;
  const base = 0.052 + (1 - pebble) * 0.022 + (micro - 0.5) * 0.012;
  // finger grease builds a glossy sheen on high-touch areas
  const grease = smoothstep(0.65, 1.0, sheenVar);
  out[0] = h;
  out[1] = base; out[2] = base * 1.01; out[3] = base * 1.06;
  out[4] = clamp(0.62 + (1 - pebble) * 0.16 - grease * 0.30);
}

/** Brushed / powder-coated steel — PC chassis, lamp arm, bed legs. */
function steel(u, v, out) {
  const brush = N.metal.fbm(u * 1400, v * 22, 3) * 0.5 + 0.5;
  const macro = N.metal.fbm(u * 30, v * 30, 3) * 0.5 + 0.5;
  const scratch = clamp(N.metal.ridged(u * 900, v * 12, 2) * 1.4 - 0.9) * 4;
  const h = 0.5 + (brush - 0.5) * 0.10 + scratch * 0.04;
  const shade = 0.46 + (brush - 0.5) * 0.12 + (macro - 0.5) * 0.06 + scratch * 0.15;
  out[0] = h;
  out[1] = shade * 0.98; out[2] = shade * 0.99; out[3] = shade * 1.0;
  out[4] = clamp(0.36 + (brush - 0.5) * 0.22 - scratch * 0.15);
  out[5] = 0.92;
}

/** Glazed ceramic — mug, plant pot. Slight orange-peel in the glaze. */
function ceramic(u, v, out) {
  const peel = N.wall.fbm(u * 180, v * 180, 3) * 0.5 + 0.5;
  const crackle = clamp(N.wall.ridged(u * 60, v * 60, 3) * 1.3 - 0.92) * 6;
  const h = 0.5 + (peel - 0.5) * 0.05 - crackle * 0.06;
  const shade = 0.9 + (peel - 0.5) * 0.04;
  out[0] = h;
  out[1] = 0.72 * shade - crackle * 0.1;
  out[2] = 0.30 * shade - crackle * 0.05;
  out[3] = 0.24 * shade - crackle * 0.04;
  out[4] = clamp(0.13 + crackle * 0.5 + (peel - 0.5) * 0.06);
}

/** Worn chair leather / vinyl — creased hide with a polished crown. */
function leather(u, v, out) {
  const cell = W.leather.f1(u * 2.2, v * 2.2);
  const micro = N.leather.fbm(u * 500, v * 500, 3) * 0.5 + 0.5;
  const crease = clamp(N.leather.ridged(u * 14, v * 9, 3) * 1.25 - 0.55) * 2.2;
  const h = 0.5 + (1 - cell) * 0.16 + (micro - 0.5) * 0.08 - crease * 0.22;
  const d = crease * 0.5 + (1 - cell) * 0.15;
  out[0] = h;
  out[1] = 0.115 - d * 0.05; out[2] = 0.085 - d * 0.04; out[3] = 0.075 - d * 0.035;
  out[4] = clamp(0.55 + crease * 0.25 + (1 - cell) * 0.12);
}

/** Linen curtain — loose open weave, light passes through it. */
function linen(u, v, out) {
  const wx = u * 300, wy = v * 300;
  const warp = Math.sin(wx * Math.PI * 2) * 0.5 + 0.5;
  const weft = Math.sin(wy * Math.PI * 2) * 0.5 + 0.5;
  const weave = Math.max(warp, weft);
  const slub = N.cloth.fbm(u * 60, v * 200, 3) * 0.5 + 0.5;
  const h = 0.5 + (weave - 0.5) * 0.16 + (slub - 0.5) * 0.14;
  const shade = 0.86 + (weave - 0.5) * 0.10 + (slub - 0.5) * 0.10;
  out[0] = h;
  out[1] = 0.88 * shade; out[2] = 0.845 * shade; out[3] = 0.760 * shade;
  out[4] = clamp(0.92 + (slub - 0.5) * 0.06);
}

/** Paper — posters, notes, book pages. Fibre tooth + faint age. */
function paper(u, v, out) {
  const fibre = N.cloth.fbm(u * 600, v * 600, 3) * 0.5 + 0.5;
  const age = N.dust.fbm(u * 4, v * 4, 3) * 0.5 + 0.5;
  const h = 0.5 + (fibre - 0.5) * 0.10;
  const shade = 0.93 + (fibre - 0.5) * 0.06 - age * 0.06;
  out[0] = h;
  out[1] = shade; out[2] = shade * 0.975; out[3] = shade * 0.925;
  out[4] = clamp(0.90 + (fibre - 0.5) * 0.06);
}

/** Speaker-grille cloth / dust-mesh — dense perforation. */
function grilleCloth(u, v, out) {
  const holes = W.grille.f1(u, v);
  const punch = smoothstep(0.45, 0.15, holes);
  const h = 0.5 - punch * 0.5;
  const base = 0.045 + (1 - punch) * 0.03;
  out[0] = h;
  out[1] = base; out[2] = base; out[3] = base * 1.05;
  out[4] = clamp(0.85 - punch * 0.1);
}

// ── registry ─────────────────────────────────────────────────

// normalScale here is the Sobel gain used when converting each height field to
// a tangent-space normal. These are deliberately restrained: at the distances
// you actually view this room from, anything above ~1.0 stops reading as
// surface finish and starts reading as crumpled foil.
export const RECIPES = {
  oakFloor:   { shade: oakFloor,     size: 1024, normalScale: 1.05, ao: 0.7,  repeat: [3, 3],   roughness: 1, metalness: 0.02, color: 0xffffff },
  plaster:    { shade: plaster,      size: 512,  normalScale: 0.42, ao: 0.30, repeat: [4, 3],   roughness: 1, metalness: 0.0 },
  walnut:     { shade: walnut,       size: 1024, normalScale: 0.62, ao: 0.55, repeat: [1, 1],   roughness: 1, metalness: 0.02 },
  pine:       { shade: pine,         size: 512,  normalScale: 0.60, ao: 0.4,  repeat: [1, 1],   roughness: 1 },
  duvet:      { shade: duvet,        size: 1024, normalScale: 1.30, ao: 0.8,  repeat: [2, 2],   roughness: 1 },
  cotton:     { shade: cotton,       size: 512,  normalScale: 0.85, ao: 0.5,  repeat: [2, 2],   roughness: 1 },
  rug:        { shade: rug,          size: 1024, normalScale: 1.25, ao: 0.75, repeat: [1, 1],   roughness: 1 },
  beige:      { shade: beigePlastic, size: 1024, normalScale: 0.22, ao: 0.35, repeat: [1, 1],   roughness: 1, metalness: 0.0 },
  darkPlastic:{ shade: darkPlastic,  size: 512,  normalScale: 0.30, ao: 0.35, repeat: [1, 1],   roughness: 1 },
  steel:      { shade: steel,        size: 512,  normalScale: 0.40, ao: 0.3,  repeat: [1, 1],   metal: true, roughness: 1, metalness: 1 },
  ceramic:    { shade: ceramic,      size: 512,  normalScale: 0.25, ao: 0.2,  repeat: [1, 1],   roughness: 1 },
  leather:    { shade: leather,      size: 512,  normalScale: 0.85, ao: 0.55, repeat: [1, 1],   roughness: 1 },
  linen:      { shade: linen,        size: 512,  normalScale: 0.80, ao: 0.4,  repeat: [3, 3],   roughness: 1 },
  paper:      { shade: paper,        size: 256,  normalScale: 0.35, ao: 0.2,  repeat: [1, 1],   roughness: 1 },
  grille:     { shade: grilleCloth,  size: 512,  normalScale: 0.75, ao: 0.5,  repeat: [4, 4],   roughness: 1 },
};

const cache = new Map();
// Baked map sets live here rather than on material.userData: Material.copy()
// deep-clones userData through JSON, so parking textures (and a megabyte of
// height field) there makes every .clone() serialise the lot to data URLs.
// That cost ~200 ms per material variant before this was moved out.
const bakedMaps = new WeakMap();

export function mapsFor(material) { return bakedMaps.get(material); }

/** Bake (or fetch) a material by recipe name. */
export function mat(name, overrides = {}) {
  if (!cache.has(name)) {
    const r = RECIPES[name];
    if (!r) throw new Error(`forge: no recipe "${name}"`);
    const maps = bake(r);
    const params = {
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: r.roughness ?? 1,
      metalness: r.metalness ?? 0,
      color: r.color ?? 0xffffff,
      aoMapIntensity: 1.0,
    };
    if (maps.metalnessMap) params.metalnessMap = maps.metalnessMap;
    if (maps.aoMap) params.aoMap = maps.aoMap;
    const m = new THREE.MeshStandardMaterial(params);
    m.normalScale.set(1, 1);
    bakedMaps.set(m, maps);
    cache.set(name, m);
  }
  const base = cache.get(name);
  if (!Object.keys(overrides).length) return base;
  // variants share the same textures but tweak colour/roughness/repeat
  const key = name + JSON.stringify(overrides);
  if (!cache.has(key)) {
    const c = base.clone();
    bakedMaps.set(c, bakedMaps.get(base));
    const { repeat, ...rest } = overrides;
    applyOverrides(c, rest);
    if (repeat) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (c[k]) { c[k] = c[k].clone(); c[k].repeat.set(repeat[0], repeat[1]); c[k].needsUpdate = true; }
      }
    }
    cache.set(key, c);
  }
  return cache.get(key);
}

/**
 * Assign override values onto a material *through* its existing objects.
 *
 * A plain Object.assign here is a trap: `{ color: 0xd8c8ac }` would replace the
 * THREE.Color instance with a Number, and the renderer's
 * `uniforms.diffuse.value.copy(material.color)` then reads .r/.g/.b off a
 * number and uploads NaN. Because materials sharing a feature set also share a
 * compiled program — and the renderer skips uniform uploads it believes are
 * already current — one NaN'd variant turns every surface using that program
 * black. Mutate in place instead.
 */
function applyOverrides(material, values) {
  for (const [key, value] of Object.entries(values)) {
    const current = material[key];
    if (current === undefined && !(key in material)) {
      material[key] = value;
      continue;
    }
    if (current && current.isColor) current.set(value);
    else if (current && current.isVector2 && Array.isArray(value)) current.set(value[0], value[1]);
    else if (current && current.isVector2 && typeof value === 'number') current.set(value, value);
    else material[key] = value;
  }
  material.needsUpdate = true;
  return material;
}

/** Bake everything with progress reporting (used by the loading screen). */
export async function bakeAll(onProgress) {
  const names = Object.keys(RECIPES);
  for (let i = 0; i < names.length; i++) {
    onProgress?.(i / names.length, names[i]);
    mat(names[i]);
    // yield so the loader can paint
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress?.(1, 'done');
}

export const MATERIAL_COUNT = Object.keys(RECIPES).length;
