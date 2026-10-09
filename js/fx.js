// Chispas, salpicaduras y polvo: partículas en una sola malla instanciada que se reciclan (sin crear objetos por fotograma)
import * as THREE from 'three';

const LIFE = 0.5, GRAVITY = 22;
// Paletas: 0 chispas (amarillo, blanco y naranja) al destruir enemigos; 1 salpicaduras (azul claro y blanco) en el agua;
// 2 destellos dorados al coger un anillo; 3 polvo (tierra clara) al aterrizar, derrapar o salir con el spin dash
const PALETTES = [
  [0xffe066, 0xffffff, 0xff9d3a],
  [0x9fe9ff, 0xffffff, 0x5cc8ff],
  [0xfff3b0, 0xffd23f, 0xffffff],
  [0xf1e6d0, 0xd9cbb0, 0xffffff],
];
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();

// Sistema de partículas. Con dust, se mezclan de forma normal (no aditiva) y crecen al desvanecerse, como el polvo
export function createFx(scene, { max = 220, dust = false } = {}) {
  const mat = dust
    ? new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.75, depthWrite: false })
    : new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const geo = dust ? new THREE.IcosahedronGeometry(0.22, 1) : new THREE.OctahedronGeometry(0.22);
  const im = new THREE.InstancedMesh(geo, mat, max);
  im.count = max; im.frustumCulled = false;
  for (let i = 0; i < max; i++) im.setColorAt(i, _c.setHex(PALETTES[dust ? 3 : 0][0]));
  scene.add(im);
  const parts = [];
  for (let i = 0; i < max; i++) parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, life: 0, max: LIFE, size: 0 });
  return { im, parts, next: 0, dust };
}

// Un estallido de n partículas en (x, y, z); pal elige la paleta. Si no quedan libres se reutilizan las más antiguas.
// dir (polvo): -1 o 1 lanza el polvo hacia ese lado; 0, a los dos
export function spawnBurst(fx, x, y, n = 14, pal = 0, z = 0, dir = 0) {
  const colors = PALETTES[pal];
  for (let k = 0; k < n; k++) {
    const i = fx.next, p = fx.parts[i];
    fx.next = (i + 1) % fx.parts.length;
    p.x = x; p.y = y; p.z = z + (fx.dust ? (Math.random() - 0.5) * 1.2 : 0.4);
    if (pal === 1) {                                  // salpicaduras: hacia arriba y hacia los lados
      p.vx = (Math.random() - 0.5) * 4; p.vy = 1.2 + Math.random() * 3;
    } else if (pal === 2) {                           // destellos: pocos, rápidos y hacia arriba
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v + 2;
    } else if (pal === 3) {                           // polvo: rasante, hacia los lados, y casi sin caer
      const side = dir || (Math.random() < 0.5 ? -1 : 1);
      p.vx = side * (1.5 + Math.random() * 3.5); p.vy = 0.4 + Math.random() * 1.6;
    } else {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v + 3;
    }
    p.max = p.life = (pal === 3 ? 0.65 : pal === 2 ? 0.35 : LIFE) * (0.7 + Math.random() * 0.6);
    p.size = pal === 1 ? 0.25 + Math.random() * 0.3 : pal === 2 ? 0.25 + Math.random() * 0.25 : pal === 3 ? 0.7 + Math.random() * 0.6 : 0.6 + Math.random() * 0.6;
    fx.im.setColorAt(i, _c.setHex(colors[Math.floor(Math.random() * colors.length)]));
  }
  fx.im.instanceColor.needsUpdate = true;
}

// Avanza las partículas vivas (caen con gravedad y se encogen; el polvo frena y se hincha) y actualiza la malla
export function updateFx(fx, dt) {
  const { im, parts, dust } = fx;
  parts.forEach((p, i) => {
    if (p.life > 0) {
      p.life -= dt;
      if (dust) { p.vx *= Math.exp(-dt * 3); p.vy -= 2 * dt; }
      else p.vy -= GRAVITY * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    const alive = p.life > 0, k = p.life / p.max;
    _p.set(p.x, p.y, p.z);
    _s.setScalar(alive ? p.size * (dust ? 0.5 + (1 - k) * 0.9 * Math.min(1, k * 4) : k) : 0);
    im.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  im.instanceMatrix.needsUpdate = true;
}
