// Pista: suelo, rampas, muelles, piedras, salientes, plataformas, puentes, hierba, tubos, señales y galerías
import * as THREE from 'three';
import { FILE, canvasTex, tiled } from './textures.js';
import { mulberry32 } from './util.js';
import { BLADE_GEO, CUT_PLANES, ROCK_GEO, UNIT_CONE, UNIT_CYL, UNIT_SPHERE, addBox, cyl, extrudeZ, instanced, lensShape, mesh, prism } from './geo.js';
import { laneY, pathAt, pathZ, slopeAt, TUBE_R } from './level.js';

// Colores de acento y de la galería (los mismos que en backdrop.js)
const ACCENT_HEX = [0xffd24a, 0xff9800, 0x00e5ff];
const WALL_HEX = [0x6b6358, 0x4c525b];     // pared de fondo de la galería
const RIB_HEX = [0xc6ff6b, 0x9fb3c8, 0x7dffc4];      // anillos y bridas del tubo (no se confunden con los anillos dorados)
const CRYSTAL_HEX = [0x7dffb0, 0x5ce1ff, 0x7dffc4];  // cristales de la galería
const FLOOR_HEX = [0x8c8474, 0x9aa4ae];    // suelo de la galería
const SPIKE_HEX = [0xc9d2da, 0xa8b2bc, 0xff7a5c];   // pinchos: acero en verde e industrial, coral en la zona acuática
const WATER_HEX = [0x3a9ee0, 0x2f8fd8, 0x2a9ee8];   // agua de los huecos

// Hierba 3D: briznas instanciadas y, opcionalmente, flores
export function addGrass(G, surfs, density, rnd, flowers) {
  const pts = [];
  for (const s of surfs) {
    const n = Math.floor((s.x1 - s.x0) * density);
    for (let i = 0; i < n; i++) {
      const x = s.x0 + rnd() * (s.x1 - s.x0), z = s.z0 + rnd() * (s.z1 - s.z0);
      pts.push([x, s.y(x), z]);
    }
  }
  if (!pts.length) return;
  const items = [];
  for (const [x, y, z] of pts) {
    for (let b = 0; b < 3; b++) {
      items.push({
        x: x + (rnd() - 0.5) * 0.25, y, z: z + (rnd() - 0.5) * 0.6,
        rx: (rnd() - 0.5) * 0.4, ry: rnd() * Math.PI * 2, rz: (rnd() - 0.5) * 0.4,
        sx: 1, sy: 0.7 + rnd() * 0.7, sz: 1,
        color: new THREE.Color().setHSL(0.25 + (rnd() - 0.5) * 0.05, 0.5 + rnd() * 0.25, 0.22 + rnd() * 0.2).getHex(),
      });
    }
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  instanced(G, BLADE_GEO, mat, items);
  if (flowers) {
    const cols = [0xffffff, 0xffd54a, 0xff7aa8, 0xc58cff];
    const F = Math.max(1, Math.floor(pts.length * 0.12));
    const fl = [];
    for (let i = 0; i < F; i++) {
      const [x, y, z] = pts[Math.floor(rnd() * pts.length)];
      fl.push({ x, y: y + 0.2, z, sx: 0.012, sy: 0.4, sz: 0.012, color: 0x3f8f3a });
    }
    instanced(G, UNIT_CYL, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), fl);
    const heads = [];
    for (let i = 0; i < F; i++) {
      const [x, y, z] = pts[Math.floor(rnd() * pts.length)];
      heads.push({ x, y: y + 0.43, z, sx: 0.07, color: cols[Math.floor(rnd() * cols.length)] });
    }
    instanced(G, UNIT_SPHERE, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), heads);
  }
}

