// Jugador: erizo azul con púas, guantes, zapatillas y ojos; modo bola al rodar o girar en el aire
import * as THREE from 'three';
import { LIMB_GEO, UNIT_CONE, UNIT_SPHERE, addBox, mesh } from './geo.js';
import { pathAt, pathZ } from './level.js';

const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const sph = (parent, mat, x, y, z, rx, ry = rx, rz = rx) => mesh(parent, UNIT_SPHERE, mat, x, y, z, rx, ry, rz);
// Púa: cono que apunta en la dirección (-sin a, cos a)
const spike = (parent, mat, cx, cy, r, len, a) => {
  const m = mesh(parent, UNIT_CONE, mat, cx, cy, 0, r, len, r);
  m.rotation.z = a;
  return m;
};

// Crea el modelo del jugador y lo añade a la escena; devuelve sus partes animables
export function buildPlayer(scene) {
  const PV = { runT: 0, air: 0 };
  const root = new THREE.Group();
  const lean = new THREE.Group();   // inclinación al correr / saltar
  const spin = new THREE.Group();   // giro al rodar o en el salto
  root.add(lean); lean.add(spin);
  PV.root = root; PV.lean = lean; PV.spin = spin;
  // Escudo: burbuja translúcida alrededor del erizo (solo visible con el escudo activo)
  PV.bubble = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), new THREE.MeshBasicMaterial({ color: 0x39e6ff, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }));
  PV.bubble.position.set(0, 0.45, 0); PV.bubble.visible = false; root.add(PV.bubble);

  const blue = std(0x1f63e0, 0.38);
  const blueD = std(0x0f49b5, 0.45);
  const skin = std(0xffd9ad, 0.6);
  const white = std(0xffffff, 0.25);
  const green = std(0x2bbf4a, 0.2);
  const black = std(0x0a0a0a, 0.3);
  const red = std(0xe0262b, 0.45);
  const shoeW = std(0xf4f4f4, 0.4);
  const sole = std(0x2f2f35, 0.7);
  const glove = std(0xffffff, 0.5);

  // Cuerpo y cabeza
  sph(spin, blue, -0.04, -0.08, 0, 0.42, 0.42, 0.4);
  const hx = 0.12, hy = 0.3;
  PV.head = sph(spin, blue, hx, hy, 0, 0.4, 0.37, 0.38);

  // Púas de la espalda (en abanico) y la parte baja
  PV.backSpikes = new THREE.Group(); spin.add(PV.backSpikes);
  for (const s of [{ a: 0.55, L: 0.78 }, { a: 0.95, L: 0.9 }, { a: 1.35, L: 0.84 }, { a: 1.75, L: 0.66 }]) {
    const d = s.L / 2 + 0.22;
    spike(PV.backSpikes, blue, 0, 0, 0.15, s.L, s.a).position.set(hx - Math.sin(s.a) * d, hy + Math.cos(s.a) * d, 0);
  }
  for (const s of [{ a: 2.25, L: 0.5 }, { a: 2.6, L: 0.4 }]) {
    const d = s.L / 2 + 0.3;
    spike(PV.backSpikes, blueD, 0, 0, 0.12, s.L, s.a).position.set(-Math.sin(s.a) * d, Math.cos(s.a) * d - 0.05, 0);
  }

  // Púas de bola (al rodar o en el salto): anillo radial alrededor del cuerpo
  PV.ballSpikes = new THREE.Group(); spin.add(PV.ballSpikes); PV.ballSpikes.visible = false;
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2;
    spike(PV.ballSpikes, blue, Math.cos(th) * 0.6, Math.sin(th) * 0.6, 0.12, 0.42, th - Math.PI / 2);
  }

  // Cara: hocico, ojos grandes y verdes
  PV.face = new THREE.Group(); spin.add(PV.face);
  sph(PV.face, skin, 0.3, 0.14, 0.12, 0.22, 0.17, 0.2);          // hocico
  sph(PV.face, white, 0.3, 0.4, 0.2, 0.15, 0.18, 0.11);          // ojo (blanco)
  sph(PV.face, green, 0.34, 0.4, 0.29, 0.1);                     // iris verde
  sph(PV.face, black, 0.37, 0.4, 0.36, 0.05);                    // pupila
  sph(PV.face, white, 0.4, 0.45, 0.39, 0.022);                   // brillo
  sph(PV.face, white, 0.2, 0.4, -0.14, 0.13, 0.16, 0.1);         // ojo lejano
  sph(PV.face, green, 0.23, 0.4, -0.06, 0.07);
  sph(PV.face, skin, 0.2, -0.16, 0.14, 0.2, 0.2, 0.2);           // pecho claro

  // Brazos (pivote en el hombro)
  PV.arms = [];
  for (const z of [0.3, -0.3]) {
    const pivot = new THREE.Group(); pivot.position.set(0.05, -0.08, z);
    const arm = new THREE.Mesh(LIMB_GEO, blue); arm.position.set(0, -0.17, 0);
    sph(pivot, glove, 0, -0.42, 0, 0.11);
    pivot.add(arm);
    PV.face.add(pivot);
    PV.arms.push(pivot);
  }

  // Piernas con zapatillas rojas y suela blanca (pivote en la cadera)
  PV.feet = [];
  for (const z of [0.12, -0.12]) {
    const pivot = new THREE.Group(); pivot.position.set(0, -0.36, z);
    addBox(pivot, red, 0.06, -0.12, 0, 0.46, 0.24, 0.36);
    addBox(pivot, shoeW, 0.08, -0.24, 0, 0.5, 0.06, 0.38);
    addBox(pivot, sole, 0.08, -0.28, 0, 0.52, 0.04, 0.4);
    sph(pivot, red, 0.24, -0.13, 0, 0.17, 0.14, 0.18);
    PV.face.add(pivot);
    PV.feet.push(pivot);
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(root);
  return PV;
}

