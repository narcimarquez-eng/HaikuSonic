// Modelos de Blender de los enemigos nuevos (dron, torreta y jefe), generados por tools/blender/make_enemies.py
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  flyer: 'assets/models/flyer.glb', shooter: 'assets/models/shooter.glb', boss: 'assets/models/boss.glb',
  wasp: 'assets/models/wasp.glb', hopper: 'assets/models/hopper.glb', spiky: 'assets/models/spiky.glb', fish: 'assets/models/fish.glb',
};
export const MODELS = {};

// Carga los tres modelos una sola vez; si falla alguno, el juego sigue con figuras de respaldo
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
