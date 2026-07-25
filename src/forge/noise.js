// ─────────────────────────────────────────────────────────────
// forge/noise — deterministic noise primitives for asset baking
// Everything is seeded so a build is byte-identical every run.
// ─────────────────────────────────────────────────────────────

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F = (t) => t * t * t * (t * (t * 6 - 15) + 10); // quintic fade
const lerp = (a, b, t) => a + (b - a) * t;
export { lerp };

// 2D value-gradient hybrid noise on a permuted lattice
export class Noise2D {
  constructor(seed = 1337) {
    const rnd = mulberry32(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x * 1.4142;
      case 5: return -x * 1.4142;
      case 6: return y * 1.4142;
      default: return -y * 1.4142;
    }
  }
  // returns [-1,1]
  n(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = F(xf), v = F(yf);
    const p = this.p;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
    const x2 = lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }
  // fractal brownian motion, returns [-1,1]
  fbm(x, y, octaves = 5, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += a * this.n(x * f, y * f);
      norm += a; a *= gain; f *= lac;
    }
    return sum / norm;
  }
  // ridged multifractal — good for wood grain + fibrous cloth
  ridged(x, y, octaves = 4, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += a * (1 - Math.abs(this.n(x * f, y * f)));
      norm += a; a *= gain; f *= lac;
    }
    return sum / norm;
  }
  // tileable fbm: blends 4 shifted samples so the map wraps seamlessly
  tfbm(x, y, w, h, octaves = 5) {
    const a = this.fbm(x, y, octaves);
    const b = this.fbm(x - w, y, octaves);
    const c = this.fbm(x, y - h, octaves);
    const d = this.fbm(x - w, y - h, octaves);
    const u = x / w, v = y / h;
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
}

// Worley / cellular — used for carpet fibre clumps and speaker grille dust
export class Worley {
  constructor(seed = 7, density = 16) {
    this.d = density;
    const rnd = mulberry32(seed);
    this.pts = new Float32Array(density * density * 2);
    for (let i = 0; i < density * density; i++) {
      this.pts[i * 2] = rnd();
      this.pts[i * 2 + 1] = rnd();
    }
  }
  // returns distance to nearest feature point, roughly [0,1]
  f1(x, y) {
    const d = this.d;
    const cx = Math.floor(x * d), cy = Math.floor(y * d);
    let best = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = ((cx + ox) % d + d) % d, gy = ((cy + oy) % d + d) % d;
        const i = (gy * d + gx) * 2;
        const px = (cx + ox + this.pts[i]) / d;
        const py = (cy + oy + this.pts[i + 1]) / d;
        const dx = px - x, dy = py - y;
        const dist = dx * dx + dy * dy;
        if (dist < best) best = dist;
      }
    }
    return Math.min(1, Math.sqrt(best) * d);
  }
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const mix = lerp;
