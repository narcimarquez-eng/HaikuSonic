// Jugador: erizo azul con púas, guantes, zapatillas y ojos; modo bola al rodar o girar en el aire
import * as THREE from 'three';
import { LIMB_GEO, UNIT_CONE, UNIT_SPHERE, addBox, mesh } from './geo.js';

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
  PV.lean.scale.set(1, p.crouch ? 0.74 : 1, 1);
  PV.lean.position.y = p.crouch ? -0.12 : 0;
}

// Coloca el modelo sobre la caja de colisión y aplica el giro, el modo bola y el parpadeo
export function updatePlayer(PV, p, t, dt) {
  const VS = 1.3;   // escala visual; los pies quedan sobre la caja de colisión
  PV.root.position.set(p.x, p.y - 0.5 + 0.56 * VS, 0);
  PV.root.scale.set(p.facing * VS, VS, VS);
  PV.root.visible = !(p.invT > 0 && Math.floor(t * 16) % 2 === 0);
  PV.bubble.visible = p.shield;
  if (p.shield) PV.bubble.scale.setScalar(1 + 0.05 * Math.sin(t * 8));
  const ball = p.rolling || p.spinAir;
  PV.face.visible = !ball; PV.head.visible = !ball;
  PV.arms.forEach((a) => (a.visible = !ball));
  PV.feet.forEach((f) => (f.visible = !ball));
  PV.backSpikes.visible = !ball;
  PV.ballSpikes.visible = ball;
  if (p.path) { PV.air = 0; PV.spin.rotation.z = -p.s / 0.8; }
  else if (p.rolling) { PV.air = 0; PV.spin.rotation.z = -p.roll; }
  else if (p.spinAir) { PV.air -= dt * 18; PV.spin.rotation.z = PV.air; }
  else { PV.air = 0; PV.spin.rotation.z = 0; }
  animatePlayer(PV, p, dt);
}
