// Dibujo de los robots nuevos (escudero, bomba, araña, toro, láser y dron de apoyo) y de sus efectos: rayo del láser,
// hilo de la araña y campo del dron de apoyo. Las piezas son mallas instanciadas por tipo, así que cada tipo cuesta
// unas pocas llamadas de dibujo. La lógica está en bots.js
import * as THREE from 'three';
import { UNIT_BOX, UNIT_CONE, UNIT_CYL, UNIT_SPHERE } from './geo.js';
import { ACCENT } from './backdrop.js';
import { BOT_TYPES, beamOf } from './bots.js';

const STEEL = 0x3b434c, DARK = 0x2a2f36, LIGHT = 0x9aa3ab, BONE = 0xf0e6d2;
const solid = (color, roughness = 0.5, metalness = 0.35) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const lamp = () => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });   // el color lo da cada instancia

// Piezas de cada robot, en coordenadas locales (y = 0 en el suelo; mira hacia +x). Una pieza tiene forma (geo), tamaño,
// posición (at), giro fijo (rot) y color. Con lamp, el color va por instancia (tint, si cambia con el tiempo).
// anim(e, t) puede devolver { p: [x,y,z], r: [x,y,z] } para mover o girar la pieza en cada fotograma
function parts(type, acc) {
  switch (type) {
    case 'shield': return [
      { geo: UNIT_BOX, size: [0.9, 0.55, 0.8], at: [0, 0.42, 0], color: STEEL },
      { geo: UNIT_BOX, size: [0.1, 0.8, 0.95], at: [0.52, 0.45, 0], color: acc },                     // escudo frontal
      { geo: UNIT_SPHERE, size: [0.22, 0.22, 0.22], at: [0.05, 0.85, 0], color: LIGHT },
      { geo: UNIT_SPHERE, size: [0.07, 0.07, 0.07], at: [0.22, 0.88, 0.12], color: 0xffea00, lamp: true },
      ...[[-0.25, 0.44], [-0.25, -0.44], [0.25, 0.44], [0.25, -0.44]].map(([x, z]) =>
        ({ geo: UNIT_CYL, size: [0.18, 0.1, 0.18], at: [x, 0.18, z], rot: [Math.PI / 2, 0, 0], color: DARK })),   // ruedas
    ];
    case 'bomb': return [
      { geo: UNIT_SPHERE, size: [0.42, 0.42, 0.42], at: [0, 0.42, 0], color: DARK },
      { geo: UNIT_CYL, size: [0.16, 0.12, 0.16], at: [0, 0.86, 0], color: LIGHT },                    // tapa
      { geo: UNIT_SPHERE, size: [0.11, 0.11, 0.11], at: [0.38, 0.52, 0], color: 0x551111, lamp: true,
        tint: (e, t) => (e.st === 'fuse' && Math.floor(t * (8 + 20 * (1.3 - e.fuse))) % 2 === 0 ? 0xff2a2a : 0x551111) },   // luz que parpadea
      { geo: UNIT_SPHERE, size: [0.07, 0.07, 0.07], at: [0, 1.0, 0], color: 0xffcc33, lamp: true,   // mecha
        tint: (e, t) => (e.st === 'fuse' ? (Math.sin(t * 40) > 0 ? 0xffe066 : 0xff8800) : 0x553300) },
    ];
    case 'spider': {
      const legs = [];
      for (let i = 0; i < 8; i++) {
        const side = i < 4 ? 1 : -1, k = i % 4;
        legs.push({ geo: UNIT_BOX, size: [0.07, 0.8, 0.07], at: [(k - 1.5) * 0.2, 0.3, side * 0.3], rot: [side * 0.9, 0, 0.7 - k * 0.45], color: DARK,
          anim: (e, t) => ({ r: [0, 0, Math.sin(t * 9 + e.phase + k) * 0.18] }) });
      }
      return [
        { geo: UNIT_SPHERE, size: [0.3, 0.3, 0.3], at: [0, 0.5, 0], color: DARK },
        { geo: UNIT_SPHERE, size: [0.06, 0.06, 0.06], at: [0.25, 0.6, 0.1], color: 0xff3b1f, lamp: true },
        { geo: UNIT_SPHERE, size: [0.06, 0.06, 0.06], at: [0.25, 0.6, -0.1], color: 0xff3b1f, lamp: true },
        ...legs,
      ];
    }
    case 'charger': return [
      { geo: UNIT_BOX, size: [0.65, 0.42, 0.85], at: [0, 0.62, 0], color: STEEL },
      { geo: UNIT_BOX, size: [0.7, 0.07, 0.3], at: [0, 0.9, 0], color: acc },                          // franja de color
      { geo: UNIT_BOX, size: [0.45, 0.36, 0.6], at: [0.62, 0.52, 0], color: LIGHT,                     // cabeza: baja al embestir
        anim: (e) => ({ r: [0, 0, e.st === 'windup' || e.st === 'charge' ? -0.35 : 0] }) },
      { geo: UNIT_CONE, size: [0.07, 0.36, 0.07], at: [0.78, 0.9, 0.2], rot: [0, 0, -0.4], color: BONE },
      { geo: UNIT_CONE, size: [0.07, 0.36, 0.07], at: [0.78, 0.9, -0.2], rot: [0, 0, -0.4], color: BONE },
      { geo: UNIT_SPHERE, size: [0.07, 0.07, 0.07], at: [0.86, 0.6, 0.13], color: 0xff3b1f, lamp: true,
        tint: (e) => (e.st === 'windup' || e.st === 'charge' ? 0xff2a1a : 0x661111) },
      { geo: UNIT_SPHERE, size: [0.07, 0.07, 0.07], at: [0.86, 0.6, -0.13], color: 0xff3b1f, lamp: true,
        tint: (e) => (e.st === 'windup' || e.st === 'charge' ? 0xff2a1a : 0x661111) },
      ...[[0.3, 0.3], [0.3, -0.3], [-0.3, 0.3], [-0.3, -0.3]].map(([x, z]) =>
        ({ geo: UNIT_BOX, size: [0.14, 0.42, 0.14], at: [x, 0.2, z], color: DARK })),
    ];
    case 'laser': return [
      { geo: UNIT_CYL, size: [0.38, 0.35, 0.38], at: [0, 0.18, 0], color: DARK },                      // base
      { geo: UNIT_CYL, size: [0.1, 0.9, 0.1], at: [0, 0.85, 0], color: LIGHT },                        // poste
      { geo: UNIT_BOX, size: [0.7, 0.26, 0.3], at: [0, 1.5, 0], color: STEEL,                          // cabeza: apunta el rayo
        anim: (e) => ({ r: [0, 0, e.ang] }) },
      { geo: UNIT_SPHERE, size: [0.12, 0.12, 0.12], at: [0, 1.5, 0], color: 0xff2a2a, lamp: true,    // lente
        anim: (e) => ({ p: [0.36 * Math.cos(e.ang), 0.36 * Math.sin(e.ang), 0], r: [0, 0, 0] }) },
    ];
    case 'support': return [
      { geo: UNIT_CYL, size: [0.5, 0.14, 0.5], at: [0, 0, 0], color: STEEL },                          // disco
      { geo: UNIT_SPHERE, size: [0.26, 0.26, 0.26], at: [0, 0.16, 0], color: acc },                    // cúpula de color
      { geo: UNIT_BOX, size: [0.9, 0.03, 0.12], at: [0, 0.3, 0], color: DARK,                          // hélice
        anim: (e, t) => ({ r: [0, t * 22 + e.phase, 0] }) },
      { geo: UNIT_CYL, size: [0.36, 0.02, 0.36], at: [0, -0.12, 0], color: 0x39e6ff, lamp: true },    // emisor del campo
    ];
    default: return [];
  }
}

