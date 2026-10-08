// Entidades: anillos y enemigos instanciados, postes de control, meta, muelles y plataformas móviles
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RING_GEO, UNIT_BOX, UNIT_CYL, UNIT_SPHERE, addBox, mesh } from './geo.js';
import { ACCENT, ENEMY_COL } from './backdrop.js';
import { MODELS } from './models.js';

const MAX_SCATTER = 60;
const ENEMY_SCALE = 1.1;
const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// Pieza con un color por vértice (para fusionarla con otras piezas sin materiales extra)
function piece(geo, hex, m) {
  const g = geo.clone().toNonIndexed();
  g.applyMatrix4(m);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, c = new THREE.Color(hex), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Geometrías de un enemigo, en coordenadas locales (la base está en y = 0)
function bodyGeo(shellHex) {
  const prof = [[0, 0.0], [0.22, 0.02], [0.36, 0.12], [0.42, 0.26], [0.4, 0.38], [0.3, 0.46], [0.16, 0.5], [0, 0.51]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return mergeGeometries([
    piece(new THREE.LatheGeometry(prof, 28), shellHex, M4(0, 0.42, 0)),          // cúpula
    piece(UNIT_SPHERE, 0x23272d, M4(0, 0.34, 0, 0, 0, 0, 0.42, 0.1, 0.34)),      // chasis
    piece(UNIT_BOX, 0x23272d, M4(0.28, 0.8, 0.14, 0, 0, -0.35, 0.2, 0.04, 0.12)), // ceño
  ]);
}
function eyeGeo() {
  return mergeGeometries([
    piece(UNIT_SPHERE, 0xffea00, M4(0.3, 0.7, 0.14, 0, 0, 0, 0.1, 0.09, 0.09)),  // visor luminoso
    piece(UNIT_SPHERE, 0x111111, M4(0.36, 0.7, 0.16, 0, 0, 0, 0.035, 0.035, 0.035)),
  ]);
}
function wheelGeo() {
  const chrome = 0xd7dde3;
  const parts = [
    piece(RING_GEO, 0x161616, M4(0, 0, 0, 0, 0, 0, 0.8)),                        // aro de goma
    piece(UNIT_CYL, chrome, M4(0, 0, 0, Math.PI / 2, 0, 0, 0.09, 0.07, 0.09)),   // buje
  ];
  for (let k = 0; k < 3; k++) parts.push(piece(UNIT_BOX, chrome, M4(0, 0, 0, 0, 0, k * Math.PI / 3, 0.44, 0.04, 0.04)));
  return mergeGeometries(parts);
}
function antennaGeo() {
  return mergeGeometries([
    piece(UNIT_CYL, 0x23272d, M4(0, 0.18, 0, 0, 0, 0, 0.02, 0.36, 0.02)),
    piece(UNIT_SPHERE, 0xffea00, M4(0, 0.38, 0, 0, 0, 0, 0.04)),
  ]);
}

// Copia especular en x con el orden de vértices invertido: así no hay escalas negativas en las instancias
function mirrorX(geo) {
  const g = geo.clone();
  const swap = (arr, size, a, b) => { for (let k = 0; k < size; k++) { const t = arr[a + k]; arr[a + k] = arr[b + k]; arr[b + k] = t; } };
  for (const name of ['position', 'normal', 'color']) {
    const at = g.attributes[name], n = at.itemSize;
    for (let i = 0; i < at.count; i += 3) swap(at.array, n, (i + 1) * n, (i + 2) * n);
    at.needsUpdate = true;
  }
  const pos = g.attributes.position.array, nrm = g.attributes.normal.array;
  for (let i = 0; i < pos.length; i += 3) pos[i] = -pos[i];
  for (let i = 0; i < nrm.length; i += 3) nrm[i] = -nrm[i];
  g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  return g;
}
// Cuatro mallas por sentido (derecha / izquierda) y tipo de pieza
function enemySet(geos, mats, N, root) {
  const set = {};
  const names = ['body', 'eye', 'wheel', 'ant'];
  const cap = [N, N, 2 * N, 2 * N];
  names.forEach((k, i) => {
    set[k] = new THREE.InstancedMesh(geos[i], mats[i], cap[i]);
    set[k].count = 0; set[k].frustumCulled = false;
    root.add(set[k]);
  });
  set.body.castShadow = set.wheel.castShadow = true;
  return set;
}

// Crea anillos, enemigos, postes y meta. Anillos y enemigos son instancias compartidas (pocas llamadas de dibujo)
const MODEL_OF = { fly: 'flyer', shoot: 'shooter', boss: 'boss', wasp: 'wasp', hop: 'hopper', spiny: 'spiky', fish: 'fish', housefly: 'housefly', worm: 'worm', beetle: 'beetle' };   // tipo de enemigo -> modelo de Blender
const SHOT_MAX = 40;                                                   // proyectiles de enemigos visibles a la vez
const SIZE_OF = { wasp: 1.25, hop: 1.15, spiny: 1.15, fish: 1.2, housefly: 1.4 };     // los enemigos pequeños se dibujan un poco más grandes
const _id = new THREE.Matrix4();

// Piezas de un modelo como mallas instanciadas (una por pieza y tipo): si el modelo no cargó, una esfera de respaldo
function modelParts(name, type, zi, n, root) {
  const src = MODELS[name];
  let pieces = [];
  if (src) {
    src.updateMatrixWorld(true);
    src.traverse((o) => { if (o.isMesh) pieces.push({ geo: o.geometry, mat: o.material, m: o.matrixWorld.clone() }); });
  } else {
    const s = type === 'boss' ? 1.4 : 0.45;
    pieces = [{ geo: UNIT_SPHERE, mat: new THREE.MeshStandardMaterial({ color: ENEMY_COL[zi] }), m: new THREE.Matrix4().makeScale(s, s, s) }];
  }
  return pieces.map((p) => {
    const mat = p.mat.clone();
    if (type !== 'boss' && p.mat.name === 'steel') mat.color.setHex(ENEMY_COL[zi]);   // la carcasa toma el color de la zona
    const im = new THREE.InstancedMesh(p.geo, mat, n);
    im.count = n; im.castShadow = true; im.frustumCulled = false;
    root.add(im);
    return { im, m: p.m };
  });
}

export function buildEntities(lv, zi, chunkOf, root) {
  const E = { accent: ACCENT[zi] };
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 1, roughness: 0.18, emissive: 0x3a2a00 });
  E.ringIM = new THREE.InstancedMesh(RING_GEO, ringMat, Math.max(1, lv.rings.length));
  E.ringIM.count = lv.rings.length; E.ringIM.frustumCulled = false;
  E.scatIM = new THREE.InstancedMesh(RING_GEO, ringMat, MAX_SCATTER);
  E.scatIM.count = 0; E.scatIM.frustumCulled = false;
  root.add(E.ringIM, E.scatIM);

  // Enemigos: cuerpo, visor, ruedas y antenas (cuatro mallas por sentido)
  const N = Math.max(1, lv.enemies.length);
  const shell = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  const antMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const body = bodyGeo(ENEMY_COL[zi]), eye = eyeGeo(), wheel = wheelGeo(), ant = antennaGeo();
  E.R = enemySet([body, eye, wheel, ant], [shell, eyeMat, wheelMat, antMat], N, root);
  E.L = enemySet([mirrorX(body), mirrorX(eye), mirrorX(wheel), mirrorX(ant)], [shell, eyeMat, wheelMat, antMat], N, root);

  // Drones, torretas y jefes: cada pieza de su modelo de Blender es una malla instanciada por tipo
  E.models = [];
  for (const [type, name] of Object.entries(MODEL_OF)) {
    const list = lv.enemies.filter((e) => e.type === type);
    if (list.length) E.models.push({ list, parts: modelParts(name, type, zi, list.length, root) });
  }
  // Disparos de enemigos: esferas naranjas que brillan
  E.shotIM = new THREE.InstancedMesh(UNIT_SPHERE, new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }), SHOT_MAX);
  E.shotIM.count = 0; E.shotIM.frustumCulled = false;
  root.add(E.shotIM);

  // Postes de control y meta (cada uno en el tramo donde está)
  const postM = std(0x7a5230, 0.8);
  const accentM = new THREE.MeshStandardMaterial({ color: ACCENT[zi], emissive: ACCENT[zi], emissiveIntensity: 0.35, roughness: 0.4 });
  for (const c of lv.checkpoints) {
    const G = chunkOf(c.x);
    addBox(G, postM, c.x, c.y + 1.1, 0, 0.12, 2.2, 0.12);
    c.mat = std(0x9aa3ab, 0.35, 0.7);
    c.orb = mesh(G, UNIT_SPHERE, c.mat, c.x, c.y + 2.35, 0, 0.22);
  }
  const GG = chunkOf(lv.goalX);
  addBox(GG, postM, lv.goalX, lv.goalY + 3.5, 0, 0.3, 7, 0.3);
  E.goalOrb = mesh(GG, UNIT_SPHERE, accentM, lv.goalX, lv.goalY + 7.2, 0, 0.5);
  return E;
}

