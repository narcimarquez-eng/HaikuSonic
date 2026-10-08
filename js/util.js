// Utilidades compartidas: aleatoriedad reproducible, ruido y matemáticas básicas

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const approach = (v, target, maxDelta) => (v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target));
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Elige una clave según sus pesos
export function pickWeighted(weights, rng) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

const hash2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

// Ruido de valor con periodo (px, py celdas): sirve para texturas que se repiten sin costuras
export function vnoise(x, y, px, py = px) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const mx = (k) => ((k % px) + px) % px;
  const my = (k) => ((k % py) + py) % py;
  const a = hash2(mx(ix), my(iy)), b = hash2(mx(ix + 1), my(iy));
  const c = hash2(mx(ix), my(iy + 1)), d = hash2(mx(ix + 1), my(iy + 1));
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// fbm en [0, 1] con periodo 'period' celdas por tile (usa octavas de frecuencia doble)
export function fbm(x, y, period, oct = 4) {
  let a = 0.5, f = 1, s = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x * f, y * f, period * f, period * f);
    norm += a; a *= 0.5; f *= 2;
  }
  return s / norm;
}
