// Fondo: terreno que continúa la pista, montañas con crestas y nieve, decoración por zona y acto, nubes y agua
import * as THREE from 'three';
import { CHUNK, ROCK_GEO, UNIT_BOX, UNIT_CONE, UNIT_CYL, UNIT_SPHERE, extrudeZ, instanced, lensShape } from './geo.js';
import { addGrass } from './lane.js';
import { laneY } from './level.js';
import { FILE } from './textures.js';
import { mulberry32, pickWeighted, smooth, vnoise } from './util.js';

export const ACCENT = [0xffd24a, 0xff9800, 0x00e5ff];
export const ENEMY_COL = [0xd32f2f, 0x8e24aa, 0xff7043];

// Colores por zona y acto: cielo, niebla, luz, montañas y pesos de decoración
export const LOOK = [
  [ // Verde: día, tarde y atardecer
    { top: 0x4fa8ff, bottom: 0xd6f0ff, fog: 0xc4e8ff, sun: 0xfff1d6, hemi: 0xdfeeff, mtnLow: 0x4f7d5a, mtnHigh: 0x7d8c96, snow: 0xf4fbff,
      decor: { tree: 30, pine: 16, bush: 20, totem: 6, mush: 8, rock: 10, arch: 4 } },
    { top: 0x3d86e0, bottom: 0xffe2b0, fog: 0xf0d7a8, sun: 0xffdcaa, hemi: 0xffeedd, mtnLow: 0x5b7c4a, mtnHigh: 0x8a7a68, snow: 0xfff3e0,
      decor: { tree: 14, pine: 34, bush: 10, totem: 14, mush: 6, rock: 14, arch: 6 } },
    { top: 0x5a4fc4, bottom: 0xffb27a, fog: 0xe8a07c, sun: 0xffc08a, hemi: 0xffd7b8, mtnLow: 0x4e6a5a, mtnHigh: 0x7a5f72, snow: 0xffd9bd,
      decor: { tree: 22, pine: 10, bush: 12, totem: 4, mush: 22, rock: 18, arch: 12 } },
  ],
  [ // Industrial: atardecer, crepúsculo y noche
    { top: 0x2d2456, bottom: 0xe0834a, fog: 0x7a5a78, sun: 0xffb070, hemi: 0xf0b8a0, mtnLow: 0x3b3550, mtnHigh: 0x5b4f6a, snow: 0x9a8aa8,
      decor: { bld: 30, crane: 14, tank: 14, pipe: 14, cont: 16, lamp: 12 } },
    { top: 0x1f1d48, bottom: 0xb8604e, fog: 0x5a4468, sun: 0xff9a66, hemi: 0xd0a090, mtnLow: 0x2c2a44, mtnHigh: 0x4a4260, snow: 0x8c7fa0,
      decor: { bld: 36, crane: 22, tank: 10, pipe: 10, cont: 10, lamp: 12 } },
    { top: 0x12142c, bottom: 0x6a4a6e, fog: 0x3f3550, sun: 0x9aa8ff, hemi: 0x8090c0, mtnLow: 0x262640, mtnHigh: 0x3a3858, snow: 0x6e6e90,
      decor: { bld: 28, crane: 8, tank: 18, pipe: 18, cont: 18, lamp: 10 } },
  ],
  [ // Acuática: mar claro, mediodía y tarde
    { top: 0x2c8fe0, bottom: 0xcdf5ff, fog: 0x9be3f2, sun: 0xfff4e0, hemi: 0xe0f6ff, mtnLow: 0x4d7f9a, mtnHigh: 0x8aa6b5, snow: 0xf0fbff,
      decor: { palm: 22, dock: 14, rock: 16, island: 14, arch: 8 } },
    { top: 0x1f7ad0, bottom: 0xa8f0ff, fog: 0x7fd8ee, sun: 0xfff0c8, hemi: 0xd0f0ff, mtnLow: 0x3e7088, mtnHigh: 0x7ea0b0, snow: 0xe8f8ff,
      decor: { palm: 16, dock: 22, rock: 18, island: 16, arch: 10 } },
    { top: 0x0f5aa8, bottom: 0x7ee0e0, fog: 0x5ac8d8, sun: 0xffe2b0, hemi: 0xbfeaf0, mtnLow: 0x2e5f78, mtnHigh: 0x6a90a0, snow: 0xdff4ff,
      decor: { palm: 10, dock: 12, rock: 22, island: 18, arch: 20 } },
  ],
];

