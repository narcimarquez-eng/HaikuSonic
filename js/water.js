// Agua de la pista: vados, arroyos, lagunas y estanques (superficie con ondas y espuma, y un frente translúcido que se
// desvanece hacia el fondo para que no parezca una caja) y cascadas (lámina con estrías verticales que bajan por el
// borde de una meseta, con espuma y salpicaduras en la base).
// No se pueden descargar texturas desde el entorno de desarrollo: las ondas, la espuma y las estrías se generan aquí
// al cargar. Son periódicas (se repiten sin costuras) y siempre salen iguales (semilla fija).
import * as THREE from 'three';
import { mesh } from './geo.js';
import { G } from './physics.js';

const WATER_HEX = [0x2b8fc4, 0x2a86bb, 0x3ca7d8];   // vados y estanques: azul translúcido (la zona acuática, más clara)
const N = 256;                                         // tamaño de las texturas generadas (potencia de dos)
const DEPTH = 3.8;                                     // profundidad (en z) de vados y estanques
const SPLASH_RANGE = 45;                               // las cascadas salpican solo si el jugador está cerca
let normalTex = null, foamTex = null, streakTex = null, shoreTex = null;

// Generador pseudoaleatorio con semilla fija (las texturas salen siempre iguales)
function seeded(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Textura que se repite: filtrado con mipmaps para que no parpadee a distancia
function periodic(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// Mapa de normales de ondas: suma de senoides de frecuencia entera (la textura es periódica)
function makeNormalTex() {
  const r = seeded(11), data = new Uint8Array(N * N * 4), k = 2 * Math.PI / N;
  const waves = Array.from({ length: 16 }, () => ({
    kx: 1 + Math.floor(r() * 7), ky: 1 + Math.floor(r() * 7), ph: r() * 2 * Math.PI, a: 0.3 + r() * 0.7,
  }));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let gx = 0, gy = 0;
      for (const w of waves) {
        const c = Math.cos(k * (w.kx * x + w.ky * y) + w.ph) * w.a * k;   // derivada de la onda
        gx += c * w.kx; gy += c * w.ky;
      }
      const nx = -gx * 0.9, ny = -gy * 0.9, len = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
      data[i] = (nx / len * 0.5 + 0.5) * 255;
      data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return periodic(data, N, N);
}

// Espuma: manchas blancas irregulares (transparentes fuera de ellas)
function makeFoamTex() {
  const r = seeded(23), h = new Float32Array(N * N), data = new Uint8Array(N * N * 4), k = 2 * Math.PI / N;
  const waves = Array.from({ length: 10 }, () => ({
    kx: 2 + Math.floor(r() * 12), ky: 2 + Math.floor(r() * 12), ph: r() * 2 * Math.PI, a: 0.5 + r(),
  }));
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(k * (w.kx * x + w.ky * y) + w.ph) * w.a;
      h[y * N + x] = v;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
  }
  for (let i = 0; i < N * N; i++) {
    const t = (h[i] - lo) / (hi - lo), a = Math.min(1, Math.max(0, (t - 0.55) / 0.3));
    data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = a * a * 255;
  }
  return periodic(data, N, N);
}

// Estrías de cascada: columnas claras y verticales (unas más anchas, otras finas) cuya intensidad varía a lo largo
// en tramos, como gotas. La textura se repite en vertical; desplazada hacia abajo, el agua cae.
function makeStreakTex() {
  const W = 64, H = 256, r = seeded(31), data = new Uint8Array(W * H * 4);
  const streaks = Array.from({ length: 16 }, () => ({
    x: r() * W, w: 0.9 + r() * 1.3, a: 0.6 + r() * 0.4, f: 2 + Math.floor(r() * 3), ph: r() * 2 * Math.PI,
  }));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const s of streaks) {
        let dx = Math.abs(x - s.x); dx = Math.min(dx, W - dx);              // distancia circular (la textura es periódica)
        const across = Math.exp(-(dx * dx) / (s.w * s.w));
        const along = 0.5 + 0.5 * Math.sin(2 * Math.PI * s.f * y / H + s.ph);  // trozos de gota: más claros y más oscuros
        v = Math.max(v, across * s.a * along);
      }
      const i = (y * W + x) * 4;
      data[i] = 235; data[i + 1] = 250; data[i + 2] = 255; data[i + 3] = v * 255;
    }
  }
  return periodic(data, W, H);
}