// Engranaje: disco con dientes en el plano XY (gira alrededor de z)
function buildGear(mat) {
  const gear = new THREE.Group();
  const disc = new THREE.Mesh(UNIT_CYL, mat);
  disc.scale.set(0.62, 0.3, 0.62); disc.rotation.x = Math.PI / 2;
  gear.add(disc);
  for (let k = 0; k < 10; k++) {
    const th = (k / 10) * Math.PI * 2;
    const tooth = addBox(gear, mat, Math.cos(th) * 0.7, Math.sin(th) * 0.7, 0, 0.22, 0.22, 0.3);
    tooth.rotation.z = th;
  }
  return gear;
}

// Tubo: sección circular de radio TUBE_R alrededor de la trayectoria (plana en XY).
// Se construye con la normal de la trayectoria para que no se retuerza; se ve por dentro (BackSide)
// y el plano de corte quita la mitad cercana. Los anillos de refuerzo y las bridas quedan completos.
export function buildTube(pt, T, G, zi) {
  if (pt.loop) return buildLoopTrack(pt, T, G, zi);
  const SEG = 24;
  const n = pt.pts.length;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pt.pts[i], [nx, ny] = pt.N[i];
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(px + nx * TUBE_R * c, py + ny * TUBE_R * c, TUBE_R * s);
      nrm.push(nx * c, ny * c, s);
      uv.push(pt.cum[i] / 10, j / SEG);       // una repetición cada 10 unidades: cuadros de 2.5
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + SEG + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  // Las cuevas secretas se cortan también a ras de la pista: la boca del tubo no asoma sobre la hierba y no las delata
  const clip = pt.top !== undefined ? [...CUT_PLANES, new THREE.Plane(new THREE.Vector3(0, -1, 0), pt.top - 0.05)] : CUT_PLANES;
  // Flechas de luz que recorren el tubo hacia la salida (su textura se desplaza en updateWorld)
  const mat = new THREE.MeshStandardMaterial({
    map: T.tube, side: THREE.BackSide, roughness: 0.5, metalness: 0.15,
    emissive: new THREE.Color(ACCENT_HEX[zi]), emissiveMap: T.tubeFlow, emissiveIntensity: 1.1, clippingPlanes: clip,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  G.add(m);

  // Anillos de refuerzo a lo largo del tubo y bridas en las dos bocas
  const rib = new THREE.Color(RIB_HEX[zi]);
  const ringM = new THREE.MeshStandardMaterial({ color: rib, emissive: rib, emissiveIntensity: 0.2, metalness: 0.6, roughness: 0.3, clippingPlanes: pt.top !== undefined ? clip : null });
  const count = Math.max(3, Math.round(pt.L / 2.2));
  const ribs = new THREE.InstancedMesh(new THREE.TorusGeometry(TUBE_R, 0.09, 8, 40), ringM, count);
  const flanges = new THREE.InstancedMesh(new THREE.TorusGeometry(TUBE_R + 0.3, 0.2, 8, 40), ringM, 2);
  const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mtx = new THREE.Matrix4();
  const place = (im, i, s) => {
    const r = pathAt(pt, s);
    p.set(r.P[0], r.P[1], 0);
    q.setFromUnitVectors(Z, new THREE.Vector3(r.T[0], r.T[1], 0));   // el anillo queda perpendicular al tubo
    im.setMatrixAt(i, mtx.compose(p, q, one));
  };
  for (let i = 0; i < count; i++) place(ribs, i, pt.L * (i + 0.5) / count);
  place(flanges, 0, 0); place(flanges, 1, pt.L);
  ribs.instanceMatrix.needsUpdate = true; flanges.instanceMatrix.needsUpdate = true;
  G.add(ribs, flanges);
  return m;
}

// Bucle: pista abierta (una cinta) que da la vuelta, como en los Sonic clásicos. Su sección es un rectángulo: la cara
// interior (por donde rueda el erizo) es pista, el canto de delante y el de detrás llevan cuadros y dos raíles de luz
// marcan los bordes. La cinta se desplaza en z a lo largo del lazo (pathZ) para que la entrada y la salida no se crucen
const LOOP_HW = 1.05, LOOP_TH = 0.8;      // media anchura de la cinta y grosor
function buildLoopTrack(pt, T, G, zi) {
  const n = pt.pts.length;
  // Barrido de una sección (lista de puntos [n, z] relativos: n hacia el centro del lazo, z en profundidad) por el lazo
  const sweep = (sec, uvOf, closed = false) => {
    const pos = [], nrm = [], uv = [], idx = [];
    const edges = closed ? sec.length : sec.length - 1;
    for (let e = 0; e < edges; e++) {
      const a = sec[e], b = sec[(e + 1) % sec.length];
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const [px, py] = pt.pts[i], [nx, ny] = pt.N[i], zc = pathZ(pt, pt.cum[i]);
        for (const [k, q] of [[0, a], [1, b]]) {
          pos.push(px + nx * q[0], py + ny * q[0], zc + q[1]);
          // Normal de la cara: perpendicular a la arista (a→b) dentro de la sección
          const dn = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dn, dz) || 1;
          const fn = -dz / L, fz = dn / L;
          nrm.push(nx * fn, ny * fn, fz);
          uv.push(...uvOf(pt.cum[i], k, e));
        }
        if (i < n - 1) { const v = base + i * 2; idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  };
  const hw = LOOP_HW, th = LOOP_TH, lift = 0.03;
  const clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -(pt.y0 - 0.02))];   // nada de la cinta asoma bajo la pista
  // Cara interior (pista): de delante a detrás, mirando al centro del lazo
  const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, 1, 1), roughness: 0.8, side: THREE.DoubleSide, clippingPlanes: clip });
  const top = new THREE.Mesh(sweep([[lift, hw], [lift, -hw]], (c, k) => [c / 4, k]), topM);
  // Cantos de cuadros (delante y detrás) y cara exterior
  const checkM = new THREE.MeshStandardMaterial({ map: checkerTex(zi), roughness: 0.75, side: THREE.DoubleSide, clippingPlanes: clip });
  const sides = new THREE.Mesh(sweep([[lift, -hw], [-th, -hw], [-th, hw], [lift, hw]], (c, k) => [c / 0.8, k]), checkM);
  // Raíles de luz en los dos bordes de la pista
  const railM = new THREE.MeshBasicMaterial({ color: ACCENT_HEX[zi], toneMapped: false, side: THREE.DoubleSide, clippingPlanes: clip });
  const rail = (zs) => sweep([[lift + 0.13, zs - 0.07], [lift, zs - 0.07], [lift, zs + 0.07], [lift + 0.13, zs + 0.07]], () => [0, 0], true);
  const rails = [new THREE.Mesh(rail(hw), railM), new THREE.Mesh(rail(-hw), railM)];
  for (const m of [top, sides]) { m.castShadow = true; m.receiveShadow = true; }
  G.add(top, sides, ...rails);
  return top;
}