// Matrices: escala y giro del conjunto, posición y giro de cada pieza
const _root = new THREE.Matrix4(), _loc = new THREE.Matrix4(), _tmp = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function trs(out, x, y, z, rx, ry, rz, sx, sy, sz) {
  _v.set(x, y, z); _q.setFromEuler(_eu.set(rx, ry, rz)); _s.set(sx, sy, sz);
  return out.compose(_v, _q, _s);
}

// Crea las mallas de los robots de este nivel (una malla instanciada por pieza y tipo)
export function buildRobots(lv, zi, root) {
  const acc = ACCENT[zi];
  const R = { lv, groups: [], thread: null, spiders: [], beam: null, lasers: [], halo: null };
  for (const type of BOT_TYPES) {
    const list = lv.enemies.filter((e) => e.type === type);
    if (!list.length) continue;
    const pieces = parts(type, acc).map((d) => {
      const im = new THREE.InstancedMesh(d.geo, d.lamp ? lamp() : solid(d.color), list.length);
      im.count = list.length; im.frustumCulled = false; im.castShadow = !d.lamp;
      if (d.lamp) list.forEach((_, k) => im.setColorAt(k, _c.setHex(d.color)));
      root.add(im);
      return { d, im };
    });
    R.groups.push({ list, pieces });
  }
  R.spiders = lv.enemies.filter((e) => e.type === 'spider');
  if (R.spiders.length) {
    R.thread = new THREE.InstancedMesh(UNIT_BOX, solid(0x20242a, 0.6, 0.2), R.spiders.length);
    R.thread.count = R.spiders.length; R.thread.frustumCulled = false;
    root.add(R.thread);
  }
  R.lasers = lv.enemies.filter((e) => e.type === 'laser');
  if (R.lasers.length) {
    R.beam = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }), R.lasers.length);
    R.beam.count = R.lasers.length; R.beam.frustumCulled = false;
    root.add(R.beam);
  }
  R.halo = new THREE.InstancedMesh(new THREE.SphereGeometry(1.05, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }), Math.max(1, lv.enemies.length));
  R.halo.count = 0; R.halo.frustumCulled = false;
  root.add(R.halo);
  return R;
}