// Degradado vertical del frente de un estanque: más visible arriba (la superficie) y casi transparente abajo
function makeShoreTex() {
  const H = 64, data = new Uint8Array(H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1), i = y * 4;
    data[i] = 150; data[i + 1] = 225; data[i + 2] = 255;
    data[i + 3] = (0.1 + 0.5 * Math.pow(t, 1.8)) * 255;
  }
  const tex = new THREE.DataTexture(data, 1, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Vado o estanque: la superficie es un plano con ondas y espuma, y el frente un plano translúcido que se desvanece
// hacia el fondo. Así el agua no se ve como una caja.
function buildPool(s, zi, G, anim) {
  const w = s.x1 - s.x0, h = s.wl - s.y1, cx = (s.x0 + s.x1) / 2;
  const nmap = normalTex.clone();
  nmap.repeat.set(Math.max(1, w / 4), Math.max(1, DEPTH / 4));
  nmap.needsUpdate = true;
  const topM = new THREE.MeshStandardMaterial({
    color: WATER_HEX[zi], transparent: true, opacity: 0.66, roughness: 0.05, metalness: 0,
    normalMap: nmap, normalScale: new THREE.Vector2(0.8, 0.8), depthWrite: false, envMapIntensity: 1.4,
  });
  const surface = mesh(G, new THREE.PlaneGeometry(w, DEPTH), topM, cx, s.wl, 0);
  surface.rotation.x = -Math.PI / 2;
  anim.push({ kind: 'wave', tex: nmap, speed: 0.22 + Math.random() * 0.15 });

  const frontM = new THREE.MeshStandardMaterial({
    color: WATER_HEX[zi], map: shoreTex, transparent: true, roughness: 0.05, depthWrite: false, envMapIntensity: 1.2,
  });
  mesh(G, new THREE.PlaneGeometry(w, h), frontM, cx, s.y1 + h / 2, DEPTH / 2 + 0.02);

  // Espuma sobre la superficie: una lámina horizontal con manchas blancas
  const ft = foamTex.clone();
  ft.repeat.set(Math.max(1, w / 3), Math.max(1, DEPTH / 3));
  ft.needsUpdate = true;
  const foamM = new THREE.MeshBasicMaterial({ color: 0xffffff, map: ft, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });
  const sheet = mesh(G, new THREE.PlaneGeometry(w, DEPTH), foamM, cx, s.wl + 0.03, 0);
  sheet.rotation.x = -Math.PI / 2;
  anim.push({ kind: 'surf', tex: ft });
}

// Cascada: una lámina azulada, estrías verticales delante, y espuma con salpicaduras en la base
function buildFall(f, G, anim) {
  const h = f.yTop - f.yBot;
  const st = streakTex.clone();
  st.repeat.set(1, Math.max(1, h / 3));
  st.offset.y = Math.random();
  st.needsUpdate = true;
  // Lámina azulada detrás y estrías blancas delante; toneMapped:false para que el blanco no se vuelva gris
  const sheetM = new THREE.MeshBasicMaterial({ color: 0xa6ecff, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
  const streakM = new THREE.MeshBasicMaterial({ color: 0xffffff, map: st, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  mesh(G, new THREE.PlaneGeometry(f.w, h), sheetM, f.x, f.yBot + h / 2, 2.22);
  mesh(G, new THREE.PlaneGeometry(f.w, h), streakM, f.x, f.yBot + h / 2, 2.25);
  anim.push({ kind: 'fall', tex: st, speed: 2.4, x: f.x, w: f.w, yBot: f.yBot, splashT: 0 });
  // Espuma en la base de la caída
  const ft = foamTex.clone();
  ft.repeat.set(Math.max(1, f.w / 2), 1);
  ft.needsUpdate = true;
  const foamM = new THREE.MeshBasicMaterial({ color: 0xffffff, map: ft, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const foam = mesh(G, new THREE.PlaneGeometry(f.w * 2.6, 1.2), foamM, f.x, f.yBot + 0.35, 2.3);
  anim.push({ kind: 'foam', obj: foam });
}

// Crea el agua de la fase: vados y estanques, y una cascada en cada borde de meseta.
// Devuelve la lista de elementos que se animan por fotograma (updateWater)
export function buildWater(lv, chunkOf) {
  normalTex = normalTex || makeNormalTex();
  foamTex = foamTex || makeFoamTex();
  streakTex = streakTex || makeStreakTex();
  shoreTex = shoreTex || makeShoreTex();
  const anim = [];
  for (const s of lv.solids) {
    if (!s.wade) continue;
    buildPool(s, lv.zone, chunkOf((s.x0 + s.x1) / 2), anim);
  }
  for (const f of lv.falls) buildFall(f, chunkOf(f.x), anim);
  return anim;
}

// Mueve las ondas, la espuma y la caída de las cascadas (un paso por fotograma). Las cascadas cercanas al jugador
// (px) lanzan salpicaduras en la base
export function updateWater(anim, t, dt, px = 0) {
  for (const a of anim) {
    if (a.kind === 'wave') { a.tex.offset.x += dt * a.speed; a.tex.offset.y += dt * a.speed * 0.6; }
    else if (a.kind === 'surf') a.tex.offset.x -= dt * 0.04;
    else if (a.kind === 'fall') {
      a.tex.offset.y -= dt * a.speed;
      a.splashT -= dt;
      if (a.splashT <= 0 && Math.abs(a.x - px) < SPLASH_RANGE) {
        a.splashT = 0.1 + Math.random() * 0.08;
        for (let k = 0; k < 2; k++) G.fx.push({ x: a.x + (Math.random() - 0.5) * a.w, y: a.yBot + 0.4, n: 4, pal: 1 });
      }
    } else { const k = 1 + 0.08 * Math.sin(t * 5); a.obj.scale.set(k, 1 + 0.2 * Math.sin(t * 5), 1); }
  }
}
