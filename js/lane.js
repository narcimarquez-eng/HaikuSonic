// Pista: suelo, rampas, muelles, piedras, salientes, plataformas, puentes, hierba y tubos verticales
import * as THREE from 'three';
import { FILE, tiled } from './textures.js';
import { mulberry32 } from './util.js';
import { BLADE_GEO, CUT_PLANES, ROCK_GEO, UNIT_CYL, UNIT_SPHERE, addBox, cyl, extrudeZ, instanced, lensShape, mesh, prism } from './geo.js';
import { laneY, slopeAt, TUBE_R } from './level.js';

// Hierba 3D: briznas instanciadas y, opcionalmente, flores
export function addGrass(G, surfs, density, rnd, flowers) {
  const pts = [];
  for (const s of surfs) {
    const n = Math.floor((s.x1 - s.x0) * density);
    for (let i = 0; i < n; i++) {
      const x = s.x0 + rnd() * (s.x1 - s.x0), z = s.z0 + rnd() * (s.z1 - s.z0);
      pts.push([x, s.y(x), z]);
    }
  }
  if (!pts.length) return;
  const items = [];
  for (const [x, y, z] of pts) {
    for (let b = 0; b < 3; b++) {
      items.push({
        x: x + (rnd() - 0.5) * 0.25, y, z: z + (rnd() - 0.5) * 0.6,
        rx: (rnd() - 0.5) * 0.4, ry: rnd() * Math.PI * 2, rz: (rnd() - 0.5) * 0.4,
        sx: 1, sy: 0.7 + rnd() * 0.7, sz: 1,
        color: new THREE.Color().setHSL(0.25 + (rnd() - 0.5) * 0.05, 0.5 + rnd() * 0.25, 0.22 + rnd() * 0.2).getHex(),
      });
    }
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  instanced(G, BLADE_GEO, mat, items);
  if (flowers) {
    const cols = [0xffffff, 0xffd54a, 0xff7aa8, 0xc58cff];
    const F = Math.max(1, Math.floor(pts.length * 0.12));
    const fl = [];
    for (let i = 0; i < F; i++) {
      const [x, y, z] = pts[Math.floor(rnd() * pts.length)];
      fl.push({ x, y: y + 0.2, z, sx: 0.012, sy: 0.4, sz: 0.012, color: 0x3f8f3a });
    }
    instanced(G, UNIT_CYL, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), fl);
    const heads = [];
    for (let i = 0; i < F; i++) {
      const [x, y, z] = pts[Math.floor(rnd() * pts.length)];
      heads.push({ x, y: y + 0.43, z, sx: 0.07, color: cols[Math.floor(rnd() * cols.length)] });
    }
    instanced(G, UNIT_SPHERE, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), heads);
  }
}

// Engranaje: disco con dientes en el plano XY (gira alrededor de z)
function buildGear(mat) {
  const gear = new THREE.Group();
  const disc = new THREE.Mesh(UNIT_CYL, mat);
  disc.scale.set(0.62, 0.3, 0.62); disc.rotation.x = Math.PI / 2;
  gear.add(disc);
  for (let k = 0; k < 10; k++) {
    const th = (k / 10) * Math.PI * 2;
    const tooth = addBox(gear, mat, Math.cos(th) * 0.7, Math.sin(th) * 0.7, 0, 0.22, 0.22, 0.3);
    tooth.rotation.z = th;
  }
  return gear;
}

