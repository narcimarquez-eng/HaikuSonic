// Mundo visual de una fase: tramos (grupos) que se muestran u ocultan según la posición del jugador
import * as THREE from 'three';
import { CHUNK, SHARED_GEO } from './geo.js';
import { zoneTextures } from './textures.js';
import { buildLane, buildTube } from './lane.js';
import { buildBackdrop, updateBackdrop } from './backdrop.js';
import { buildEntities, updateEntities } from './entities.js';
import { buildWater, updateWater } from './water.js';

// Construye la pista, los tubos, el fondo y las entidades de la fase y los añade a la escena
export function buildWorld(lv, zi, ai, scene) {
  const T = zoneTextures(zi);
  const root = new THREE.Group();
  scene.add(root);
  const chunks = new Map();
  const chunkOf = (x) => {
    const k = Math.floor(x / CHUNK);
    let g = chunks.get(k);
    if (!g) {
      g = new THREE.Group();
      g.userData.x0 = k * CHUNK; g.userData.x1 = (k + 1) * CHUNK;
      chunks.set(k, g); root.add(g);
    }
    return g;
  };
  buildLane(lv, zi, T, chunkOf);
  for (const pt of lv.paths) buildTube(pt, T, chunkOf(pt.x0), zi);
  const bd = buildBackdrop(lv, zi, ai, T, chunkOf, root);
  const ent = buildEntities(lv, zi, chunkOf, root);
  const water = buildWater(lv, chunkOf);
  return { scene, root, chunks, bd, ent, water };
}

// Muestra los tramos cercanos al jugador (la ventana es amplia porque el fondo se ve lejos)
export function updateWorld(W, lv, t, dt, px) {
  for (const g of W.chunks.values()) g.visible = g.userData.x1 > px - 300 && g.userData.x0 < px + 320;
  updateBackdrop(W.bd, t, dt);
  updateEntities(W.ent, lv, t, dt);
  updateWater(W.water, t, dt, px);
}

// Libera geometrías y materiales de la fase (las texturas compartidas se conservan)
export function disposeWorld(W) {
  W.scene.remove(W.root);
  W.root.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    ms.forEach((m) => m.dispose());
    if (o.geometry && !SHARED_GEO.has(o.geometry) && !o.isSprite) o.geometry.dispose();
  });
}