// Señal de bajada: poste de acero y placa con una flecha hacia abajo
function buildSign(G, x, y, T) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.4, metalness: 0.7 });
  addBox(G, steel, x, y + 1.1, 0.2, 0.14, 2.2, 0.14);
  const plateM = new THREE.MeshStandardMaterial({ map: T.arrowDown, emissive: 0xffffff, emissiveMap: T.arrowDown, emissiveIntensity: 0.35, roughness: 0.6 });
  const plate = mesh(G, new THREE.PlaneGeometry(1.5, 1.5), plateM, x, y + 2.5, 0.25);
  plate.castShadow = false;
}

// Galería bajo la pista: pared de fondo, cristales en el suelo, estalactitas bajo la losa y lámparas
function buildGallery(gl, T, zi, chunkOf) {
  const G = chunkOf(gl.xs);
  const x0 = gl.xs, x1 = gl.xr + gl.w, bottom = gl.yF - 8;
  const rnd = mulberry32(Math.round(gl.xs * 7) + zi * 101);
  const wallM = new THREE.MeshStandardMaterial({ map: tiled(zi === 1 ? T.side : T.rock, (x1 - x0) / 6, 2), color: WALL_HEX[zi], roughness: 1 });
  addBox(G, wallM, (x0 + x1) / 2, (bottom + gl.top) / 2, -1.9, x1 - x0, gl.top - bottom, 0.4);

  // Entre los pozos: cristales en el suelo y estalactitas bajo la losa
  const inX0 = gl.xs + gl.w + 1, inX1 = gl.xr - 1, span = inX1 - inX0;
  const crystalM = new THREE.MeshStandardMaterial({ color: CRYSTAL_HEX[zi], emissive: CRYSTAL_HEX[zi], emissiveIntensity: 0.9, roughness: 0.3 });
  const stalM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, 1, 1), color: 0x8a8478, roughness: 1 });
  const crystals = [], stalactites = [];
  for (let i = 0; i < Math.round(span / 4); i++) {
    const h = 0.6 + rnd() * 0.8;
    crystals.push({ x: inX0 + rnd() * span, y: gl.yF + h / 2, z: -1.2 - rnd() * 0.4, sx: 0.26, sy: h, sz: 0.26, rz: (rnd() - 0.5) * 0.5 });
  }
  for (let i = 0; i < Math.round(span / 5); i++) {
    const h = 0.8 + rnd() * 1.2;
    stalactites.push({ x: inX0 + rnd() * span, y: gl.top - 4 - h / 2, z: -1.0 - rnd() * 0.5, sx: 0.3 + rnd() * 0.2, sy: h, sz: 0.3, rx: Math.PI });
  }
  instanced(G, UNIT_CONE, crystalM, crystals);
  instanced(G, UNIT_CONE, stalM, stalactites);
  const lampM = new THREE.MeshBasicMaterial({ color: ACCENT_HEX[zi] });
  for (const f of [0.3, 0.7]) mesh(G, UNIT_SPHERE, lampM, inX0 + span * f, gl.yF + 2.6, -1.7, 0.22).castShadow = false;
}

