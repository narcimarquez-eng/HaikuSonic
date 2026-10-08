// Agua de la pista: vados, arroyos y estanques poco profundos (translúcidos, con olas que se mueven) y cascadas
// (una lámina con estrías que baja por el borde de una meseta, con espuma en la base)
import * as THREE from 'three';
import { addBox, mesh } from './geo.js';

const SHALLOW_HEX = [0x2f9ee0, 0x2a8fd6, 0x3aaef0];   // agua somera: azul y translúcida, algo más viva que la de los huecos

// Texturas creadas una vez: olas (destellos sobre fondo transparente) y estrías de cascada
let waveTex = null, streakTex = null;
function canvasTex(draw, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function getWaveTex() {
  if (!waveTex) {
    waveTex = canvasTex((g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 36; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
        g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 20, 2);
      }
    }, 128, 64);
  }
  return waveTex.clone();
}
function getStreakTex() {
  if (!streakTex) {
    streakTex = canvasTex((g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) {
        const x = Math.random() * w, y = Math.random() * h, len = h * (0.3 + Math.random() * 0.6);
        const grad = g.createLinearGradient(0, y, 0, y + len);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, `rgba(255,255,255,${0.7 + Math.random() * 0.3})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x, y, 2 + Math.random() * 2, len);
      }
    }, 64, 256);
  }
  return streakTex.clone();
}

// Crea el agua de la fase: un volumen translúcido en cada vado y una cascada en cada borde de meseta con caída.
// Devuelve la lista de elementos que se animan por fotograma (updateWater)
export function buildWater(lv, chunkOf) {
  const anim = [];
  for (const s of lv.solids) {
    if (!s.wade) continue;
    const w = s.x1 - s.x0, h = s.wl - s.y1, cx = (s.x0 + s.x1) / 2, G = chunkOf(cx);
    const tex = getWaveTex();
    tex.repeat.set(Math.max(1, w / 3), Math.max(1, 3 / 4));
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      color: SHALLOW_HEX[lv.zone], map: tex, transparent: true, opacity: 0.74,
      roughness: 0.08, metalness: 0.05, depthWrite: false, emissive: 0x06304a, emissiveIntensity: 0.5,
    });
    addBox(G, mat, cx, s.y1 + h / 2, 0, w, h, 3.8);
    anim.push({ kind: 'wave', tex, speed: 0.25 + Math.random() * 0.2 });
  }
  for (const f of lv.falls) {
    const h = f.yTop - f.yBot, G = chunkOf(f.x);
    const tex = getStreakTex();
    tex.repeat.set(1, Math.max(1, h / 2.5));
    tex.offset.y = Math.random();
    tex.needsUpdate = true;
    const sheetM = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.4, depthWrite: false });
    mesh(G, new THREE.PlaneGeometry(f.w, h), sheetM, f.x, f.yBot + h / 2, 2.22);
    const fallM = new THREE.MeshBasicMaterial({ color: 0xffffff, map: tex, transparent: true, opacity: 1, depthWrite: false });
    mesh(G, new THREE.PlaneGeometry(f.w, h), fallM, f.x, f.yBot + h / 2, 2.25);
    anim.push({ kind: 'fall', tex, speed: 2.4 });
    const foamM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
    const foam = mesh(G, new THREE.PlaneGeometry(f.w * 2.4, 0.8), foamM, f.x, f.yBot + 0.25, 2.3);
    anim.push({ kind: 'foam', obj: foam });
  }
  return anim;
}

// Mueve las olas, la caída de las cascadas y la espuma (un paso por fotograma)
export function updateWater(anim, t, dt) {
  for (const a of anim) {
    if (a.kind === 'wave') a.tex.offset.x += dt * a.speed;
    else if (a.kind === 'fall') a.tex.offset.y -= dt * a.speed;
    else { const k = 1 + 0.08 * Math.sin(t * 5); a.obj.scale.set(k, 1 + 0.2 * Math.sin(t * 5), 1); }
  }
}
