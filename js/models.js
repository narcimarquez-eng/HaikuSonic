// Modelos de Blender (enemigos y decoración del fondo), generados por tools/blender/make_enemies.py
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  flyer: 'assets/models/flyer.glb', shooter: 'assets/models/shooter.glb', boss: 'assets/models/boss.glb',
  wasp: 'assets/models/wasp.glb', hopper: 'assets/models/hopper.glb', spiky: 'assets/models/spiky.glb', fish: 'assets/models/fish.glb',
  housefly: 'assets/models/housefly.glb', worm: 'assets/models/worm.glb', beetle: 'assets/models/beetle.glb',
  tree_oak: 'assets/models/tree_oak.glb', tree_birch: 'assets/models/tree_birch.glb', tree_palm: 'assets/models/tree_palm.glb',
  tree_pine: 'assets/models/tree_pine.glb', rock_a: 'assets/models/rock_a.glb', rock_b: 'assets/models/rock_b.glb', bush: 'assets/models/bush.glb',
};
export const MODELS = {};

// Carga los modelos una sola vez; si falla alguno, el juego sigue con figuras de respaldo
export async function loadModels() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(FILES).map(async ([name, url]) => {
    try {
      MODELS[name] = (await loader.loadAsync(url)).scene;
    } catch (err) {
      console.warn(`No se pudo cargar ${url}`, err);
    }
  }));
}
