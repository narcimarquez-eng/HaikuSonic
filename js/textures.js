// Texturas: imágenes reales (three.js examples, MIT) y procedurales (ruido fbm, canvas)
import * as THREE from 'three';
import { fbm, vnoise, clamp } from './util.js';

export const FILE = {};
const FILE_URLS = {
  grass: 'assets/textures/grass.jpg',
  wood: 'assets/textures/wood.jpg',
  brick: 'assets/textures/brick.jpg',
  floor: 'assets/textures/floor.jpg',
  waternormal: 'assets/textures/waternormal.jpg',
};

// Carga las imágenes reales; si alguna falla se usa la versión procedural
export async function loadFileTextures() {
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(FILE_URLS).map(async ([k, url]) => {
    try {
      const t = await loader.loadAsync(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      t.colorSpace = k === 'waternormal' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      FILE[k] = t;
    } catch (e) { /* sin imagen: se usa la procedural */ }
  }));
}

// Copia de una textura con otra repetición (comparte la imagen)
export function tiled(tex, rx, ry) { const t = tex.clone(); t.repeat.set(rx, ry); return t; }

function finish(t, srgb) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Textura por píxeles: fn(u, v) devuelve [r, g, b] (0-255) o [r, g, b, a] con opts.alpha
export function pixelTex(size, fn, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const col = fn(x / size, y / size);
      const k = 4 * (y * size + x);
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2];
      d[k + 3] = opts.alpha ? col[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  return finish(new THREE.CanvasTexture(c), true);
}

export function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return finish(new THREE.CanvasTexture(c), true);
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/* ---------- Procedurales por píxeles (sin costuras) ---------- */
const grassPix = (u, v) => {
  const n = fbm(u * 8, v * 8, 8, 4);
  const blade = vnoise(u * 96, v * 6, 96, 6);      // briznas verticales
  const fine = vnoise(u * 64, v * 64, 64, 64);
  const c = mix(rgb(0x2f7d2f), rgb(0x86c961), clamp(n * 1.3 - 0.1, 0, 1));
  const k = (blade - 0.5) * 70 + (fine - 0.5) * 30;
  return [c[0] + k * 0.5, c[1] + k, c[2] + k * 0.4];
};
const rockPix = (u, v) => {
  const n = fbm(u * 4, v * 4, 4, 5);
  const ridge = 1 - Math.abs(2 * vnoise(u * 8, v * 8, 8, 8) - 1);
  const crack = Math.pow(ridge, 10);
  const c = mix(rgb(0x6c675f), rgb(0xb4ac9b), n);
  const k = 1 - crack * 0.55;
  const g = (fbm(u * 16, v * 16, 16, 3) - 0.5) * 36;   // grano fino
  return [c[0] * k + g, c[1] * k + g, c[2] * k + g];
};
const dirtPix = (u, v) => {                            // tierra en cuadros tipo Green Hill
  const chk = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
  const n = fbm(u * 8, v * 8, 8, 4);
  const base = chk ? rgb(0xa86f3c) : rgb(0x7d4d26);
  const k = (n - 0.5) * 60;
  return [base[0] + k, base[1] + k * 0.8, base[2] + k * 0.5];
};
const concretePix = (u, v) => {
  const n = fbm(u * 8, v * 8, 8, 5);
  const p = vnoise(u * 64, v * 64, 64, 64);
  const c = mix(rgb(0x59626b), rgb(0x8d979f), n);
  const k = (p - 0.5) * 40;
  return [c[0] + k, c[1] + k, c[2] + k];
};
const steelPix = (u, v) => {
  const b = vnoise(u * 4, v * 240, 4, 240);          // acero cepillado
  const k = (b - 0.5) * 50;
  return [0x8c + k, 0x98 + k, 0xa2 + k];
};
const sandPix = (u, v) => {
  const r = 0.5 + 0.5 * Math.sin((v * 40 + fbm(u * 4, v * 4, 4, 3) * 3) * Math.PI * 2);
  const n = fbm(u * 8, v * 8, 8, 4);
  return mix(rgb(0xe9cf94), rgb(0xc4a061), clamp(r * 0.5 + n * 0.35, 0, 1));
};
const sandstonePix = (u, v) => {
  const s = 0.5 + 0.5 * Math.sin((v * 24 + fbm(u * 3, v * 3, 3, 3) * 2) * Math.PI * 2);
  const n = fbm(u * 8, v * 8, 8, 4);
  return mix(rgb(0xb08656), rgb(0x8a6236), clamp(s * 0.6 + n * 0.3, 0, 1));
};
const barkPix = (u, v) => {
  const s = Math.abs(Math.sin((u * 18 + fbm(u * 4, v * 2, 4, 3) * 3) * Math.PI));
  return mix(rgb(0x3a2616), rgb(0x7a5230), s);
};
const foliagePix = (u, v) => {
  const n = fbm(u * 16, v * 16, 16, 4);
  const f = vnoise(u * 64, v * 64, 64, 64);
  const c = mix(rgb(0x1d5e2c), rgb(0x6cb452), n);
  const k = f > 0.7 ? 28 : 0;
  return [c[0] + k, c[1] + k * 1.2, c[2] + k * 0.5];
};
const mountPix = (u, v) => {                          // roca de montaña: estratos y grano, sin grietas
  const strata = vnoise(u * 3, v * 40, 3, 40);
  const n = fbm(u * 8, v * 8, 8, 4);
  const g = vnoise(u * 64, v * 64, 64, 64);
  const c = mix(rgb(0x7d8390), rgb(0xc3c7cc), n);
  const k = (strata - 0.5) * 36 + (g - 0.5) * 18;
  return [c[0] + k, c[1] + k, c[2] + k];
};
const cloudPix = (u, v) => {
  const r = Math.hypot(u - 0.5, v - 0.5) * 2;
  const m = clamp(1 - r, 0, 1);
  const n = fbm(u * 4, v * 4, 4, 5);
  const a = clamp((n * 1.5 - 0.35) * m * 2.2, 0, 1);
  return [255, 255, 255, a * 255];
};