// Animación de piernas, brazos e inclinación según el estado del jugador
function animatePlayer(PV, p, dt) {
  const sp = Math.min(1, Math.abs(p.vx) / 22);
  const running = p.grounded && !p.rolling && !p.crouch;
  if (running) PV.runT += dt * (5 + sp * 20);
  const sw = running ? Math.sin(PV.runT) * (0.3 + 0.5 * sp) : 0;

  PV.feet[0].rotation.z = p.grounded ? sw : -0.5;
  PV.feet[1].rotation.z = p.grounded ? -sw : -0.35;
  PV.arms[0].rotation.z = p.grounded ? sw * 0.8 - 0.1 : 2.3;
  PV.arms[1].rotation.z = p.grounded ? -sw * 0.8 - 0.1 : 2.0;
  if (p.crouch) { PV.arms[0].rotation.z = -0.9; PV.arms[1].rotation.z = -0.9; }

  // Inclinación del cuerpo y squash al agacharse
  let lean = 0;
  if (running) lean = -0.1 * sp;
  else if (!p.grounded) lean = p.vy > 0 ? -0.18 : 0.12;
  PV.lean.rotation.z += (lean - PV.lean.rotation.z) * (1 - Math.exp(-dt * 12));
  const ballCrouch = p.crouch && p.charge > 0.02;
  PV.lean.scale.set(1, p.crouch && !ballCrouch ? 0.74 : 1, 1);
  PV.lean.position.y = p.crouch && !ballCrouch ? -0.12 : ballCrouch ? -0.08 : 0;
}