// Tubo secreto dentro de la tierra: una cara de tierra detrás del tubo y otra delante, con un hueco con la forma del
// tubo y la boca de la losa rota. Así el tubo se ve atravesando la tierra y no una sala abierta
function buildCave(c, T, zi, chunkOf) {
  const BOTTOM = -18, w = c.x1 - c.x0, h = c.top - BOTTOM, cx = (c.x0 + c.x1) / 2, cy = (c.top + BOTTOM) / 2, G = chunkOf(cx);   // la tierra baja hasta 18: bajo el tubo profundo (15)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tiled(T.side, w / 4, h / 4), color: 0x9a9086, roughness: 1 }));
  back.position.set(cx, cy, -1.9);
  G.add(back);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tiled(T.side, w / 4, h / 4), alphaMap: caveHoles(c, BOTTOM), alphaTest: 0.5, roughness: 0.95 }));
  front.position.set(cx, cy, 2.05);
  G.add(front);
}

// Mapa de transparencia de la cara de delante: negro donde pasa el tubo (su trazo, de radio TUBE_R) y en la boca de la
// losa rota; el resto es tierra
function caveHoles(c, bottom) {
  const PPU = 16, W = Math.ceil((c.x1 - c.x0) * PPU), H = Math.ceil((c.top - bottom) * PPU);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2 * TUBE_R * PPU; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  c.path.pts.forEach(([x, y], i) => { const px = (x - c.x0) * PPU, py = (c.top - y) * PPU; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.fillRect((c.gap[0] - c.x0) * PPU, 0, (c.gap[1] - c.gap[0]) * PPU, 0.6 * PPU);
  return new THREE.CanvasTexture(cv);
}

// Disco de cuadros detrás de cada bucle (una pared que asienta el lazo sobre el suelo)
const CHECK_HEX = [[0x8d6a43, 0xc9a66b], [0x4a5058, 0x6e7782], [0xb89c6c, 0xe6d3a4]];   // dos tonos de cuadros por zona
const RIM_HEX = [0x4f9a35, 0x3b4149, 0x7d6a58];                                          // canto: hierba, acero o roca
const ARCH_Z = -2.75, ARCH_D = 0.9;     // la pared va detrás de la cinta del bucle (que llega hasta z = -2.05)
const checkers = new Map();
function checkerTex(zi) {
  if (!checkers.has(zi)) {
    const [a, b] = CHECK_HEX[zi];
    const t = canvasTex(128, (g, s) => {
      g.fillStyle = `#${a.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, s, s);
      g.fillStyle = `#${b.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(0.5, 0.5);                           // un cuadro cada unidad
    checkers.set(zi, t);
  }
  return checkers.get(zi);
}
function buildLoopFrame(pt, zi, T, G) {
  const { cx, cy, R } = pt.loop;
  // Pared de cuadros detrás del lazo, en sombra, para que la cinta del bucle destaque delante; llega hasta el suelo
  const Ro = R + LOOP_TH + 0.55, a0 = Math.asin(-R / Ro);
  const shape = new THREE.Shape();
  shape.moveTo(Ro * Math.cos(a0), Ro * Math.sin(a0));
  shape.absarc(0, 0, Ro, a0, Math.PI - a0, false);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ARCH_D - 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2, curveSegments: 72,
  });
  const cap = new THREE.MeshStandardMaterial({ map: checkerTex(zi), color: 0x8c8c8c, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: RIM_HEX[zi], roughness: 0.9 });
  const m = new THREE.Mesh(geo, [cap, rim]);
  m.position.set(cx, cy, ARCH_Z + 0.15);                 // el bisel asoma 0.15 por delante y por detrás
  m.receiveShadow = true;
  G.add(m);
}

// Franja de aceleración: flechas luminosas que corren hacia delante (world.js desplaza las texturas de lv.flows)
function addBoostPad(lv, G, T, cx, top, w) {
  const map = tiled(T.chevron, w / 4, 1), em = tiled(T.chevron, w / 4, 1);
  const chev = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 1.1, roughness: 0.4 });
  addBox(G, chev, cx, top + 0.03, 0, w, 0.06, 2.6);
  lv.flows = lv.flows || [];
  lv.flows.push(map, em);
}