const _pos = new THREE.Vector3(), _sc = new THREE.Vector3(), _q = new THREE.Quaternion(), _eul = new THREE.Euler();
const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4();

// Animación por fotograma: anillos, enemigos (ruedas y antenas), muelles, plataformas y meta
export function updateEntities(E, lv, t, dt) {
  const m = _m;
  lv.rings.forEach((r, i) => {
    _pos.set(r.x, r.y, 0); _q.setFromEuler(_eul.set(0, t * 3 + i * 0.4, 0));
    _sc.setScalar(r.taken ? 0 : 1);
    E.ringIM.setMatrixAt(i, m.compose(_pos, _q, _sc));
  });
  E.ringIM.instanceMatrix.needsUpdate = true;

  lv.scatter.forEach((r, i) => {
    _pos.set(r.x, r.y, 0); _q.setFromEuler(_eul.set(0, t * 3 + i, 0)); _sc.setScalar(1);
    E.scatIM.setMatrixAt(i, m.compose(_pos, _q, _sc));
  });
  E.scatIM.count = lv.scatter.length;
  E.scatIM.instanceMatrix.needsUpdate = true;

  // Enemigos: según el sentido usan la malla derecha o la especular; ruedas y antenas se giran igual
  let cR = 0, cL = 0;
  lv.enemies.forEach((e) => {
    const left = e.dir < 0, sg = left ? -1 : 1;
    const set = left ? E.L : E.R, k = left ? cL++ : cR++;
    const sc = e.alive ? ENEMY_SCALE : 0;
    _pos.set(e.x, e.y, 0); _q.identity(); _sc.setScalar(sc);
    _b.compose(_pos, _q, _sc);
    set.body.setMatrixAt(k, _b);
    set.eye.setMatrixAt(k, _b);
    const spin = sg * -e.x * 4;                          // ruedas: giran según el avance
    for (let w = 0; w < 2; w++) {
      const wx = (w === 0 ? 0.14 : -0.14) * sg, wz = w === 0 ? 0.2 : -0.14;
      m.copy(_b).multiply(_t.makeTranslation(wx, 0.27, wz)).multiply(_r.makeRotationZ(spin));
      set.wheel.setMatrixAt(2 * k + w, m);
      const ang = sg * Math.sin(t * 6 + e.phase + w) * 0.22;   // antenas balanceándose
      m.copy(_b).multiply(_t.makeTranslation((w === 0 ? -0.12 : 0.12) * sg, 0.9, 0.02)).multiply(_r.makeRotationZ(ang));
      set.ant.setMatrixAt(2 * k + w, m);
    }
  });
  for (const [set, n] of [[E.R, cR], [E.L, cL]]) {
    set.body.count = set.eye.count = n;
    set.wheel.count = set.ant.count = 2 * n;
    for (const im of [set.body, set.eye, set.wheel, set.ant]) im.instanceMatrix.needsUpdate = true;
  }

  // Drones, torretas y jefes: cada enemigo mueve todas las piezas de su modelo; el jefe late al recibir un golpe
  for (const set of E.models) {
    set.list.forEach((e, k) => {
      const face = e.face ?? 1;                              // hacia donde mira (lo fija la física)
      const pulse = e.inv > 0 ? 1 + 0.08 * Math.sin(t * 60) : 1;
      _pos.set(e.x, e.y, 0); _q.setFromEuler(_eul.set(0, face < 0 ? Math.PI : 0, 0));
      _sc.setScalar((e.alive ? 1 : 0) * pulse * (SIZE_OF[e.type] || 1));
      _b.compose(_pos, _q, _sc);
      for (const pt of set.parts) pt.im.setMatrixAt(k, m.multiplyMatrices(_b, pt.m));
    });
    for (const pt of set.parts) { pt.im.count = set.list.length; pt.im.instanceMatrix.needsUpdate = true; }
  }
  // Disparos de enemigos
  E.shotIM.count = lv.shots.length;
  lv.shots.forEach((s, i) => { _pos.set(s.x, s.y, 0.2); _sc.setScalar(0.3); E.shotIM.setMatrixAt(i, m.compose(_pos, _q.identity(), _sc)); });
  E.shotIM.instanceMatrix.needsUpdate = true;

  // Postes: se encienden al pasarlos
  for (const c of lv.checkpoints) {
    c.mat.color.setHex(c.hit ? E.accent : 0x9aa3ab);
    c.mat.emissive.setHex(c.hit ? E.accent : 0x000000);
  }

  // Muelles (se aplastan al tocarlos) y plataformas móviles con engranajes
  for (const s of lv.solids) {
    if (s.mover && s.mesh) {
      s.mesh.position.x = s.cx;
      if (s.gears) {
        const turn = -(s.cx - s.base) / 0.7;
        s.gears.forEach((g) => (g.rotation.z = turn));
      }
    }
    if (s.kind === 'spring' && s.mesh) {
      s.squash = Math.max(0, s.squash - dt);
      const k = s.squash > 0 ? 0.6 : 1;
      s.mesh.scale.y = 0.6 * k;
      s.mesh.position.y = s.y0 + 0.3 * k;
    }
  }
  E.goalOrb.rotation.y = t * 2;
}
