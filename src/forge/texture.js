// ─────────────────────────────────────────────────────────────
// forge/texture — the PBR baker.
//
// Every surface in the room is authored as a shading function
//   shade(u, v, out) -> out = [height, r, g, b, roughness, metalness]
// and baked into a full map set: albedo (sRGB), roughness, metalness,
// tangent-space normal (Sobel from the height field) and a cavity AO map.
//
// Nothing here is downloaded. The whole room is ~14 shading functions.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

const _canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

function imageDataToTexture(id, { srgb = false, repeat = [1, 1], aniso = 8 } = {}) {
  const c = _canvas(id.width, id.height);
  c.getContext('2d').putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Separable box blur over a Float32 height field (for cavity AO). */
function blur(src, size, radius) {
  const tmp = new Float32Array(size * size);
  const dst = new Float32Array(size * size);
  const k = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += src[y * size + ((i % size) + size) % size];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / k;
      const outIdx = ((x - radius) % size + size) % size;
      const inIdx = ((x + radius + 1) % size + size) % size;
      sum += src[y * size + inIdx] - src[y * size + outIdx];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += tmp[(((i % size) + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      dst[y * size + x] = sum / k;
      const outIdx = ((y - radius) % size + size) % size;
      const inIdx = ((y + radius + 1) % size + size) % size;
      sum += tmp[inIdx * size + x] - tmp[outIdx * size + x];
    }
  }
  return dst;
}

/**
 * Bake a material.
 * @param {object} o
 * @param {number} o.size        map resolution (square, power of two)
 * @param {function} o.shade     (u,v,out) => void ; out=[h,r,g,b,rough,metal]
 * @param {number} o.normalScale height→normal strength
 * @param {number} o.ao          cavity AO strength (0 disables the map)
 * @param {number[]} o.repeat    texture repeat
 * @returns {{map,normalMap,roughnessMap,metalnessMap,aoMap,height}}
 */
export function bake({
  size = 512, shade, normalScale = 1.0, ao = 0.55, aoRadius = 6,
  repeat = [1, 1], metal = false, aniso = 8,
}) {
  const N = size * size;
  const height = new Float32Array(N);
  const albedo = new ImageData(size, size);
  const rough = new ImageData(size, size);
  const metalMap = metal ? new ImageData(size, size) : null;
  const out = new Float32Array(6);
  const A = albedo.data, R = rough.data, M = metalMap && metalMap.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      out[0] = 0.5; out[1] = 0.5; out[2] = 0.5; out[3] = 0.5; out[4] = 0.7; out[5] = 0;
      shade(u, v, out);
      const i = y * size + x, p = i * 4;
      height[i] = out[0];
      A[p] = out[1] * 255; A[p + 1] = out[2] * 255; A[p + 2] = out[3] * 255; A[p + 3] = 255;
      const rr = out[4] * 255;
      R[p] = rr; R[p + 1] = rr; R[p + 2] = rr; R[p + 3] = 255;
      if (M) { const mm = out[5] * 255; M[p] = mm; M[p + 1] = mm; M[p + 2] = mm; M[p + 3] = 255; }
    }
  }

  // ── tangent-space normal from the height field (Sobel, wrapping)
  const normal = new ImageData(size, size);
  const NRM = normal.data;
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const sc = normalScale * size / 512;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * sc, ny = dy * sc, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const p = (y * size + x) * 4;
      NRM[p] = (nx * 0.5 + 0.5) * 255;
      NRM[p + 1] = (ny * 0.5 + 0.5) * 255;
      NRM[p + 2] = (nz * 0.5 + 0.5) * 255;
      NRM[p + 3] = 255;
    }
  }

  // ── cavity AO: height minus its own low-pass = concavity
  let aoTex = null;
  if (ao > 0) {
    const lp = blur(height, size, aoRadius);
    const aoImg = new ImageData(size, size);
    const AO = aoImg.data;
    for (let i = 0; i < N; i++) {
      const c = (height[i] - lp[i]) * 3.0;
      const val = Math.max(0, Math.min(1, 1 + Math.min(0, c) * ao * 2));
      const p = i * 4;
      const g = val * 255;
      AO[p] = g; AO[p + 1] = g; AO[p + 2] = g; AO[p + 3] = 255;
    }
    aoTex = imageDataToTexture(aoImg, { repeat, aniso });
  }

  return {
    map: imageDataToTexture(albedo, { srgb: true, repeat, aniso }),
    roughnessMap: imageDataToTexture(rough, { repeat, aniso }),
    metalnessMap: metalMap ? imageDataToTexture(metalMap, { repeat, aniso }) : null,
    normalMap: imageDataToTexture(normal, { repeat, aniso }),
    aoMap: aoTex,
    height,
  };
}

/** Direct 2D-canvas texture — posters, labels, keycap legends, book spines. */
export function draw(w, h, fn, { srgb = true, repeat = [1, 1], aniso = 8, smooth = true } = {}) {
  const c = _canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = smooth;
  fn(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  t.userData.canvas = c;
  return t;
}

/** Small helper: hsl → linear-ish rgb triple in 0..1 for shading callbacks. */
export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

/** Radial gradient sprite used for lamp glow / dust motes / bloom sprites. */
export function glowSprite(size = 128, color = '#ffd9a0', power = 2.2) {
  return draw(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const cx = w / 2, cy = h / 2;
    const col = new THREE.Color(color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - r, power);
      const p = (y * w + x) * 4;
      d[p] = col.r * 255; d[p + 1] = col.g * 255; d[p + 2] = col.b * 255; d[p + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