// Construye la pista en los grupos de cada tramo (chunkOf devuelve el grupo de una coordenada x)
export function buildLane(lv, zi, T, chunkOf) {
  const S = lv.solids;
  const rnd = mulberry32(lv.zone * 977 + lv.act * 31 + 5);
  const grass = new Map();                       // grupo -> superficies con hierba
  const addGrassSurf = (G, surf) => {
    if (!grass.has(G)) grass.set(G, []);
    grass.get(G).push(surf);
  };
  const woodTex = FILE.wood || T.plank;

  const supports = (G, s, mat) => {               // columnas detrás de la pista, solo donde hay suelo
    for (const px of [s.x0 + 0.5, s.x1 - 0.5]) {
      const gy = laneY(S, px);
      if (gy > -1 && gy < s.y0 - 0.2) addBox(G, mat, px, (gy + s.y0) / 2, -1.2, 0.55, s.y0 - gy, 0.55);
    }
  };

  for (const s of S) {
    if (s.kind === 'ground') {
      const w = s.x1 - s.x0, top = s.y1, cx = (s.x0 + s.x1) / 2, G = chunkOf(cx);
      if (s.gallery) {
        // Suelo de galería: roca (verde) o acero (industrial), sin hierba
        const floorM = new THREE.MeshStandardMaterial({ map: tiled(zi === 1 ? T.plank : T.rock, w / 4, 1), color: FLOOR_HEX[zi], roughness: 0.9 });
        addBox(G, floorM, cx, (s.y0 + top) / 2, 0, w, top - s.y0, 4);
        if (s.boost) addBoostPad(lv, G, T, cx, top, w);
        continue;
      }
      // La tierra queda 0.5 por debajo de la hierba para no compartir plano (evita destellos).
      // Una losa solo llega hasta 4 unidades bajo la superficie: debajo está la galería.
      // La losa agrietada (secreta) se ve como la pista, con unas grietas finas; sus mallas se ocultan al romperse
      const crack = !!s.crack;
      const bottom = s.thin ? top - 1.2 : s.slab || crack ? top - 4 : -18, yTop = top - 0.5;
      const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.side, w / 4, (yTop - bottom) / 4), roughness: 0.95 });
      // Bajo el agua la superficie es tierra, no hierba
      const topTex = s.wade ? T.side : T.top;
      const edgeM = new THREE.MeshStandardMaterial({ map: tiled(topTex, w / 4, 0.25), roughness: 0.9 });
      const topM = new THREE.MeshStandardMaterial({ map: tiled(topTex, w / 4, 1.1), roughness: 0.85 });
      const boxes = s.thin ? [] : [addBox(G, sideM, cx, (bottom + yTop) / 2, 0, w, yTop - bottom, 4)];   // la losa de una cueva no tapa el tubo
      boxes.push(addBox(G, [edgeM, edgeM, topM, sideM, edgeM, edgeM], cx, top - 0.25, 0, w, 0.5, 4.4));
      if (crack) {
        // Grietas finas con un leve brillo que late (world.js): una pista para quien se fija, sin señal que lo diga
        const seamM = new THREE.MeshStandardMaterial({ color: 0x3b2e22, emissive: ACCENT_HEX[zi], emissiveIntensity: 0, roughness: 1 });
        for (const f of [0.25, 0.7]) boxes.push(addBox(G, seamM, cx - w / 2 + w * f, top + 0.02, 0, 0.07, 0.03, 4.5));
        boxes.push(addBox(G, seamM, cx, top + 0.02, 0.6, w * 0.45, 0.03, 0.06));
        lv.glows = lv.glows || [];
        lv.glows.push(seamM);
        s.meshes = boxes;
      }
      if (s.boost) addBoostPad(lv, G, T, cx, top, w);
      else if (zi === 0 && !s.wade && !crack) {
        addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -2, z1: 2, y: () => top });
      }
    } else if (s.kind === 'slope') {
      const G = chunkOf((s.x0 + s.x1) / 2);
      const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.side, 0.25, 0.25), roughness: 0.95 });
      const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, 0.25, 0.25), roughness: 0.85 });
      // Un arco se dibuja con muestras de su curva cada 0.4; una rampa recta tiene solo dos (sus extremos)
      const N = s.arc ? Math.ceil((s.x1 - s.x0) / 0.4) : 1;
      const up = [], dn = [];
      for (let i = 0; i <= N; i++) {
        const x = s.x0 + (s.x1 - s.x0) * i / N, y = slopeAt(s, x);
        up.push([x, y]); dn.push([x, y - 0.5]);
      }
      dn.reverse();
      prism(G, [[s.x0, -18], [s.x1, -18], ...dn], -2, 4, sideM);
      prism(G, [...up, ...dn], -2.2, 4.4, topM);
      if (zi === 0) addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -2, z1: 2, y: (x) => slopeAt(s, x) });
    } else if (s.kind === 'spring') {
      const G = chunkOf(s.x0);
      const red = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.45 });
      const yel = new THREE.MeshStandardMaterial({ color: 0xffe53b, roughness: 0.35 });
      s.mesh = addBox(G, [red, red, yel, red, red, red], (s.x0 + s.x1) / 2, s.y0 + 0.3, 0, s.x1 - s.x0, 0.6, 1.4);
    } else if (s.kind === 'spikes') {
      // Pinchos: conos sobre una base oscura (no son sólidos: hacen daño al tocarlos)
      const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, G = chunkOf(cx);
      addBox(G, new THREE.MeshStandardMaterial({ color: 0x8b1e1e, roughness: 0.7 }), cx, s.y0 + 0.06, 0, w, 0.12, 2.4);
      const spikeM = new THREE.MeshStandardMaterial({ color: SPIKE_HEX[zi], metalness: zi === 2 ? 0 : 0.4, roughness: 0.3 });
      const n = Math.max(3, Math.round(w / 0.45));
      const items = [];
      for (let i = 0; i < n; i++) items.push({ x: s.x0 + (i + 0.5) * w / n, y: s.y0 + 0.55, z: 0, sx: 0.26, sy: 1.1, sz: 0.26 });
      instanced(G, UNIT_CONE, spikeM, items);
    } else if (s.kind === 'water') {
      // Agua de un hueco: lámina translúcida con su cara superior en el nivel del agua
      const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, G = chunkOf(cx);
      const waterM = new THREE.MeshStandardMaterial({ color: WATER_HEX[zi], transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 });
      addBox(G, waterM, cx, s.level - 0.25, 0, w, 0.5, 3.6);
    } else if (s.kind === 'block') {
      // Piedra sólida: se salta o se rodea
      const G = chunkOf((s.x0 + s.x1) / 2), w = s.x1 - s.x0, h = s.y1 - s.y0;
      const rockM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, w / 2, h / 2), roughness: 0.9 });
      const m = mesh(G, ROCK_GEO, rockM, (s.x0 + s.x1) / 2, s.y0 + h * 0.5, 0, w * 0.52, h * 0.55, 0.95);
      m.rotation.set(0.2, 0.7, 0.1);
    } else if (s.kind === 'ceiling') {
      // La losa de una galería tiene su techo en el suelo de la pista de arriba: no se dibuja aquí
      if (s.slabCeil) continue;
      // Saliente de roca sobre la pista: se pasa por debajo; pilares de roca detrás
      const G = chunkOf(s.x0);
      const rockM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, 1, 1), roughness: 0.95 });
      extrudeZ(G, lensShape(s.x0, s.x1, s.base + 2.8, 1.2, 0.8), -1.4, 2.8, rockM);
      for (const px of [s.x0 - 0.4, s.x1 + 0.4]) mesh(G, ROCK_GEO, rockM, px, s.base + 1.5, -1.9, 0.9, 3.0, 0.9);
    } else if (s.mover) {
      // Móvil: balsa de madera (verde y acuática) o cinta con engranajes (industrial)
      const G = chunkOf(s.base), w = s.w, h = s.y1 - s.y0;
      if (s.mtype === 'conveyor') {
        const steel = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.4, metalness: 0.7 });
        const topM = new THREE.MeshStandardMaterial({ map: tiled(T.platTop, w / 3, 1), roughness: 0.55 });
        s.mesh = addBox(G, [steel, steel, topM, steel, steel, steel], s.cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
        const track = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.6, metalness: 0.6 });
        addBox(G, track, s.base, s.y0 - 0.55, 0, s.amp * 2 + w + 2, 0.25, 1.4);
        const gl = buildGear(steel), gr = buildGear(steel);
        const gx = s.amp + w / 2 + 1.2;
        gl.position.set(s.base - gx, s.y0 - 0.55, 0); gr.position.set(s.base + gx, s.y0 - 0.55, 0);
        G.add(gl, gr);
        s.gears = [gl, gr];
        for (const p of [s.base - gx, s.base + gx]) {
          const gy = laneY(S, p);
          if (gy > -1 && gy < s.y0 - 0.55) addBox(G, steel, p, (gy + s.y0 - 0.55) / 2, -1.2, 0.35, s.y0 - 0.55 - gy, 0.35);
        }
      } else {
        const woodM = new THREE.MeshStandardMaterial({ map: tiled(woodTex, w / 3, h / 3), roughness: 0.8 });
        s.mesh = addBox(G, woodM, s.cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
      }
    } else if (s.kind === 'wall') {
      // Suelo, techo o muro de una cámara oculta: bloque de roca; con sup, pilares hasta la plataforma de abajo
      const cx = (s.x0 + s.x1) / 2, G = chunkOf(cx), w = s.x1 - s.x0, h = s.y1 - s.y0;
      const wallM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, w / 3, h / 3), roughness: 0.9 });
      const wallBox = addBox(G, wallM, cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
      if (s.breakable) s.meshes = [wallBox];
      if (s.sup) for (const px of [s.x0 + 0.5, s.x1 - 0.5]) addBox(G, wallM, px, (s.sup + s.y0) / 2, -1.2, 0.55, s.y0 - s.sup, 0.55);
    } else if (s.kind === 'platform') {
      const cx = (s.x0 + s.x1) / 2, w = s.x1 - s.x0, h = s.y1 - s.y0, G = chunkOf(cx);
      if (s.bridge) {
        // Puente: troncos (verde), pasarela de acero (industrial) o tablones con cuerdas (acuática)
        const deckM = new THREE.MeshStandardMaterial({ map: tiled(woodTex, w / 3, 1), roughness: 0.8 });
        if (s.bridge === 'logs') {
          const bark = new THREE.MeshStandardMaterial({ map: tiled(T.bark, w / 4, 1), roughness: 0.9 });
          for (const z of [-0.85, 0, 0.85]) cyl(G, bark, cx, s.y1 + 0.22, z, 0.3, w, true);
        } else if (s.bridge === 'steel') {
          const steel = new THREE.MeshStandardMaterial({ color: 0x7d8790, roughness: 0.45, metalness: 0.6 });
          addBox(G, steel, cx, s.y1 + 0.1, 0, w, 0.2, 2.2);
          addBox(G, steel, cx, s.y1 + 0.8, 1.1, w, 0.08, 0.08);
          addBox(G, steel, cx, s.y1 + 0.8, -1.1, w, 0.08, 0.08);
        } else {
          addBox(G, deckM, cx, s.y1 + 0.05, 0, w, 0.3, 2.2);
          const rope = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.9 });
          for (const z of [1.1, -1.1]) {
            const curve = new THREE.CatmullRomCurve3([
              new THREE.Vector3(s.x0 + 0.6, s.y1 + 1.1, z), new THREE.Vector3(cx, s.y1 + 0.4, z), new THREE.Vector3(s.x1 - 0.6, s.y1 + 1.1, z),
            ]);
            G.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.045, 6), rope));
          }
        }
        for (const px of [s.x0 + 0.6, s.x1 - 0.6]) addBox(G, deckM, px, s.y1 + 0.55, 1.2, 0.14, 1.1, 0.14);
      } else if (zi === 1) {
        // Plataforma de acero con pilares y remaches
        const side = new THREE.MeshStandardMaterial({ map: tiled(T.plank, w / 3, h / 3), roughness: 0.65 });
        const top = new THREE.MeshStandardMaterial({ map: tiled(T.platTop, w / 3, 1), roughness: 0.55 });
        addBox(G, [side, side, top, side, side, side], cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
        supports(G, s, side);
      } else {
        // Roca natural con hierba (verde) o arena (acuática), apoyada en el paisaje
        const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, w / 3, h / 3), roughness: 0.92 });
        const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, w / 3, 1), roughness: 0.85 });
        addBox(G, [sideM, sideM, topM, sideM, sideM, sideM], cx, (s.y0 + s.y1) / 2, 0, w, h, 2.6);
        supports(G, s, sideM);
        if (zi === 0 && !s.boost) addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -1.1, z1: 1.1, y: () => s.y1 });
      }
      if (s.boost) addBoostPad(lv, G, T, cx, s.y1, w);
    }
  }

  // Galerías y señales de bajada
  for (const gl of lv.galleries) buildGallery(gl, T, zi, chunkOf);
  for (const c of lv.caves) buildCave(c, T, zi, chunkOf);
  for (const pt of lv.paths) if (pt.loop) buildLoopFrame(pt, zi, T, chunkOf(pt.loop.cx));
  for (const pt of lv.paths) if (pt.kind === 'drop') buildSign(chunkOf(pt.x0 - 3), pt.x0 - 3, pt.y0 - 0.5, T);

  // Hierba: briznas sobre las superficies verdes (una malla por tramo)
  for (const [G, surfs] of grass) addGrass(G, surfs, 4, rnd, true);
}
