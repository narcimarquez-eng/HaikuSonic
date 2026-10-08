// Chispas al destruir enemigos: partículas en una sola malla instanciada que se reciclan (sin crear objetos por fotograma)
import * as THREE from 'three';

const MAX = 180, LIFE = 0.5, GRAVITY = 22;
const COLORS = [0xffe066, 0xffffff, 0xff9d3a];     // amarillo, blanco y naranja
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();

export function createFx(scene) {
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const im = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22), mat, MAX);
  im.count = MAX; im.frustumCulled = false;
  for (let i = 0; i < MAX; i++) im.setColorAt(i, _c.setHex(COLORS[0]));
  scene.add(im);
  const parts = [];
  for (let i = 0; i < MAX; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: LIFE, size: 0 });
  return { im, parts, next: 0 };
}

// Un estallido de chispas en (x, y); si no quedan partículas libres se reutilizan las más antiguas
export function spawnBurst(fx, x, y, n = 14) {
  for (let k = 0; k < n; k++) {
    const i = fx.next, p = fx.parts[i];
    fx.next = (i + 1) % MAX;
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v + 3;
    p.max = p.life = LIFE * (0.7 + Math.random() * 0.6);
    p.size = 0.6 + Math.random() * 0.6;
    fx.im.setColorAt(i, _c.setHex(COLORS[Math.floor(Math.random() * COLORS.length)]));
  }
  fx.im.instanceColor.needsUpdate = true;
}

// Avanza las partículas vivas (caen con gravedad y se encogen) y actualiza la malla
export function updateFx(fx, dt) {
  const { im, parts } = fx;
  parts.forEach((p, i) => {
    if (p.life > 0) {
      p.life -= dt;
      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    const alive = p.life > 0;
    _p.set(p.x, p.y, 0.4);
    _s.setScalar(alive ? p.size * (p.life / p.max) : 0);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  im.instanceMatrix.needsUpdate = true;
}