/* ---------- Procedurales en canvas ---------- */
function chevronDraw(acc) {
  return (g, s) => {
    g.fillStyle = '#23272e'; g.fillRect(0, 0, s, s);
    g.fillStyle = acc;
    for (let k = -1; k < 3; k++) {
      const x = k * s / 2;
      g.beginPath();
      g.moveTo(x + 20, 40); g.lineTo(x + 70, 128); g.lineTo(x + 20, 216);
      g.lineTo(x + 36, 216); g.lineTo(x + 86, 128); g.lineTo(x + 36, 40);
      g.closePath(); g.fill();
    }
  };
}
// Tubo: cuadrícula oscura con franjas de borde (como los tubos de Sonic)
function tubeDraw(base, check, rim) {
  return (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    g.fillStyle = check;
    const c = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if ((x + y) % 2 === 0) g.fillRect(x * c, y * c, c, c);
    }
    g.fillStyle = rim;
    g.fillRect(0, s * 0.12, s, s * 0.05);
    g.fillRect(0, s * 0.62, s, s * 0.05);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, s * 0.35, s, s * 0.03);
  };
}
// Señal de bajada: flecha hacia abajo sobre placa oscura
function arrowDraw(acc) {
  return (g, s) => {
    g.fillStyle = '#161a20'; g.fillRect(0, 0, s, s);
    g.strokeStyle = acc; g.lineWidth = 12; g.strokeRect(10, 10, s - 20, s - 20);
    g.fillStyle = acc;
    g.beginPath();
    g.moveTo(s * 0.5 - 34, 58); g.lineTo(s * 0.5 + 34, 58); g.lineTo(s * 0.5 + 34, 150);
    g.lineTo(s * 0.5 + 70, 150); g.lineTo(s * 0.5, 218); g.lineTo(s * 0.5 - 70, 150); g.lineTo(s * 0.5 - 34, 150);
    g.closePath(); g.fill();
  };
}
function hazardDraw(g, s) {
  g.fillStyle = '#f2c200'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1b1b1b';
  for (let k = -4; k < 9; k++) {
    g.beginPath(); g.moveTo(k * 64, 0); g.lineTo(k * 64 + 32, 0);
    g.lineTo(k * 64 + 32 + 256, s); g.lineTo(k * 64 + 256, s); g.closePath(); g.fill();
  }
}
function windowsDraw(g, s) {
  g.fillStyle = '#2f3a44'; g.fillRect(0, 0, s, s);
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    g.fillStyle = (gx * 7 + gy * 3) % 5 < 2 ? '#ffc65a' : '#1a222a';
    g.fillRect(gx * 64 + 14, gy * 64 + 16, 36, 32);
    g.fillStyle = '#20282f'; g.fillRect(gx * 64 + 30, gy * 64 + 16, 3, 32);
  }
}
function steelDraw(g, s) {
  g.fillStyle = '#8d99a3'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) { g.strokeStyle = i % 2 ? 'rgba(255,255,255,.12)' : 'rgba(20,28,36,.14)'; g.lineWidth = 1; const y = i * s / 60; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const cx = 32 + gx * 64, cy = 32 + gy * 64;
    g.fillStyle = '#4e5a64'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
    g.fillStyle = '#d6dee4'; g.beginPath(); g.arc(cx - 1, cy - 1, 1.5, 0, 7); g.fill();
  }
}

const ACCENT = ['#ffd24a', '#ff9800', '#00e5ff'];
const TUBE_COLORS = [
  ['#2b6a3c', '#4fa35a', '#c6ff6b'],   // verde: cuadros verdes con bordes lima
  ['#505863', '#7a8591', '#ffc92b'],   // industrial: acero con bordes amarillos
  ['#135d8f', '#2f9bd6', '#7dffc4'],   // acuática: azul con bordes verde menta
];

const CACHE = {};
// Juego de texturas de una zona (se crea la primera vez que se usa)
export function zoneTextures(zi) {
  if (CACHE[zi]) return CACHE[zi];
  const T = {};
  T.rock = pixelTex(256, rockPix);
  T.foliage = pixelTex(256, foliagePix);
  T.bark = pixelTex(256, barkPix);
  T.cloud = pixelTex(256, cloudPix, { alpha: true });
  T.mountain = pixelTex(256, mountPix);
  T.chevron = canvasTex(256, chevronDraw(ACCENT[zi]));
  T.arrowDown = canvasTex(256, arrowDraw(ACCENT[zi]));
  T.tube = canvasTex(256, tubeDraw(...TUBE_COLORS[zi]));
  if (zi === 0) {
    T.top = FILE.grass || pixelTex(256, grassPix);
    T.side = pixelTex(256, dirtPix);
    T.plank = FILE.wood || T.bark;
    T.platTop = T.top;
  } else if (zi === 1) {
    T.top = FILE.floor || canvasTex(256, steelDraw);
    T.side = pixelTex(256, concretePix);
    T.plank = pixelTex(256, steelPix);
    T.platTop = canvasTex(256, hazardDraw);
    T.brick = FILE.brick || T.side;
    T.windows = canvasTex(256, windowsDraw);
  } else {
    T.top = pixelTex(256, sandPix);
    T.side = pixelTex(256, sandstonePix);
    T.plank = T.rock;
    T.platTop = T.top;
  }
  CACHE[zi] = T;
  return T;
}