// Tubo vertical: sección circular de radio TUBE_R alrededor de la trayectoria (plana en XY).
// Se construye a mano con la normal de la trayectoria, así no se retuerce en los puntos de inflexión.
// Se ve por dentro (BackSide) y el plano de corte quita la mitad cercana.
export function buildTube(pt, T, G) {
  const SEG = 24;
  const n = pt.pts.length;
  const pos = [], nrm = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = pt.pts[i], [nx, ny] = pt.N[i];
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      pos.push(px + nx * TUBE_R * c, py + ny * TUBE_R * c, TUBE_R * s);
      nrm.push(nx * c, ny * c, s);
      uv.push(pt.cum[i] / 10, j / SEG);       // una repetición cada 10 unidades: cuadros de 2.5
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * (SEG + 1) + j, b = a + SEG + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({
    map: T.tube, side: THREE.BackSide, roughness: 0.5, metalness: 0.15,
    emissive: 0x0b1f2e, emissiveIntensity: 0.5, clippingPlanes: CUT_PLANES,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  G.add(m);
  return m;
}

// Construye la pista en los grupos de cada tramo (chunkOf devuelve el grupo de una coordenada x)
export function buildLane(lv, zi, T, chunkOf) {
  const S = lv.solids;
  const rnd = mulberry32(lv.zone * 977 + lv.act * 31 + 5);
  const grass = new Map();                       // grupo -> superficies con hierba
  const addGrassSurf = (G, surf) => {
    if (!grass.has(G)) grass.set(G, []);
    grass.get(G).push(surf);
  };
  const woodTex = FILE.wood || T.plank;

  const supports = (G, s, mat) => {               // columnas detrás de la pista, solo donde hay suelo
    for (const px of [s.x0 + 0.5, s.x1 - 0.5]) {
      const gy = laneY(S, px);
      if (gy > -1 && gy < s.y0 - 0.2) addBox(G, mat, px, (gy + s.y0) / 2, -1.2, 0.55, s.y0 - gy, 0.55);
    }
  };

  for (const s of S) {
    if (s.kind === 'ground') {
      const w = s.x1 - s.x0, top = s.y1, cx = (s.x0 + s.x1) / 2, G = chunkOf(cx);
      const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.side, w / 4, (top + 14) / 4), roughness: 0.95 });
      const edgeM = new THREE.MeshStandardMaterial({ map: tiled(T.top, w / 4, 0.25), roughness: 0.9 });
      const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, w / 4, 1.1), roughness: 0.85 });
      addBox(G, sideM, cx, (top - 14) / 2, 0, w, top + 14, 4);     // el frente llega hasta muy abajo: no se ve el cielo
      addBox(G, [edgeM, edgeM, topM, sideM, edgeM, edgeM], cx, top - 0.25, 0, w, 0.5, 4.4);
      if (s.boost) {
        const chev = new THREE.MeshStandardMaterial({ map: tiled(T.chevron, w / 4, 1), emissive: 0xffffff, emissiveMap: tiled(T.chevron, w / 4, 1), emissiveIntensity: 0.9, roughness: 0.4 });
        addBox(G, chev, cx, top + 0.03, 0, w, 0.06, 2.6);
      } else if (zi === 0) {
        addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -2, z1: 2, y: () => top });
      }
    } else if (s.kind === 'slope') {
      const G = chunkOf((s.x0 + s.x1) / 2);
      const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.side, 0.25, 0.25), roughness: 0.95 });
      const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, 0.25, 0.25), roughness: 0.85 });
      prism(G, [[s.x0, -4], [s.x1, -4], [s.x1, s.yb - 0.5], [s.x0, s.ya - 0.5]], -2, 4, sideM);
      prism(G, [[s.x0, s.ya], [s.x1, s.yb], [s.x1, s.yb - 0.5], [s.x0, s.ya - 0.5]], -2.2, 4.4, topM);
      if (zi === 0) addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -2, z1: 2, y: (x) => slopeAt(s, x) });
    } else if (s.kind === 'spring') {
      const G = chunkOf(s.x0);
      const red = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.45 });
      const yel = new THREE.MeshStandardMaterial({ color: 0xffe53b, roughness: 0.35 });
      s.mesh = addBox(G, [red, red, yel, red, red, red], (s.x0 + s.x1) / 2, s.y0 + 0.3, 0, s.x1 - s.x0, 0.6, 1.4);
    } else if (s.kind === 'block') {
      // Piedra sólida: se salta o se rodea
      const G = chunkOf((s.x0 + s.x1) / 2), w = s.x1 - s.x0, h = s.y1 - s.y0;
      const rockM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, w / 2, h / 2), roughness: 0.9 });
      const m = mesh(G, ROCK_GEO, rockM, (s.x0 + s.x1) / 2, s.y0 + h * 0.5, 0, w * 0.52, h * 0.55, 0.95);
      m.rotation.set(0.2, 0.7, 0.1);
    } else if (s.kind === 'ceiling') {
      // Saliente de roca sobre la pista: se pasa por debajo; pilares de roca detrás
      const G = chunkOf(s.x0);
      const rockM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, 1, 1), roughness: 0.95 });
      extrudeZ(G, lensShape(s.x0, s.x1, s.base + 2.8, 1.2, 0.8), -1.4, 2.8, rockM);
      for (const px of [s.x0 - 0.4, s.x1 + 0.4]) mesh(G, ROCK_GEO, rockM, px, s.base + 1.5, -1.9, 0.9, 3.0, 0.9);
    } else if (s.mover) {
      // Móvil: balsa de madera (verde y acuática) o cinta con engranajes (industrial)
      const G = chunkOf(s.base), w = s.w, h = s.y1 - s.y0;
      if (s.mtype === 'conveyor') {
        const steel = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.4, metalness: 0.7 });
        const topM = new THREE.MeshStandardMaterial({ map: tiled(T.platTop, w / 3, 1), roughness: 0.55 });
        s.mesh = addBox(G, [steel, steel, topM, steel, steel, steel], s.cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
        const track = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.6, metalness: 0.6 });
        addBox(G, track, s.base, s.y0 - 0.55, 0, s.amp * 2 + w + 2, 0.25, 1.4);
        const gl = buildGear(steel), gr = buildGear(steel);
        const gx = s.amp + w / 2 + 1.2;
        gl.position.set(s.base - gx, s.y0 - 0.55, 0); gr.position.set(s.base + gx, s.y0 - 0.55, 0);
        G.add(gl, gr);
        s.gears = [gl, gr];
        for (const p of [s.base - gx, s.base + gx]) {
          const gy = laneY(S, p);
          if (gy > -1 && gy < s.y0 - 0.55) addBox(G, steel, p, (gy + s.y0 - 0.55) / 2, -1.2, 0.35, s.y0 - 0.55 - gy, 0.35);
        }
      } else {
        const woodM = new THREE.MeshStandardMaterial({ map: tiled(woodTex, w / 3, h / 3), roughness: 0.8 });
        s.mesh = addBox(G, woodM, s.cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
      }
    } else if (s.kind === 'platform') {
      const cx = (s.x0 + s.x1) / 2, w = s.x1 - s.x0, h = s.y1 - s.y0, G = chunkOf(cx);
      if (s.bridge) {
        // Puente: troncos (verde), pasarela de acero (industrial) o tablones con cuerdas (acuática)
        const deckM = new THREE.MeshStandardMaterial({ map: tiled(woodTex, w / 3, 1), roughness: 0.8 });
        if (s.bridge === 'logs') {
          const bark = new THREE.MeshStandardMaterial({ map: tiled(T.bark, w / 4, 1), roughness: 0.9 });
          for (const z of [-0.85, 0, 0.85]) cyl(G, bark, cx, s.y1 + 0.22, z, 0.3, w, true);
        } else if (s.bridge === 'steel') {
          const steel = new THREE.MeshStandardMaterial({ color: 0x7d8790, roughness: 0.45, metalness: 0.6 });
          addBox(G, steel, cx, s.y1 + 0.1, 0, w, 0.2, 2.2);
          addBox(G, steel, cx, s.y1 + 0.8, 1.1, w, 0.08, 0.08);
          addBox(G, steel, cx, s.y1 + 0.8, -1.1, w, 0.08, 0.08);
        } else {
          addBox(G, deckM, cx, s.y1 + 0.05, 0, w, 0.3, 2.2);
          const rope = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.9 });
          for (const z of [1.1, -1.1]) {
            const curve = new THREE.CatmullRomCurve3([
              new THREE.Vector3(s.x0 + 0.6, s.y1 + 1.1, z), new THREE.Vector3(cx, s.y1 + 0.4, z), new THREE.Vector3(s.x1 - 0.6, s.y1 + 1.1, z),
            ]);
            G.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.045, 6), rope));
          }
        }
        for (const px of [s.x0 + 0.6, s.x1 - 0.6]) addBox(G, deckM, px, s.y1 + 0.55, 1.2, 0.14, 1.1, 0.14);
      } else if (zi === 1) {
        // Plataforma de acero con pilares y remaches
        const side = new THREE.MeshStandardMaterial({ map: tiled(T.plank, w / 3, h / 3), roughness: 0.65 });
        const top = new THREE.MeshStandardMaterial({ map: tiled(T.platTop, w / 3, 1), roughness: 0.55 });
        addBox(G, [side, side, top, side, side, side], cx, (s.y0 + s.y1) / 2, 0, w, h, 2.4);
        supports(G, s, side);
      } else {
        // Roca natural con hierba (verde) o arena (acuática), apoyada en el paisaje
        const sideM = new THREE.MeshStandardMaterial({ map: tiled(T.rock, w / 3, h / 3), roughness: 0.92 });
        const topM = new THREE.MeshStandardMaterial({ map: tiled(T.top, w / 3, 1), roughness: 0.85 });
        addBox(G, [sideM, sideM, topM, sideM, sideM, sideM], cx, (s.y0 + s.y1) / 2, 0, w, h, 2.6);
        supports(G, s, sideM);
        if (zi === 0) addGrassSurf(G, { x0: s.x0, x1: s.x1, z0: -1.1, z1: 1.1, y: () => s.y1 });
      }
    }
  }

  // Hierba: briznas sobre las superficies verdes (una malla por tramo)
  for (const [G, surfs] of grass) addGrass(G, surfs, 4, rnd, true);
}