// Cordilleras de fondo por zona: altura máxima, profundidad y semilla de las crestas
const RANGES = [
  [{ z: -200, H: 96, base: -10, seed: 11 }, { z: -150, H: 66, base: -8, seed: 23 }, { z: -106, H: 40, base: -6, seed: 37 }],
  [{ z: -205, H: 62, base: -10, seed: 51 }, { z: -158, H: 36, base: -8, seed: 67 }],
  [{ z: -200, H: 90, base: -10, seed: 81 }, { z: -150, H: 58, base: -8, seed: 93 }, { z: -108, H: 30, base: -6, seed: 105 }],
];

// Colores de la zona y del acto (incluye acento y color de enemigos)
export function lookFor(zi, ai) {
  return { ...LOOK[zi][ai], accent: ACCENT[zi], enemy: ENEMY_COL[zi] };
}

const STEP_X = 1.5;             // separación de columnas del terreno (CHUNK es múltiplo exacto)
const LANE_Z = -2.2;            // borde trasero de la pista
const BD_ROWS = [0, 0.4, 0.9, 1.5, 2.2, 3, 4, 5.2, 6.6, 8.2, 10, 12, 14.5, 17, 20, 24, 28, 33, 39, 46, 54, 63, 73, 84, 96];

// Altura del terreno de fondo a distancia d: continúa la pista y se eleva en colinas, se mantiene plano o baja al mar
export function bgHeight(kind, lane, x, d) {
  let h = lane * Math.exp(-d / 4);
  if (kind === 'green') {
    h += 5 * smooth(3, 18, d) * (Math.sin(x * 0.045 + d * 0.09) * 0.6 + Math.sin(x * 0.11 - d * 0.13 + 1.3) * 0.4);
  } else if (kind === 'industrial') {
    h += 0.3 * smooth(3, 10, d) * Math.sin(x * 0.05 + d * 0.1);
  } else {
    h -= 3.4 * smooth(2, 8, d);                          // fondo marino
    h += 6 * smooth(12, 22, d) * Math.max(0, Math.sin(x * 0.07 + d * 0.05) * Math.sin(x * 0.031 - d * 0.04));
  }
  return h;
}