// Un fotograma: posiciones, giros y colores de los robots, rayos, hilos y campos
export function updateRobots(R, t) {
  for (const g of R.groups) {
    g.list.forEach((e, k) => {
      const face = e.face ?? e.dir ?? 1, sc = e.alive ? 1 : 0;
      trs(_root, e.x, e.y, 0, 0, face < 0 ? Math.PI : 0, 0, sc, sc, sc);
      for (const { d, im } of g.pieces) {
        const a = d.anim ? d.anim(e, t) : null;
        const p = a?.p ?? [0, 0, 0], r = a?.r ?? [0, 0, 0], rot = d.rot ?? [0, 0, 0];
        trs(_loc, d.at[0] + p[0], d.at[1] + p[1], d.at[2] + p[2], rot[0] + r[0], rot[1] + r[1], rot[2] + r[2], ...d.size);
        im.setMatrixAt(k, _tmp.multiplyMatrices(_root, _loc));
        if (d.lamp) im.setColorAt(k, _c.setHex(d.tint ? d.tint(e, t) : d.color));
      }
    });
    for (const { im } of g.pieces) {
      im.count = g.list.length; im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  // Hilos de las arañas: desde el techo hasta la cabeza (se recogen al caer)
  if (R.thread) {
    R.spiders.forEach((e, k) => {
      const len = e.st === 'hang' && e.alive ? Math.max(0, e.ceilY - e.y - 0.3) : 0;
      trs(_loc, e.x, e.y + 0.3 + len / 2, 0, 0, 0, 0, 0.025, Math.max(len, 0.001), 0.025);
      R.thread.setMatrixAt(k, _loc);
    });
    R.thread.instanceMatrix.needsUpdate = true;
  }
  // Rayos de los láseres: se cortan en el primer bloque de piedra
  if (R.beam) {
    R.lasers.forEach((e, k) => {
      const b = beamOf(e, R.lv), len = e.alive ? b.len : 0;
      trs(_loc, b.ox + b.dx * len / 2, b.oy + b.dy * len / 2, 0, 0, 0, Math.atan2(b.dy, b.dx), Math.max(len, 0.001), 0.09, 0.09);
      R.beam.setMatrixAt(k, _loc);
    });
    R.beam.instanceMatrix.needsUpdate = true;
  }
  // Campo de escudo: un halo sobre cada enemigo que protege un dron de apoyo
  let n = 0;
  for (const e of R.lv.enemies) {
    if (!e.shielded || !e.alive) continue;
    R.halo.setMatrixAt(n++, trs(_loc, e.x, e.y + 0.5, 0, 0, 0, 0, 1, 1, 1));
  }
  R.halo.count = n; R.halo.instanceMatrix.needsUpdate = true;
}
