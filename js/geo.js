// Geometría compartida y ayudantes para crear mallas
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const h1 = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

// Tamaño (en unidades de x) de los tramos que se muestran u ocultan según la posición del jugador
export const CHUNK = 120;

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 14);
export const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 14);
export const UNIT_CONE = new THREE.ConeGeometry(1, 1, 10);
export const RING_GEO = new THREE.TorusGeometry(0.34, 0.09, 10, 20);
export const LIMB_GEO = new THREE.CapsuleGeometry(0.1, 0.26, 4, 10);

// Desplaza los vértices de forma determinista: roca y follaje con forma irregular
function lumpy(geo, amp, sy = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * (h1(x * 12.9898 + y * 78.233 + z * 37.719) - 0.5) * 2;
    p.setXYZ(i, x * k, y * k * sy, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}
// Mallas con vértices compartidos: así el sombreado es suave y no facetado
export const ROCK_GEO = lumpy(mergeVertices(new THREE.IcosahedronGeometry(1, 2)), 0.22, 0.85);
export const LUMP_GEO = lumpy(mergeVertices(new THREE.IcosahedronGeometry(1, 2)), 0.18);

// Brizna de hierba: triángulos curvados de 0.6 de alto (base en y = 0)
export const BLADE_GEO = (() => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0, 0.05, 0, 0, -0.032, 0.3, 0.01, 0.032, 0.3, 0.01, 0, 0.6, 0.03], 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  geo.computeVertexNormals();
  return geo;
})();

// Plano de corte: se ve la mitad lejana de los tubos (la cercana se quita para ver al erizo)
export const CUT_PLANES = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.3)];

export const SHARED_GEO = new Set([UNIT_BOX, UNIT_SPHERE, UNIT_CYL, UNIT_CONE, RING_GEO, LIMB_GEO, BLADE_GEO, ROCK_GEO, LUMP_GEO]);

// Malla con geometría dada; sx, sy, sz son escalas
export function mesh(parent, geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function addBox(parent, mat, x, y, z, sx, sy, sz) { return mesh(parent, UNIT_BOX, mat, x, y, z, sx, sy, sz); }
// Cilindro vertical (o horizontal a lo largo de x si alongX)
export function cyl(parent, mat, x, y, z, r, len, alongX = false) {
  const m = mesh(parent, UNIT_CYL, mat, x, y, z, r, len, r);
  if (alongX) m.rotation.z = Math.PI / 2;
  return m;
}
// Prisma extruido en z a partir de un polígono en XY
export function prism(parent, pts, zStart, depth, mat) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, zStart);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// Forma de lente (saliente de roca): base plana y lomo curvo
export function lensShape(x0, x1, base, h, extra = 0.6) {
  const s = new THREE.Shape();
  s.moveTo(x0 - extra, base);
  s.quadraticCurveTo((x0 + x1) / 2, base + h * 2.4, x1 + extra, base);
  s.lineTo(x0 - extra, base);
  return s;
}
export function extrudeZ(parent, shape, zStart, depth, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, zStart);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// Franja de malla entre dos líneas de muestras (cada muestra aporta dos vértices a y b)
export function strip(pairs, uvs) {
  const geo = new THREE.BufferGeometry();
  const pos = [], idx = [];
  pairs.forEach(([a, b]) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z));
  for (let i = 0; i < pairs.length - 1; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// Malla instanciada: items = [{ x, y, z, rx, ry, rz, sx, sy, sz, color }]
export function instanced(parent, geo, mat, items) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0);
    q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    s.set(it.sx ?? 1, it.sy ?? it.sx ?? 1, it.sz ?? it.sx ?? 1);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (it.color !== undefined) im.setColorAt(i, c.set(it.color));
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = true;
  parent.add(im);
  return im;
}