// Terreno: una malla por tramo de CHUNK, con colores que se oscurecen con la distancia
function terrainChunk(chunkOf, c, S, kind, mat, X0, X1) {
  const xa = Math.max(X0, c * CHUNK), xb = Math.min(X1, (c + 1) * CHUNK);
  if (xb <= xa) return null;
  const k0 = Math.round(xa / STEP_X), k1 = Math.round(xb / STEP_X);
  const xs = [];
  for (let k = k0; k <= k1; k++) xs.push(k * STEP_X);
  const nx = xs.length, lanes = xs.map((x) => laneY(S, x));
  const pos = [], uv = [], col = [], idx = [];
  BD_ROWS.forEach((d) => xs.forEach((x, i) => {
    pos.push(x, bgHeight(kind, lanes[i], x, d), LANE_Z - d);
    uv.push(x / 4, d / 4);
    const shade = 1 - 0.35 * smooth(6, 60, d);
    col.push(shade, shade, shade);
  }));
  for (let j = 0; j < BD_ROWS.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, cc = a + nx, e = cc + 1;
    idx.push(a, b, cc, b, e, cc);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  chunkOf(c * CHUNK + 1).add(m);
  return { xs, lanes };
}

// Cordillera: columnas con altura de crestas (ruido de valor invertido) y color por altitud
function ridgeAt(x, seed) {
  let a = 0, amp = 1, f = 0.011, norm = 0;
  for (let o = 0; o < 5; o++) {
    const n = vnoise(x * f + seed, seed * 0.37 + o * 3.1, 4096, 4096);
    const r = 1 - Math.abs(2 * n - 1);
    a += amp * r * r; norm += amp;
    amp *= 0.5; f *= 2.05;
  }
  return a / norm;
}
function rangeMesh(R, x0, x1, look) {
  const pos = [], uv = [], col = [], idx = [];
  const cLow = new THREE.Color(look.mtnLow), cHigh = new THREE.Color(look.mtnHigh), cSnow = new THREE.Color(look.snow);
  const c = new THREE.Color();
  let n = 0;
  for (let x = x0; x <= x1; x += 3) {
    const hn = Math.pow(ridgeAt(x, R.seed), 1.4);
    const h = R.H * (0.12 + 0.88 * hn);
    const top = R.base + h;
    c.copy(cLow).lerp(cHigh, smooth(0.25, 0.7, hn));
    c.lerp(cSnow, smooth(0.8, 0.9, hn));
    pos.push(x, R.base - 4, R.z, x, top, R.z);
    uv.push(x / 60, 0, x / 60, h / 60);
    const k = 1.6;                                     // compensa la textura de roca (que oscurece)
    col.push(c.r * 0.55 * k, c.g * 0.55 * k, c.b * 0.55 * k, c.r * k, c.g * k, c.b * k);
    n++;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = 2 * i, b = a + 1, cc = a + 2, d = a + 3;
    idx.push(a, cc, b, b, cc, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Acumula piezas decorativas por tramo y las dibuja como mallas instanciadas (una llamada por tipo y tramo)
function decorBuckets(chunkOf) {
  const groups = new Map();
  return {
    put(x, key, geo, mat, it) {
      const G = chunkOf(x);
      let m = groups.get(G);
      if (!m) groups.set(G, m = new Map());
      let b = m.get(key);
      if (!b) m.set(key, b = { geo, mat, items: [] });
      b.items.push(it);
    },
    flush() { for (const [G, m] of groups) for (const b of m.values()) instanced(G, b.geo, b.mat, b.items); },
  };
}

// Pieza de un objeto: (ox, oy, oz) relativos a su base y tamaño (sx, sy, sz) en unidades del objeto
const piece = (B, key, geo, mat, o, ox, oy, oz, sx, sy, sz, color, rot) => {
  B.put(o.x, key, geo, mat, {
    x: o.x + ox * o.s, y: o.y + oy * o.s, z: o.z + oz * o.s,
    sx: sx * o.s, sy: (sy ?? sx) * o.s, sz: (sz ?? sx) * o.s, color, ...rot,
  });
};

// Tipos de decoración. o = { x, y, z, s, col } (base en el terreno, escala y tinte)
const DEC = {
  tree(B, o, M) {
    piece(B, 'trunk', UNIT_CYL, M.bark, o, 0, 1.7, 0, 0.22, 3.4, 0.22);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, -0.3, 3.9, 0, 1.5, undefined, undefined, o.col);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, 0.9, 4.3, 0.3, 1.1, undefined, undefined, o.col);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, -0.6, 4.9, -0.2, 0.9, undefined, undefined, o.col);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, 0.2, 5.4, 0.1, 0.8, undefined, undefined, o.col);
  },
  pine(B, o, M) {
    piece(B, 'trunk', UNIT_CYL, M.bark, o, 0, 1.2, 0, 0.18, 2.4, 0.18);
    piece(B, 'crown', UNIT_CONE, M.leaf, o, 0, 2.6, 0, 1.5, 2.6, 1.5, o.col);
    piece(B, 'crown', UNIT_CONE, M.leaf, o, 0, 3.9, 0, 1.15, 2.2, 1.15, o.col);
    piece(B, 'crown', UNIT_CONE, M.leaf, o, 0, 5.1, 0, 0.75, 1.8, 0.75, o.col);
  },
  bush(B, o, M) {
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, 0, 0.7, 0, 1.0, 0.7, 0.9, o.col);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, 1.0, 0.5, 0.4, 0.7, 0.5, 0.6, o.col);
    piece(B, 'crown', UNIT_SPHERE, M.leaf, o, -0.9, 0.5, -0.2, 0.75, 0.55, 0.7, o.col);
    piece(B, 'flower', UNIT_SPHERE, M.flower, o, 0.3, 1.2, 0.8, 0.09, undefined, undefined, 0xffd54a);
    piece(B, 'flower', UNIT_SPHERE, M.flower, o, -0.5, 1.1, 0.6, 0.09, undefined, undefined, 0xff7aa8);
    piece(B, 'flower', UNIT_SPHERE, M.flower, o, 0.7, 0.95, 0.5, 0.09, undefined, undefined, 0xffffff);
  },
  totem(B, o, M) {
    for (let k = 0; k < 4; k++) {
      piece(B, 'wood', UNIT_CYL, M.wood, o, 0, 0.5 + k * 1.1, 0, 0.32 - k * 0.02, 1.0, 0.32 - k * 0.02);
      piece(B, 'dark', UNIT_SPHERE, M.dark, o, 0.2, 0.7 + k * 1.1, 0.3, 0.07);
      piece(B, 'dark', UNIT_SPHERE, M.dark, o, -0.2, 0.7 + k * 1.1, 0.3, 0.07);
    }
  },
  mush(B, o, M) {
    piece(B, 'stem', UNIT_CYL, M.white, o, 0, 0.3, 0, 0.12, 0.6, 0.12);
    piece(B, 'cap', UNIT_SPHERE, M.capW, o, 0, 0.62, 0, 0.32, 0.22, 0.32, o.capCol);
    piece(B, 'dark', UNIT_SPHERE, M.white, o, 0.1, 0.8, 0.12, 0.05);
  },
  rock(B, o, M, rng) {
    piece(B, 'rock', ROCK_GEO, M.rock, o, 0, 0.6, 0, 1.2 + rng() * 0.8, 0.9, 1.0);
  },
  arch(B, o, M, rng, ctx) {
    const G = ctx.chunkOf(o.x);
    const m = extrudeZ(G, lensShape(-2.5, 2.5, -0.4, 1.5, 0.4), -1, 2, M.rock);
    m.position.set(o.x, o.y, o.z); m.scale.setScalar(o.s);
    piece(B, 'pillar', UNIT_CYL, M.rock, o, -2.2, 0.8, -0.7, 0.45, 1.8, 0.45);
    piece(B, 'pillar', UNIT_CYL, M.rock, o, 2.2, 0.8, -0.7, 0.45, 1.8, 0.45);
  },
  // Industrial
  bld(B, o, M, rng, ctx) {
    const w = 6 + rng() * 6, h = 7 + rng() * 12, dp = 5 + rng() * 3;
    piece(B, 'bld', UNIT_BOX, M.windows, o, 0, h / 2, 0, w, h, dp);
    piece(B, 'roof', UNIT_BOX, M.dark, o, w * 0.2, h + 0.35, 0, w * 0.35, 0.7, dp * 0.5);
    if (rng() < 0.7) {
      const top = 4 + rng() * 5, cx = -w * 0.25;
      piece(B, 'chimney', UNIT_CYL, M.steel, o, cx, h + top / 2, 0, 0.5, top, 0.5);
      ctx.chimneys.push({ x: o.x + cx * o.s, y: o.y + (h + top + 0.4) * o.s, z: o.z });
    }
  },
  crane(B, o, M) {
    piece(B, 'steel', UNIT_BOX, M.steel, o, 0, 7, 0, 0.6, 14, 0.6);
    piece(B, 'steel', UNIT_BOX, M.steel, o, 4, 13.5, 0, 12, 0.5, 0.5);
    piece(B, 'steel', UNIT_BOX, M.steel, o, 9, 9, 0, 0.04, 9, 0.04);
    piece(B, 'glow', UNIT_SPHERE, M.glow, o, 9, 4.2, 0, 0.25);
  },
  tank(B, o, M) {
    piece(B, 'tank', UNIT_CYL, M.tank, o, 0, 2.5, 0, 2.2, 5, 2.2);
    piece(B, 'steel', UNIT_CYL, M.steel, o, 0, 5.1, 0, 2.25, 0.25, 2.25);
  },
  pipe(B, o, M) {
    piece(B, 'pipe', UNIT_CYL, M.steel, o, 6, 4.5, 0, 0.25, 12, 0.25, undefined, { rz: Math.PI / 2 });
    piece(B, 'steel', UNIT_BOX, M.steel, o, 0, 2.2, 0, 0.4, 4.4, 0.4);
    piece(B, 'steel', UNIT_BOX, M.steel, o, 12, 2.2, 0, 0.4, 4.4, 0.4);
    piece(B, 'glow', UNIT_BOX, M.glow, o, 6, 4.8, 0.3, 0.6, 0.2, 0.2);
  },
  cont(B, o, M, rng) {
    const cols = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f];
    piece(B, 'box', UNIT_BOX, M.box, o, 0, 1.2, 0, 4, 2.4, 2.4, cols[Math.floor(rng() * 4)]);
    if (rng() < 0.5) piece(B, 'box', UNIT_BOX, M.box, o, 0.5, 3.6, 0, 3.4, 2.4, 2.4, cols[Math.floor(rng() * 4)]);
  },
  lamp(B, o, M) {
    piece(B, 'steel', UNIT_CYL, M.steel, o, 0, 2.2, 0, 0.08, 4.4, 0.08);
    piece(B, 'lamp', UNIT_SPHERE, M.lamp, o, 0, 4.5, 0, 0.2);
  },
  // Acuática
  palm(B, o, M) {
    piece(B, 'trunk', UNIT_CYL, M.trunk, o, 0, 2.0, 0, 0.16, 4, 0.16);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      piece(B, 'frond', UNIT_SPHERE, M.palm, o, Math.cos(a) * 1.1, 4.2, Math.sin(a) * 0.5, 1.4, 0.16, 0.42, o.col, { ry: -a, rz: 0.35 });
    }
  },
  dock(B, o, M) {
    const dy = Math.max(o.y, -1.2) + 0.3;
    piece(B, 'deck', UNIT_BOX, M.dock, { ...o, y: dy, s: 1 }, 0, 0, 0, 9, 0.3, 2.4);
    for (let k = -1; k <= 1; k++) {
      const px = o.x + k * 3.5;
      B.put(px, 'post', UNIT_CYL, M.dock, { x: px, y: (dy - 4) / 2, z: o.z, sx: 0.22, sy: dy + 4, sz: 0.22 });
    }
  },
  island(B, o, M, rng) {
    const y = Math.max(o.y, -2.2) + 0.2;
    piece(B, 'sand', ROCK_GEO, M.sand, { ...o, y, s: 1 }, 0, 0, 0, 3 + rng() * 3, 0.9, 2.2);
  },
};