// Coloca el modelo sobre la caja de colisión y aplica el giro, el modo bola y el parpadeo
export function updatePlayer(PV, p, t, dt) {
  const VS = 1.3;   // escala visual; los pies quedan sobre la caja de colisión
  // Profundidad: en un bucle sigue a la cinta (que se desplaza en z); fuera vuelve suave a la pista
  const z = p.path ? pathZ(p.path, p.s) : PV.root.position.z * Math.exp(-dt * 10);
  PV.root.position.set(p.x, p.y - 0.5 + 0.56 * VS, z);
  if (p.path) {                                           // en un tubo, los pies van sobre la trayectoria (sea cual sea su giro)
    const N = pathAt(p.path, p.s).N, k = 0.56 * VS - 0.5;
    PV.root.position.x += N[0] * k; PV.root.position.y += N[1] * k - k;
  }
  PV.root.scale.set(p.facing * VS, VS, VS);
  PV.root.visible = !(p.invT > 0 && Math.floor(t * 16) % 2 === 0);
  PV.bubble.visible = p.shield;
  if (p.shield) PV.bubble.scale.setScalar(1 + 0.05 * Math.sin(t * 8));
  const charging = p.crouch && p.charge > 0.02;            // cargando el spin dash: bola que gira en el sitio
  const ball = p.rolling || p.spinAir || charging;
  PV.face.visible = !ball; PV.head.visible = !ball;
  PV.arms.forEach((a) => (a.visible = !ball));
  PV.feet.forEach((f) => (f.visible = !ball));
  PV.backSpikes.visible = !ball;
  PV.ballSpikes.visible = ball;
  if (p.path) { PV.air = 0; PV.spin.rotation.z = -p.s / 0.8; }
  else if (charging) { PV.air -= dt * (20 + 40 * p.charge); PV.spin.rotation.z = PV.air; }
  else if (p.rolling) { PV.air = 0; PV.spin.rotation.z = -p.roll; }
  else if (p.spinAir) { PV.air -= dt * 18; PV.spin.rotation.z = PV.air; }
  else { PV.air = 0; PV.spin.rotation.z = 0; }
  animatePlayer(PV, p, dt);
}

// Estela: cinta brillante que sigue al erizo cuando va rápido, rueda o recorre un tubo (azul; dorada con la estrella)
const TRAIL_N = 14;
export function buildTrail(scene) {
  const pos = new Float32Array(TRAIL_N * 2 * 3), col = new Float32Array(TRAIL_N * 2 * 3), idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, hist: [], k: 0, col: new THREE.Color() };
}

export function updateTrail(tr, PV, p, dt) {
  const c = PV.root.position, h = tr.hist;
  const head = { x: c.x, y: c.y, z: c.z };
  if (h.length && Math.hypot(h[0].x - head.x, h[0].y - head.y) > 6) h.length = 0;   // salto de posición (reaparece)
  h.unshift(head);
  if (h.length > TRAIL_N) h.length = TRAIL_N;
  const speed = p.path ? Math.abs(p.pv) : Math.hypot(p.vx, p.vy);
  const want = p.path || p.dashT > 0 || p.starT > 0 ? 1 : p.rolling ? 0.7 : Math.min(1, Math.max(0, (speed - 20) / 12));
  tr.k += (want - tr.k) * (1 - Math.exp(-dt * 8));
  tr.col.setHex(p.starT > 0 ? 0xffd23f : p.speedT > 0 ? 0xff9a3c : 0x3fa9ff);
  const pos = tr.mesh.geometry.attributes.position.array, col = tr.mesh.geometry.attributes.color.array;
  for (let i = 0; i < TRAIL_N; i++) {
    const a = h[Math.min(i, h.length - 1)], b = h[Math.min(i + 1, h.length - 1)];
    let dx = a.x - b.x, dy = a.y - b.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-4) { dx = 1; dy = 0; } else { dx /= L; dy /= L; }
    const f = 1 - i / (TRAIL_N - 1), w = 0.55 * f + 0.05;
    for (let s = 0; s < 2; s++) {
      const sg = s ? -1 : 1, o = (2 * i + s) * 3;
      pos[o] = a.x - dy * w * sg; pos[o + 1] = a.y + dx * w * sg; pos[o + 2] = a.z - 0.05;
      const e = tr.k * f * f * 0.85;
      col[o] = tr.col.r * e; col[o + 1] = tr.col.g * e; col[o + 2] = tr.col.b * e;
    }
  }
  tr.mesh.geometry.attributes.position.needsUpdate = true;
  tr.mesh.geometry.attributes.color.needsUpdate = true;
  tr.mesh.visible = tr.k > 0.02 && PV.root.visible;
}