// Materiales de la zona (texturas compartidas; los materiales se liberan al cambiar de fase)
function zoneMaterials(T, accent) {
  return {
    bark: new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ map: T.foliage, roughness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1e6d0, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.6 }),
    flower: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    capW: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    rock: new THREE.MeshStandardMaterial({ map: T.rock, roughness: 0.95 }),
    sand: new THREE.MeshStandardMaterial({ map: T.top, roughness: 0.9 }),
    dock: new THREE.MeshStandardMaterial({ map: T.plank, roughness: 0.8 }),
    palm: new THREE.MeshStandardMaterial({ map: T.foliage, roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ map: T.bark, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x7f8b96, roughness: 0.45, metalness: 0.7 }),
    tank: new THREE.MeshStandardMaterial({ color: 0x9aa7b2, roughness: 0.4, metalness: 0.6 }),
    windows: new THREE.MeshStandardMaterial({ map: T.windows || null, roughness: 0.6, emissive: 0x2a1600, emissiveIntensity: 0.25 }),
    box: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffb74d, emissive: 0xff9800, emissiveIntensity: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: accent }),
  };
}

// Construye el fondo de la fase: terreno por tramos, cordilleras, decoración, nubes, agua y humo
export function buildBackdrop(lv, zi, ai, T, chunkOf, root) {
  const look = lookFor(zi, ai);
  const kind = zi === 0 ? 'green' : zi === 1 ? 'industrial' : 'water';
  const S = lv.solids;
  const rng = mulberry32(lv.zone * 4001 + lv.act * 97 + 31);
  const X0 = -60, X1 = lv.endX + 90;
  const BD = { water: null, smoke: [] };

  // Terreno (por tramos de CHUNK)
  const terrainMat = new THREE.MeshStandardMaterial({ map: zi === 1 ? T.side : T.top, roughness: 0.95, vertexColors: true });
  const surfacesByChunk = [];
  for (let c = Math.floor(X0 / CHUNK); c <= Math.floor(X1 / CHUNK); c++) {
    const r = terrainChunk(chunkOf, c, S, kind, terrainMat, X0, X1);
    if (r) surfacesByChunk.push({ c, ...r });
  }
  const H = (x, d) => bgHeight(kind, laneY(S, x), x, d);

  // Hierba 3D en la franja de terreno cercana a la pista (zona verde)
  if (zi === 0) {
    for (const { c } of surfacesByChunk) {
      const xa = Math.max(X0, c * CHUNK), xb = Math.min(X1, (c + 1) * CHUNK);
      addGrass(chunkOf(c * CHUNK + 1), [
        { x0: xa, x1: xb, z0: LANE_Z - 2.6, z1: LANE_Z - 0.3, y: (x) => H(x, 1.4) },
        { x0: xa, x1: xb, z0: LANE_Z - 7, z1: LANE_Z - 2.6, y: (x) => H(x, 4.8) },
      ], 1.4, rng, true);
    }
  }

  // Fondo bajo la pista: por un hueco no debe verse el cielo, sino un abismo oscuro
  const abyssColor = [0x4a3420, 0x2f343c, 0x0d3557][zi];
  const abyss = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 400, 200), new THREE.MeshStandardMaterial({ color: abyssColor, roughness: 1 }));
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.set((X0 + X1) / 2, -14, LANE_Z - 80);
  abyss.receiveShadow = true;
  root.add(abyss);

  // Cordilleras con crestas (zona verde y acuática) o skyline (industrial)
  const ranges = RANGES[zi];
  for (const R of ranges) {
    const mat = new THREE.MeshStandardMaterial({ map: T.mountain, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const m = new THREE.Mesh(rangeMesh(R, X0 - 200, lv.endX + 200, look), mat);
    root.add(m);
  }
  if (zi === 1) {                                   // skyline de fábrica tras las colinas
    const skyM = new THREE.MeshStandardMaterial({ map: T.windows || null, roughness: 0.7, emissive: 0x1a0d00, emissiveIntensity: 0.4 });
    const items = [];
    for (let x = X0 - 200; x < lv.endX + 200; x += 9 + rng() * 10) {
      const w = 8 + rng() * 10, h = 14 + rng() * 34;
      items.push({ x, y: h / 2 - 8, z: -120 - rng() * 45, sx: w, sy: h, sz: 10 + rng() * 6 });
    }
    instanced(root, UNIT_BOX, skyM, items);
  }

  // Decoración repartida sobre el terreno, a su altura real (franja cercana y lejana)
  const M = zoneMaterials(T, look.accent);
  const B = decorBuckets(chunkOf);
  const ctx = { chunkOf, chimneys: [], rng };
  const BIG = new Set(['bld', 'crane', 'tank', 'cont']);
  const place = (x, d) => {
    const y = H(x, d);
    const k = pickWeighted(look.decor, rng);
    if (k === 'palm' && y < -1.2) return;            // las palmeras solo crecen sobre tierra
    if (k === 'island' && y > 1.5) return;
    if (BIG.has(k) && d < 14) return place(x, 14 + rng() * 36);   // edificios y grúas: lejos, no tapan la pista
    const o = {
      x, y, z: LANE_Z - d, s: 0.8 + rng() * 0.7,
      col: new THREE.Color().setHSL(0.27 + (rng() - 0.5) * 0.1, 0.45 + rng() * 0.25, 0.55 + rng() * 0.2).getHex(),
      capCol: [0xd7262b, 0xffb300, 0x8e6cf0, 0xf5f5f5][Math.floor(rng() * 4)],
    };
    DEC[k](B, o, M, rng, ctx);
  };
  for (let x = X0 + 2; x < X1; x += 2.8 + rng() * 3.6) place(x + (rng() - 0.5) * 2, 3 + rng() * 9);
  for (let x = X0 + 4; x < X1; x += 6 + rng() * 7) place(x, 14 + rng() * 36);
  B.flush();

  // Humo de las chimeneas (industrial)
  if (zi === 1) {
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.cloud, color: 0xb9c0c6, transparent: true, opacity: 0.5, depthWrite: false }));
      root.add(sp);
      const c = ctx.chimneys[i % Math.max(1, ctx.chimneys.length)];
      BD.smoke.push({ s: sp, age: i * 0.35, life: 4.2, cx: c ? c.x : 0, top: c ? c.y : 0, z: c ? c.z : -30, has: !!c });
      sp.visible = !!c;
    }
  }

  // Nubes (planos con textura de alfa), tintadas por el horizonte
  const cloudMat = new THREE.MeshBasicMaterial({ map: T.cloud, transparent: true, depthWrite: false });
  cloudMat.color.set(0xffffff).lerp(new THREE.Color(look.bottom), 0.25);
  const cloudItems = [];
  const nClouds = Math.round((X1 - X0) / 26);
  for (let i = 0; i < nClouds; i++) {
    const w = 16 + rng() * 22;
    cloudItems.push({ x: X0 + rng() * (X1 - X0), y: 18 + rng() * 22, z: -60 - rng() * 60, sx: w, sy: w * 0.42, sz: 1 });
  }
  instanced(root, new THREE.PlaneGeometry(1, 1), cloudMat, cloudItems).castShadow = false;

  // Agua (zona acuática): superficie con olas, espuma y brillos
  if (zi === 2) {
    const wd = 110, wx0 = X0 - 200, wx1 = lv.endX + 200;
    const wg = new THREE.PlaneGeometry(wx1 - wx0, wd, Math.ceil((wx1 - wx0) / 3), 24).rotateX(-Math.PI / 2);
    BD.water = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(0x3fd0ff) }, uB: { value: new THREE.Color(0x0a5a9a) }, uNormal: { value: FILE.waternormal || T.cloud } },
      vertexShader: `
        uniform float uTime; varying float vW; varying vec2 vXZ;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.45 + uTime * 1.4) * 0.12 + sin(p.z * 0.9 - uTime * 1.9) * 0.07;
          p.y += w; vW = w; vXZ = p.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform sampler2D uNormal; varying float vW; varying vec2 vXZ;
        void main() {
          vec3 c = mix(uB, uA, clamp(0.5 + vW * 2.0, 0.0, 1.0));
          c = mix(c, vec3(1.0), smoothstep(0.14, 0.2, vW) * 0.6);
          float sparkle = pow(0.5 + 0.5 * sin(vXZ.x * 7.0 + uTime * 3.0) * sin(vXZ.y * 9.0 - uTime * 2.0), 8.0);
          c += sparkle * 0.35;
          vec3 nm = texture2D(uNormal, vXZ * 0.06 + vec2(uTime * 0.02, uTime * 0.015)).rgb * 2.0 - 1.0;
          c += pow(max(dot(normalize(nm), normalize(vec3(0.25, 0.85, 0.35))), 0.0), 40.0) * 0.5;
          gl_FragColor = vec4(c, 0.8);
          #include <colorspace_fragment>
        }`,
    });
    const water = new THREE.Mesh(wg, BD.water);
    water.position.set((wx0 + wx1) / 2, -2.2, 1 - wd / 2);
    root.add(water);
  }
  BD.materials = M;
  return BD;
}

// Animación del fondo: humo que sube y agua
export function updateBackdrop(BD, t, dt) {
  if (BD.water) BD.water.uniforms.uTime.value = t;
  for (const sm of BD.smoke) {
    if (!sm.has) continue;
    sm.age += dt;
    if (sm.age > sm.life) { sm.age = 0; sm.s.position.set(sm.cx, sm.top, sm.z); }
    const k = sm.age / sm.life;
    sm.s.position.y += dt * 1.1;
    sm.s.position.x += dt * (0.3 + 0.2 * Math.sin(t + sm.cx));
    sm.s.scale.setScalar(1.5 + k * 4);
    sm.s.material.opacity = 0.5 * (1 - k);
  }
}
