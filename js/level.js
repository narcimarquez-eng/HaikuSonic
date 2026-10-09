// Generador de fases: secciones (tramos con objetos, colinas con arcos, huecos, bucles, cuevas secretas con tubo,
// mesetas con muelle y escaladas)
import { mulberry32, clamp, lerp, pickWeighted } from './util.js';
import { makeBot } from './bots.js';

export const ZONE_NAMES = ['Zona Verde', 'Zona Industrial', 'Zona Acuática'];
export const KILL_Y = [-14, -14, -3.4];
export const SLOPE_MAX = 3.2;
export const LOOP_R = 3;      // radio del bucle vertical (centro de la trayectoria)
export const TUBE_R = 1.6;    // radio interior del tubo que rodea la trayectoria
export const SPRING_V = 26;
export const DROP_W = 6;      // ancho horizontal de una bajada (y de una subida)
export const DROP_D = 7;      // profundidad de una bajada: hasta el suelo de la galería
export const ARC_LIP = 70 * Math.PI / 180;   // ángulo del labio de un arco: casi vertical, así el erizo sale hacia arriba
// Robots nuevos por zona: frecuencia en las secciones y pesos al repartir enemigos sueltos (verde, industrial, acuática)
const ROBOT_RATE = [0.22, 0.4, 0.3];
const ROBOT_W = [{ shield: 3, bomb: 2, laser: 1 }, { charger: 3, shield: 3, bomb: 3, laser: 1 }, { support: 3, bomb: 2, shield: 1, laser: 1 }];
const ROBOT_FILL = [{ shield: 2, bomb: 1.5, laser: 0.8 }, { shield: 3, charger: 3, bomb: 2, laser: 0.8 }, { support: 3, bomb: 1.5, shield: 1, laser: 0.8 }];
const WALL = 8.5;             // distancia del muelle al muro de una meseta: a velocidad de carrera el vuelo la libra

// Cada acto tiene longitud y pesos de sección propios (el agua no deja bajar: el fondo queda bajo el mar).
// spike: pinchos con muelle que lanza sobre una meseta (en verde e industrial, a veces con galería bajo los pinchos)
// water: un hueco con agua, con muelle y meseta. lift: muelle y meseta de 4. climb: dos mesetas (4 y 8)
const PROFILE = [
  [ // Verde: tramos, bucles, valles, arroyos, cascadas, pinchos, charcos, mesetas, avispas y erizos
    { len: 900, enemies: 0.45, fly: 0.2, shoot: 0.2, wasp: 0.3, hop: 0.2, spiny: 0.15, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 26, hills: 34, dip: 8, stream: 4, cascade: 3, gap: 8, boost: 6, loop: 6, snake: 5, spike: 7, water: 3, lift: 8, climb: 4 } },
    { len: 1050, enemies: 0.55, fly: 0.25, shoot: 0.3, wasp: 0.35, hop: 0.25, spiny: 0.2, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 18, hills: 30, dip: 10, stream: 5, cascade: 4, gap: 7, boost: 6, loop: 10, snake: 6, spike: 9, water: 4, lift: 9, climb: 6 } },
    { len: 1200, enemies: 0.65, fly: 0.3, shoot: 0.35, wasp: 0.4, hop: 0.3, spiny: 0.25, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 14, hills: 26, dip: 12, stream: 6, cascade: 5, gap: 6, boost: 5, loop: 13, snake: 6, spike: 10, water: 4, lift: 10, climb: 7 } },
  ],
  [ // Industrial: cintas, huecos, valles, arroyos, pinchos, mesetas, torretas y erizos
    { len: 950, enemies: 0.5, fly: 0.2, shoot: 0.3, wasp: 0.25, hop: 0.15, spiny: 0.25, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 22, hills: 28, dip: 6, stream: 3, cascade: 2, gap: 12, boost: 7, loop: 5, snake: 6, spike: 9, lift: 8, climb: 5 } },
    { len: 1100, enemies: 0.6, fly: 0.25, shoot: 0.35, wasp: 0.3, hop: 0.2, spiny: 0.3, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 18, hills: 28, dip: 8, stream: 4, cascade: 3, gap: 14, boost: 6, loop: 8, snake: 7, spike: 11, lift: 9, climb: 7 } },
    { len: 1250, enemies: 0.7, fly: 0.3, shoot: 0.4, wasp: 0.35, hop: 0.25, spiny: 0.35, w: { upper: 6, gentle: 18, step: 6, ledge: 5, tunnels: 8, run: 14, hills: 24, dip: 10, stream: 5, cascade: 4, gap: 15, boost: 5, loop: 10, snake: 8, spike: 13, lift: 10, climb: 8 } },
  ],
  [ // Acuática: balsas, bucles, valles con laguna, pinchos de coral, agua y mesetas
    { len: 1000, enemies: 0.5, fly: 0.3, shoot: 0.1, wasp: 0.3, hop: 0.1, spiny: 0.1, w: { upper: 6, run: 20, hills: 8, dip: 8, gap: 14, boost: 4, loop: 7, spike: 6, water: 9, lift: 6, climb: 4 } },
    { len: 1150, enemies: 0.6, fly: 0.35, shoot: 0.15, wasp: 0.35, hop: 0.15, spiny: 0.15, w: { upper: 6, run: 16, hills: 8, dip: 10, gap: 14, boost: 4, loop: 9, spike: 7, water: 11, lift: 7, climb: 5 } },
    { len: 1300, enemies: 0.7, fly: 0.4, shoot: 0.2, wasp: 0.4, hop: 0.2, spiny: 0.2, w: { upper: 6, run: 14, hills: 6, dip: 12, gap: 14, boost: 4, loop: 12, spike: 7, water: 13, lift: 8, climb: 6 } },
  ],
];

// Altura de la rampa en x. Un arco (s.arc, radio R) sube en curva desde ya, con tangente horizontal, hasta yb
export function slopeAt(s, x) {
  if (s.arc) {
    const u = clamp(x - s.x0, 0, s.x1 - s.x0);
    return s.ya + s.arc.R - Math.sqrt(s.arc.R * s.arc.R - u * u);
  }
  return s.ya + (s.yb - s.ya) * clamp((x - s.x0) / (s.x1 - s.x0), 0, 1);
}
// Pendiente (dy/dx) de la rampa en x: en un arco, la de la curva en ese punto (más allá del labio, plana)
export function slopeGrad(s, x) {
  if (!s.arc) return (s.yb - s.ya) / (s.x1 - s.x0);
  if (x >= s.x1) return 0;
  const u = clamp(x - s.x0, 0, s.x1 - s.x0);
  return u / Math.sqrt(s.arc.R * s.arc.R - u * u);
}

// Altura de la superficie bajo la coordenada x (sin contar plataformas, muelles ni piedras)
export function laneY(solids, x) {
  for (const s of solids) {
    if (s.kind === 'platform' || s.kind === 'spring' || s.kind === 'ceiling' || s.kind === 'block' || s.kind === 'spikes' || s.kind === 'water' || s.kind === 'wall') continue;
    if (x < s.x0 || x > s.x1) continue;
    return s.kind === 'slope' ? slopeAt(s, x) : s.y1;
  }
  return 0;
}

// Trayectoria de un tubo: puntos, longitud de arco, tangente, normal y curvatura con signo
export function buildPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const T = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
    return [tx / L, ty / L];
  });
  const N = T.map(([tx, ty]) => [-ty, tx]);
  const K = pts.map((p, i) => {
    const a = Math.max(0, i - 1), b = Math.min(pts.length - 1, i + 1);
    const ds = cum[b] - cum[a] || 1;
    return ((T[b][0] - T[a][0]) * N[i][0] + (T[b][1] - T[a][1]) * N[i][1]) / ds;
  });
  return { pts, cum, T, N, K, L: cum[cum.length - 1] };
}

// Punto, tangente, normal y curvatura de la trayectoria en la longitud de arco s
export function pathAt(path, s) {
  const c = path.cum;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const j = Math.min(lo + 1, c.length - 1);
  const u = (s - c[lo]) / ((c[j] - c[lo]) || 1);
  const mx = (A, B) => A + (B - A) * u;
  const tx = mx(path.T[lo][0], path.T[j][0]), ty = mx(path.T[lo][1], path.T[j][1]);
  const L = Math.hypot(tx, ty) || 1;
  const T = [tx / L, ty / L];
  return { P: [mx(path.pts[lo][0], path.pts[j][0]), mx(path.pts[lo][1], path.pts[j][1])], T, N: [-T[1], T[0]], K: mx(path.K[lo], path.K[j]) };
}

// Bucle: empieza en (x0, y0) con tangente horizontal y acaba D más adelante, a la misma altura
export function loopPts(x0, y0, R, D = 0) {
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const th = (i / 160) * 2 * Math.PI;
    pts.push([x0 + R * Math.sin(th) + D * i / 160, y0 + R - R * Math.cos(th)]);
  }
  return pts;
}

// Bajada (dir = -1) o subida (dir = 1): curva de coseno que empieza y acaba con tangente horizontal
export function slidePts(x0, y0, W, D, dir) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    pts.push([x0 + W * u, y0 + dir * D * (1 - Math.cos(Math.PI * u)) / 2]);
  }
  return pts;
}

// Genera la fase de zona zi y acto ai
export function buildLevel(zi, ai) {
  const prof = PROFILE[zi][ai];
  const rng = mulberry32(7000 + zi * 101 + ai * 13);
  const rnd = (a, b) => a + (b - a) * rng();
  const lv = {
    zone: zi, act: ai, endX: 0, goalX: 0, goalY: 0, killY: KILL_Y[zi], t: 0,
    solids: [], enemies: [], rings: [], checkpoints: [], paths: [], galleries: [], shots: [], falls: [], items: [],
    blasts: [], pendingKills: [], secrets: [], caves: [],
  };
  const S = lv.solids;
  let x = -10, top = 0, nextCp = 60;

  const pushGround = (x0, x1, y1, extra = {}) => S.push({ kind: 'ground', x0, x1, y0: Math.min(-4, y1 - 2), y1, ...extra });
  // Muelle: al pisarlo lanza hacia arriba y conserva la velocidad horizontal (el vuelo lleva a la meseta)
  const spring = (sx, y0) => S.push({ kind: 'spring', x0: sx, x1: sx + 1.2, y0, y1: y0 + 0.6, power: SPRING_V, squash: 0 });
  // Meseta: terreno sólido que sube de golpe hasta top + h y baja después por una rampa hasta la pista
  const mesa = (wx, h, len, down) => {
    S.push({ kind: 'ground', x0: wx, x1: wx + len, y0: -4, y1: top + h });
    S.push({ kind: 'slope', x0: wx + len, x1: wx + len + down, ya: top + h, yb: top, y0: -4, y1: top + h });
    return wx + len + down;
  };
  // Anillos sobre la trayectoria de un muelle (vuelo a la velocidad de carrera); fr son tiempos en segundos
  const flightRings = (sp, y0, fr) => {
    for (const t of fr) lv.rings.push({ x: sp + 0.6 + 22 * t, y: y0 + 1.1 + 26 * t - 21 * t * t, taken: false });
  };
  const boulder = (bx, y0, w = 1.3, h = 1.2) => S.push({ kind: 'block', x0: bx, x1: bx + w, y0, y1: y0 + h });
  const overhang = (ax, base) => S.push({ kind: 'ceiling', x0: ax, x1: ax + 5, y0: base + 2.8, y1: base + 4.1, base });
  // Potenciadores: escudo, zapatillas, estrella (invencible un rato) y vida extra
  const itemAt = (ix, iy, type) => lv.items.push({ type, x: ix, y: iy, taken: false });
  const randItem = () => pickWeighted({ shield: 35, speed: 35, star: 15, life: 15 }, rng);
  const ringArc = (cx, cy, span, count) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      lv.rings.push({ x: cx - span / 2 + span * t, y: cy + Math.sin(t * Math.PI) * 0.9, taken: false });
    }
  };
  const ringLine = (x0, x1, y, n) => {
    for (let i = 0; i < n; i++) lv.rings.push({ x: lerp(x0, x1, (i + 0.5) / n), y, taken: false });
  };
  const mover = (base, y, amp, w, type) => S.push({
    kind: 'platform', mover: true, mtype: type, base, amp, speed: rnd(0.6, 1.0), ph: rng() * 6,
    w, cx: base, prevCx: base, x0: base - w / 2, x1: base + w / 2, y0: y - 0.5, y1: y,
  });
  const addPath = (pts, kind) => {
    const pt = { ...buildPath(pts), kind, x0: pts[0][0], y0: pts[0][1] };
    lv.paths.push(pt);
    return pt;
  };
  const pathRings = (pt, fracs) => {
    for (const f of fracs) {
      const q = pathAt(pt, pt.L * f);
      lv.rings.push({ x: q.P[0] + q.N[0] * 0.5, y: q.P[1] + q.N[1] * 0.5, taken: false });
    }
  };

  // Tramo plano con objetos
  const runSec = (len, quiet = false) => {
    const x0 = x, x1 = x + len;
    if (!quiet && len > 16 && rng() < 0.3) {          // franja de aceleración dentro del tramo
      const a = rnd(x0 + 3, x1 - 12), b = a + rnd(6, 9);
      pushGround(x0, a, top); pushGround(a, b, top, { boost: 1 }); pushGround(b, x1, top);
    } else {
      pushGround(x0, x1, top);
    }
    if (!quiet) {
      if (x0 > nextCp) { lv.checkpoints.push({ x: x0 + 2, y: top, hit: false }); nextCp = x0 + 170; }
      if (len > 14 && rng() < prof.enemies) {
        lv.enemies.push({ x: rnd(x0 + 4, x1 - 6), minX: x0 + 2, maxX: x1 - 4, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: top, r: 0.63 });   // se aleja del borde: no espera junto a los huecos
        if (len > 40 && rng() < 0.5) lv.enemies.push({ x: rnd(x0 + 8, x1 - 10), minX: x0 + 2, maxX: x1 - 4, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: top, r: 0.63 });
      }
      if (len > 24 && rng() < prof.fly) {              // dron que patrulla sobre el tramo, a la altura de un salto
        const fx0 = rnd(x0 + 4, x1 - 16), fw = rnd(8, 12);
        lv.enemies.push({ type: 'fly', x: fx0, minX: fx0, maxX: fx0 + fw, dir: rng() < 0.5 ? -1 : 1, speed: rnd(2.2, 3.2), base: top + rnd(1.4, 1.9), y: top + 1.6, phase: rng() * 6, alive: true, inv: 0, r: 0.9 });
      }
      if (len > 20 && rng() < prof.hop) {              // saltamontes: camina despacio y da saltos por el tramo
        const hx = rnd(x0 + 4, x1 - 10);
        lv.enemies.push({ type: 'hop', x: hx, minX: x0 + 2, maxX: x1 - 6, dir: rng() < 0.5 ? -1 : 1, y: top, cd: rnd(0.5, 2), air: false, yv: 0, hv: 0, phase: rng() * 6, alive: true, inv: 0, r: 0.67 });
      }
      if (len > 20 && rng() < prof.spiny) {            // erizo con púas: solo lo destruye rodar o cargar
        const ex = rnd(x0 + 4, x1 - 8);
        lv.enemies.push({ type: 'spiny', spiky: true, x: ex, minX: x0 + 2, maxX: x1 - 4, dir: rng() < 0.5 ? -1 : 1, speed: rnd(1.6, 2.2), y: top, phase: rng() * 6, alive: true, inv: 0, r: 0.68 });
      }
      if (len > 24 && rng() < prof.wasp) {             // avispa: ondula sobre el tramo y a veces se lanza en picado
        const wx0 = rnd(x0 + 4, x1 - 14), ww = rnd(8, 12), wb = top + rnd(2.2, 3.2);
        lv.enemies.push({ type: 'wasp', x: wx0, minX: wx0, maxX: wx0 + ww, dir: rng() < 0.5 ? -1 : 1, base: wb, y: wb, mode: 'patrol', diveT: 0, cd: rnd(1, 3), phase: rng() * 6, alive: true, inv: 0, r: 0.6 });
      }
      if (len > 30 && rng() < prof.shoot) {            // torreta en el suelo, lejos del inicio del tramo (el punto de control no cae en su alcance)
        const sx = rnd(x0 + 16, x1 - 10);
        lv.enemies.push({ type: 'shoot', x: sx, minX: sx, maxX: sx, dir: -1, speed: 0, y: top, cd: rnd(0.5, 1.5), phase: 0, alive: true, inv: 0, r: 0.71 });
      }
      if (rng() < 0.6) ringArc(rnd(x0 + 2, x1 - 6), top + 1.2, 4.5, 5);
      if (rng() < 0.1) itemAt(rnd(x0 + 6, x1 - 8), top + 1.3, randItem());
      if (len > 30 && rng() < ROBOT_RATE[zi]) {          // robot nuevo: escudero, bomba, toro, láser o dron de apoyo
        const type = pickWeighted(ROBOT_W[zi], rng), ex = rnd(x0 + 6, x1 - 8);
        const lim = { minX: Math.max(x0 + 2, ex - 5), maxX: Math.min(x1 - 4, ex + 5) };   // patrulla corta: no atraviesa rocas ni muelles
        if (type === 'support') lv.enemies.push(makeBot('support', ex, top + rnd(1.6, 2.2), rng, lim));
        else if (type === 'laser') lv.enemies.push(makeBot('laser', ex, top, rng));
        else lv.enemies.push(makeBot(type, ex, top, rng, lim));
      }
      // Muelles y piedras lejos del final del tramo: el vuelo del muelle cae dentro del tramo
      if (len > 40 && rng() < 0.22) spring(rnd(x0 + 2, x1 - 34), top);
      if (len > 14 && rng() < 0.18) boulder(rnd(x0 + 4, x1 - 9), top);
      if (len > 20 && rng() < 0.22) {
        let ax = rnd(x0 + 4, x1 - 19);
        const n = rng() < 0.5 ? 1 : 2;
        for (let i = 0; i < n && ax + 5 <= x1 - 14; i++) {
          overhang(ax, top);
          if (rng() < 0.5) lv.enemies.push(makeBot('spider', ax + 2.5, top + 1.7, rng, { ceilY: top + 2.8, floorY: top, minX: ax - 4, maxX: ax + 9 }));
          ax += rnd(9, 11);
        }
      }
    }
    x = x1;
  };

  // Franja de aceleración larga
  const boostSec = (len) => {
    const x0 = x, x1 = x + len, a = x0 + 4, b = x1 - 4;
    pushGround(x0, a, top); pushGround(a, b, top, { boost: 1 }); pushGround(b, x1, top);
    ringLine(a, b, top + 1.2, 6);
    x = x1;
  };

  // Colinas: arcos que suben (verde e industrial), pendientes rectas de unos 60° que bajan y subidas o bajadas suaves.
  // Un arco empieza plano, se curva y llega al labio casi vertical: la pista sigue a la altura del labio. La zona
  // acuática tiene un mar que no deja subir ni bajar tanto
  const hillsSec = (len) => {
    const end = x + len, lo = zi === 2 ? 0 : -2, hi = zi === 2 ? 3.2 : 6;
    while (x < end - 4) {
      const roll = rng();
      let f = rnd(3, 6), extra = {};                      // pista llana tras la pendiente
      if (zi !== 2 && roll < 0.3 && top + 4 <= hi) {
        const h = rnd(4, 4.8), R = h / (1 - Math.cos(ARC_LIP)), L = R * Math.sin(ARC_LIP), run = rnd(16, 20);
        pushGround(x, x + run, top); x += run;            // carrera: de parado llega a la velocidad que pide el labio
        const sl = { x0: x, x1: x + L, ya: top, yb: top + h, arc: { R } };
        S.push({ kind: 'slope', ...sl, y0: -4, y1: top + h });
        for (let i = 0; i < 3; i++) {
          const sx = x + L * (0.3 + i * 0.22);
          lv.rings.push({ x: sx, y: slopeAt(sl, sx) + 1.3, taken: false });
        }
        x += L; top += h; f = rnd(10, 14); extra = { arcEnd: true };   // la pista llana del labio: ahí cae el que salta
      } else {
        const cliff = zi !== 2 && roll < 0.5, steep = roll < 0.75;   // cliff: unos 60° hacia abajo
        const rise = cliff ? rnd(4.5, 6.5) : steep ? rnd(3.5, 5) : rnd(2.5, 4.5);
        const nt = clamp(top + (cliff || rng() < 0.5 ? -1 : 1) * rise, lo, hi);
        if (Math.abs(nt - top) > 0.3) {
          const L = cliff ? Math.abs(nt - top) / Math.tan(rnd(56, 62) * Math.PI / 180) : steep ? rnd(7, 10) : rnd(11, 16);
          const sl = { x0: x, x1: x + L, ya: top, yb: nt };
          S.push({ kind: 'slope', ...sl, y0: -4, y1: Math.max(top, nt) });
          for (let i = 0; i < 4; i++) {
            const sx = x + L * (0.2 + i * 0.2);
            lv.rings.push({ x: sx, y: slopeAt(sl, sx) + 1.3, taken: false });
          }
          x += L; top = nt;
        }
      }
      pushGround(x, x + f, top, extra);
      x += f;
    }
  };

  // Hueco con puente de troncos (verde), pasarela de acero (industrial) o balsa móvil (acuática)
  const gapSec = () => {
    const g = zi === 2 ? rnd(4.5, 6) : rnd(2.8, 4.2), a = x;
    const balsa = zi === 2 ? rng() < 0.7 : zi === 1 ? rng() < 0.5 : false;
    if (balsa) {
      mover(a + g / 2, top + 1.1, g / 2 + 0.3, 2.2, zi === 1 ? 'conveyor' : 'raft');
    } else if (rng() < 0.8) {
      const kind = zi === 0 ? 'logs' : zi === 1 ? 'steel' : 'rope';
      S.push({ kind: 'platform', x0: a - 0.8, x1: a + g + 0.8, y0: top + 1.5, y1: top + 2.1, bridge: kind });
    }
    if (rng() < 0.4) ringArc(a + g / 2, top + 2.6, g, 4);
    x = a + g;
  };

  // Bucle vertical: franja de aceleración antes para tener velocidad; el tubo entra por la pista y sale D más
  // adelante, así se ven la entrada y la salida, y un aro de roca rodea el lazo (con la abertura abajo)
  const loopSec = () => {
    const a = x + 6, D = 3.6;
    S.push({ kind: "ground", x0: x, x1: a, y0: -4, y1: top, boost: 1, noEnemy: true });
    pushGround(a, a + 9, top, { noEnemy: true });
    const pt = addPath(loopPts(a, top, LOOP_R, D), "loop");
    pt.loop = { cx: a + D / 2, cy: top + LOOP_R, R: LOOP_R, gap: 1.25 };
    pathRings(pt, [0.2, 0.35, 0.5, 0.65, 0.8]);
    x = a + 9;
  };

  // Cueva secreta con tubo ondulado: una losa agrietada en la pista. Rodando se rompe y el jugador cae al tubo, que
  // hace ocho curvas: cuatro valles de 7.5 a 9.5 bajo la pista, tres crestas a poca altura bajo ella y una última que
  // sube a la pista. Sale a la velocidad con que entró, a la altura de la pista, así que cae sobre ella. Andando se
  // cruza la losa sin caer. Cada curva es un coseno entre dos alturas (tangente horizontal en sus extremos). Todas las
  // crestas quedan bajo la pista: el tubo se recorre con cualquier velocidad de entrada
  const snakeSec = () => {
    const W = DROP_W, Xs = x + rnd(10, 14);
    const depth = [rnd(7.5, 9.5), rnd(0.6, 2.4), rnd(7.5, 9.5), rnd(0.6, 2.4), rnd(7.5, 9.5), rnd(0.6, 2.4), rnd(7.5, 9.5), 0];
    const wide = depth.map(() => rnd(6, 8));
    const Xe = Xs + wide.reduce((a, b) => a + b, 0);
    pushGround(x, Xs - 6, top);
    pushGround(Xs - 6, Xs, top, { boost: 1, noEnemy: true });   // franja de aceleración: la losa se rompe a buena velocidad
    S.push({ kind: 'ground', x0: Xs, x1: Xs + W, y0: -4, y1: top, crack: true, noEnemy: true });
    S.push({ kind: 'ground', x0: Xs + W, x1: Xe, y0: top - 4, y1: top, slab: true, thin: true, noEnemy: true });
    const pts = [[Xs, top]];
    let cx = Xs, cy = top;
    const xEnd = [];
    depth.forEach((d, k) => {
      const ny = top - d;
      for (let i = 1; i <= 24; i++) pts.push([cx + wide[k] * i / 24, cy + (ny - cy) * (1 - Math.cos(Math.PI * i / 24)) / 2]);
      cx += wide[k]; cy = ny; xEnd.push(cx);
    });
    const pt = addPath(pts, 'snake');
    pt.fall = [Xs - 1, Xs + W + 1];                 // boca: por aquí entra quien cae por la losa rota
    pathRings(pt, [0.08, 0.2, 0.33, 0.45, 0.58, 0.7, 0.83, 0.95]);
    itemAt(xEnd[2], top - depth[2] + 1, randItem());   // potenciadores en el segundo y el cuarto valle
    itemAt(xEnd[6], top - depth[6] + 1, 'life');
    lv.secrets.push({ kind: 'tube', x0: Xs, x1: Xe, y0: top - 10.5, y1: top - 0.2, found: false });
    lv.caves.push({ x0: Xs, x1: Xe, top, depth: 11 });
    x = Xe;
    runSec(rnd(18, 24), true);                    // pista llana tras la salida: el jugador sale rápido y tiene sitio para reaccionar
  };

  // Cadena de tubos: una o dos cuevas seguidas, cada una con su losa agrietada
  const tunnelsSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const n = rng() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) snakeSec();
  };

  // Rama alta: un muelle lanza a una plataforma sobre la pista (con anillos, enemigos y potenciadores) y un tubo
  // baja de vuelta a la pista. Con secret, un tubo sube desde la plataforma a una cámara oculta en un piso más alto:
  // es el único camino hasta ella (la cámara no tiene otra entrada, ni por abajo ni de lado)
  const upperSec = (secret = false) => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const W = DROP_W, DH = top + 6.5, L = secret ? 62 : 26, CH = DH + 6;   // con cámara, la plataforma sigue lo bastante para bajar después
    const sp = x + rnd(10, 13), dx0 = sp + 5, dx1 = dx0 + L;
    const bz = dx0 + 14, xs = dx0 + 22;             // franja de aceleración antes del tubo de subida (la cámara pide velocidad)
    pushGround(x, sp + 1.2, top);
    spring(sp, top);
    flightRings(sp, top, [0.25, 0.45, 0.62]);
    pushGround(sp + 1.2, dx1 + W + 10, top);          // la pista sigue por debajo de la plataforma
    S.push({ kind: 'platform', x0: dx0, x1: bz, y0: DH - 2.2, y1: DH });
    S.push({ kind: 'platform', x0: bz, x1: xs, y0: DH - 2.2, y1: DH, boost: 1 });
    S.push({ kind: 'platform', x0: xs, x1: dx1, y0: DH - 2.2, y1: DH });
    ringLine(dx0 + 2, dx1 - 2, DH + 1.4, 6);
    lv.enemies.push({ x: dx0 + 8, minX: dx0 + 2, maxX: secret ? xs - 3 : dx1 - 6, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: DH, inv: 0, r: 0.71 });
    if (L > 30) lv.enemies.push({ x: dx1 - 10, minX: secret ? xs + 1 : dx0 + 14, maxX: dx1 - 4, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: DH, inv: 0, r: 0.71 });
    itemAt(dx0 + 12, DH + 1.3, randItem());
    itemAt(dx0 + 22, DH + 1.3, randItem());
    pathRings(addPath(slidePts(dx1, DH + 0.5, W, DH - top, -1), 'drop'), [0.4, 0.7]);
    if (secret) {
      const xf = xs + W, xc = xf + 10;                // tubo de subida en la plataforma; boca de bajada de la cámara
      S.push({ kind: 'wall', x0: xs - 1.4, x1: xs, y0: DH, y1: DH + 2.2, breakable: true });   // pared de roca: rodando se rompe
      const cham = addPath(slidePts(xs, DH + 0.5, W, CH - DH, 1), 'rise');
      cham.secret = true;                             // solo entra rodando: andando se pasa por encima
      pathRings(cham, [0.3, 0.5, 0.7]);
      S.push({ kind: 'wall', x0: xf - 1, x1: xc, y0: CH - 2.2, y1: CH, sup: DH });      // suelo de la cámara, sobre pilares
      S.push({ kind: 'wall', x0: xf - 1, x1: xc, y0: CH + 4, y1: CH + 4.6 });           // techo
      ringLine(xf + 1, xc - 1, CH + 2.2, 5);
      itemAt(xf + 3, CH + 1.3, 'star');
      itemAt(xf + 7, CH + 1.3, 'life');
      pathRings(addPath(slidePts(xc, CH + 0.5, W, CH - DH, -1), 'drop'), [0.5]);
      lv.secrets.push({ kind: 'chamber', x0: xf - 1, x1: xc, y0: CH - 2.2, y1: CH + 4.6, found: false });
    }
    x = dx1 + W + 10;
  };

  // Cañón: una franja de aceleración lleva a un tubo de subida que lanza a un mirador 7 sobre la pista. Solo entra quien
  // llega rodando y a buena velocidad (la franja da la velocidad): andando se pasa por encima de la boca del tubo
  const cannonSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const H = 7, W = 4.5;
    const b0 = x + 4, b1 = b0 + 10, sx = b1 + 0.5, xe = sx + W + 16;
    pushGround(x, b0, top);
    pushGround(b0, b1, top, { boost: 1 });
    pushGround(b1, xe, top);
    const cp = addPath(slidePts(sx, top + 0.5, W, H, 1), 'rise');
    cp.secret = true;
    pathRings(cp, [0.3, 0.5, 0.7]);
    const my = top + H, mx0 = sx + W - 1, mx1 = sx + W + 13;
    S.push({ kind: 'platform', x0: mx0, x1: mx1, y0: my - 2.2, y1: my });   // mirador: plataforma de una cara
    ringLine(mx0 + 2, mx1 - 2, my + 1.4, 5);
    itemAt(mx0 + 4, my + 1.3, randItem());
    itemAt(mx1 - 4, my + 1.3, 'life');
    lv.secrets.push({ kind: 'cannon', x0: mx0, x1: mx1, y0: my - 1, y1: my + 6, found: false });
    x = xe;
  };

  // Subida o bajada suave: la pista cambia de altura despacio (4 a 8 unidades a lo largo de 25 a 90), así el desnivel
  // de la fase se nota en todo el recorrido. Sin rampas bruscas
  const gentleSec = () => {
    const lo = -4, hi = 10;
    let dh = rnd(4, 8) * (rng() < 0.5 ? -1 : 1);
    if (top + dh > hi) dh = -Math.abs(dh);
    if (top + dh < lo) dh = Math.abs(dh);
    const nt = clamp(top + dh, lo, hi), L = Math.abs(nt - top) / rnd(0.09, 0.16);
    pushGround(x, x + 2, top);
    x += 2;
    const sl = { x0: x, x1: x + L, ya: top, yb: nt };
    S.push({ kind: "slope", ...sl, y0: -4, y1: Math.max(top, nt) });
    for (let i = 0; i < 5; i++) {
      const sx = x + L * (0.15 + i * 0.175);
      lv.rings.push({ x: sx, y: slopeAt(sl, sx) + 1.3, taken: false });
    }
    x += L; top = nt;
  };

  // Escalón de 2.2: la pista sube (o baja) de golpe, lo justo para subirlo con un salto
  const stepSec = () => {
    const dh = rng() < 0.6 ? 2.2 : -2.2;
    const nt = top + dh > 9 || top + dh < -2 ? top - dh : top + dh;
    const f = rnd(4, 7);
    pushGround(x, x + f, top);
    x += f;
    pushGround(x, x + 10, nt);
    x += 10; top = nt;
  };

  // Escalera de plataformas de una cara: a 2 y a 4 sobre la pista. La de arriba se alcanza saltando desde la de abajo
  const ledgeSec = () => {
    pushGround(x, x + 6, top);
    const x0 = x + 6;
    for (const [px0, h] of [[x0 + 1, 2], [x0 + 7, 4]]) {
      const y = top + h;
      S.push({ kind: 'platform', x0: px0, x1: px0 + 4, y0: y - 0.6, y1: y });
      ringLine(px0 + 1, px0 + 3, y + 1.4, 3);
    }
    pushGround(x0, x0 + 16, top);
    x = x0 + 16;
  };

  // Zona de peligro con muelle: pinchos o agua entre el muelle y una meseta alta (6.5 sobre la pista). El muelle
  // lanza al jugador por encima de la franja y la meseta lo recibe. Con galería, un tubo baja bajo los pinchos:
  // es el camino sin peligro.
  const hazardSec = (kind, gallery) => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const wd = rnd(7, 8);                              // ancho de la franja de pinchos o de agua
    const Xs = x + rnd(10, 14);                        // boca de bajada (solo con galería)
    const W = DROP_W, yF = top - DROP_D;
    const sp = gallery ? Xs + W + 5 : x + rnd(10, 14); // muelle
    const b0 = sp + 4, b1 = b0 + wd;                   // franja de pinchos o agua
    if (gallery) {
      // Galería bajo la losa; los pinchos quedan sobre la losa y el vuelo del muelle cae en su extremo
      const end = sp + 30;
      pushGround(x, Xs, top);
      const drop = addPath(slidePts(Xs, top + 0.5, W, DROP_D, -1), 'drop');
      const rise = addPath(slidePts(end, yF + 0.5, W, DROP_D, 1), 'rise');
      pathRings(drop, [0.4, 0.7]);
      pathRings(rise, [0.4, 0.7]);
      S.push({ kind: 'ground', x0: Xs, x1: end - 8, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
      S.push({ kind: 'ground', x0: end - 8, x1: end - 1, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
      S.push({ kind: 'ground', x0: end - 1, x1: end + W, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
      S.push({ kind: 'ground', x0: Xs + W, x1: end + W, y0: top - 4, y1: top, slab: true });
      S.push({ kind: 'ceiling', x0: Xs + W, x1: end + W, y0: top - 4, y1: top - 3.9, base: top, slabCeil: true });
      lv.galleries.push({ xs: Xs, xr: end, w: W, yF, top });
      spring(sp, top);
      S.push({ kind: 'spikes', x0: b0, x1: b1, y0: top, y1: top + 1.1 });
      flightRings(sp, top, [0.25, 0.45, 0.65]);
      ringArc(b0 + wd / 2, top + 2.4, wd, 3);
      x = end + W;
      runSec(rnd(10, 16));                 // la subida deja al jugador en un tramo llano (no en un hueco)
      return;
    }
    if (kind === 'water') {
      pushGround(x, b0, top);
      S.push({ kind: 'water', x0: b0, x1: b1, level: top - 1.4 });
    } else {
      pushGround(x, b1, top);
      S.push({ kind: 'spikes', x0: b0, x1: b1, y0: top, y1: top + 1.1 });
    }
    spring(sp, top);
    flightRings(sp, top, [0.25, 0.45, 0.65]);
    ringArc(b0 + wd / 2, top + 2.4, wd, 3);
    ringArc(b1 + 9, top + 7.7, 6, 5);                  // arco de anillos sobre la meseta
    if (kind === 'water') {                            // pez saltarín escondido bajo el agua del hueco
      lv.enemies.push({ type: 'fish', x: (b0 + b1) / 2, minX: b0, maxX: b1, dir: 1, speed: 0, base: top - 2.0, y: top - 2.0, yv: 0, leap: false, cd: rnd(0.5, 2), gap: rnd(2.2, 3.2), alive: true, inv: 0, r: 0.61 });
    }
    x = mesa(b1, 6.5, 26, 10);
  };

  // Muelle y meseta: el muelle lanza al jugador (sin perder velocidad) sobre un terreno de 4 de altura
  const liftSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const sp = x + rnd(9, 12), wx = sp + WALL;
    pushGround(x, wx, top);
    spring(sp, top);
    flightRings(sp, top, [0.25, 0.45]);
    ringArc(wx + 9, top + 5.2, 6, 5);
    x = mesa(wx, 4, 26, 10);
  };

  // Escalada en dos mesetas: un muelle lleva a una de 4 y otro, sobre ella, a una de 8 que baja a la pista
  const climbSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const sp1 = x + rnd(9, 12), wx1 = sp1 + WALL;
    const sp2 = wx1 + 20, wx2 = sp2 + WALL;          // el vuelo del primer muelle cae entre los dos muelles
    pushGround(x, wx1, top);
    spring(sp1, top);
    flightRings(sp1, top, [0.25, 0.45]);
    S.push({ kind: 'ground', x0: wx1, x1: wx2, y0: -4, y1: top + 4 });
    spring(sp2, top + 4);
    flightRings(sp2, top + 4, [0.25, 0.45]);
    ringArc(wx1 + 9, top + 5.2, 6, 5);
    x = mesa(wx2, 8, 12, 12);
    ringArc(wx2 + 6, top + 9.2, 6, 5);
  };

  // Valle: bajada en rampa hasta un fondo llano con franja de aceleración y subida en rampa. En la zona acuática
  // el fondo es una laguna poco profunda que se atraviesa chapoteando.
  const dipSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const D = zi === 2 ? 2.2 : rnd(6, 8);
    const Ld = rnd(12, 15), Lf = rnd(8, 12), Lu = rnd(12, 15);
    const x0 = x, fl = top - D, xf = x0 + Ld, xu = xf + Lf;
    S.push({ kind: 'slope', x0, x1: xf, ya: top, yb: fl, y0: -4, y1: top });
    if (zi === 2) S.push({ kind: 'ground', x0: xf, x1: xu, y0: Math.min(-4, fl - 2), y1: fl, wade: true, wl: fl + 0.8 });
    else S.push({ kind: 'ground', x0: xf, x1: xu, y0: Math.min(-4, fl - 2), y1: fl, boost: 1 });
    S.push({ kind: 'slope', x0: xu, x1: xu + Lu, ya: fl, yb: top, y0: -4, y1: top });
    ringLine(xf + 1, xu - 1, fl + 1.3, 5);
    x = xu + Lu;
  };

  // Arroyo: un hueco poco profundo con agua por el que se chapotea (más despacio que en la pista)
  const streamSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const L = rnd(14, 18), D = 1.1, x0 = x;
    S.push({ kind: 'slope', x0, x1: x0 + 2.5, ya: top, yb: top - D, y0: -4, y1: top });
    S.push({ kind: 'ground', x0: x0 + 2.5, x1: x0 + L - 2.5, y0: -4, y1: top - D, wade: true, wl: top - 0.3 });
    S.push({ kind: 'slope', x0: x0 + L - 2.5, x1: x0 + L, ya: top - D, yb: top, y0: -4, y1: top });
    ringLine(x0 + 4, x0 + L - 4, top + 0.8, 4);
    x = x0 + L;
  };

  // Cascada: un muelle lanza a una meseta alta; su borde cae a un estanque poco profundo y una rampa vuelve a la pista
  const cascadeSec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const sp = x + rnd(9, 12), wx = sp + 11, Lm = 14, PD = 4, px = wx + Lm;
    pushGround(x, wx, top);
    spring(sp, top);
    flightRings(sp, top, [0.25, 0.45]);
    S.push({ kind: 'ground', x0: wx, x1: px, y0: -4, y1: top + 6.5 });
    S.push({ kind: 'ground', x0: px, x1: px + 16, y0: -4, y1: top - PD, wade: true, wl: top - PD + 1.3 });
    S.push({ kind: 'slope', x0: px + 16, x1: px + 26, ya: top - PD, yb: top, y0: -4, y1: top });
    lv.falls.push({ x: px, yTop: top + 6.5, yBot: top - PD + 1.3, w: 2.2 });
    ringArc(wx + 7, top + 7.7, 6, 5);
    x = px + 26;
  };

  // Inicio tranquilo y después secciones según el perfil del acto
  runSec(rnd(24, 34), true);
  let secretPending = rng() < 0.7;      // a veces: una cámara oculta sobre la rama alta de este acto
  let cannonPending = rng() < 0.7;      // a veces: un cañón que lanza a un mirador alto
  let snakePending = zi !== 2;          // verde e industrial: al menos una cueva secreta por fase
  while (x < prof.len) {
    const r = pickWeighted(prof.w, rng);
    if (secretPending && x > prof.len * 0.35) { secretPending = false; upperSec(true); continue; }
    if (cannonPending && x > prof.len * 0.4) { cannonPending = false; cannonSec(); continue; }
    if (snakePending && x > prof.len * 0.5) { snakePending = false; snakeSec(); runSec(rnd(10, 16)); continue; }
    if (r === 'upper') { upperSec(false); continue; }
    if (r === 'tunnels') { tunnelsSec(); runSec(rnd(10, 16)); continue; }
    if (r === 'run') runSec(rnd(30, 60));
    else if (r === 'hills') hillsSec(rnd(60, 90));
    else if (r === 'gap') { gapSec(); runSec(rnd(10, 16)); }
    else if (r === 'boost') boostSec(rnd(28, 40));
    else if (r === 'loop') { loopSec(); runSec(rnd(12, 18)); }
    else if (r === 'snake') { snakeSec(); runSec(rnd(10, 16)); }
    else if (r === 'gentle') gentleSec();
    else if (r === 'step') stepSec();
    else if (r === 'ledge') ledgeSec();
    else if (r === 'spike') hazardSec('spikes', zi < 2 && rng() < 0.5);
    else if (r === 'water') hazardSec('water', false);
    else if (r === 'dip') { dipSec(); runSec(rnd(12, 18)); }          // la subida termina en un tramo llano (no en un hueco)
    else if (r === 'stream') { streamSec(); runSec(rnd(12, 18)); }
    else if (r === 'cascade') { cascadeSec(); runSec(rnd(12, 18)); }
    else if (r === 'lift') liftSec();
    else if (r === 'climb') climbSec();
  }
  // Arena del jefe final (tercer acto de cada zona): un tramo llano con el jefe antes de la meta
  if (ai === 2) {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const len = 70;
    pushGround(x, x + len, top);
    ringLine(x + 6, x + len - 6, top + 1.2, 6);
    lv.enemies.push({ type: 'boss', x: x + len * 0.7, minX: x + 12, maxX: x + len - 8, dir: -1, speed: 2.6, y: top, hp: 3, cd: 1.6, phase: 0, alive: true, inv: 0, r: 1.6 });
    x += len;
  }
  // Meta: suelo liso al final
  pushGround(x, x + 40, top);
  lv.goalX = x + 12; lv.goalY = top;
  lv.endX = x + 40;
  // Reparto de enemigos: cada tramo de 100 unidades tiene al menos seis, sobre la pista llana y lejos de trampas
  const placeEnemy = (type, ex, s, r) => {
    const y = s.y1, dir = r() < 0.5 ? -1 : 1, phase = r() * 6;
    const base = { x: ex, minX: Math.max(s.x0 + 2, ex - 4), maxX: Math.min(s.x1 - 3, ex + 4), dir, y, phase, alive: true, inv: 0, r: 0.71 };
    switch (type) {
      case "fly": return { ...base, type, base: y + 1.4 + r() * 0.5, y: y + 1.6, speed: 2.4 + r() * 0.6, r: 0.9 };
      case "wasp": return { ...base, type, minX: ex - 6, maxX: ex + 6, r: 0.6, base: y + 2.2 + r(), y: y + 2.6, mode: "patrol", diveT: 0, cd: 1 + r() * 2 };
      case "hop": return { ...base, type, cd: 0.5 + r() * 1.5, air: false, yv: 0, hv: 0, r: 0.67 };
      case "spiny": return { ...base, type, spiky: true, speed: 1.6 + r() * 0.6, r: 0.68 };
      case "shoot": return { type, x: ex, minX: ex, maxX: ex, dir: -1, speed: 0, y, cd: 1 + r() * 1.5, phase: 0, alive: true, inv: 0, r: 0.71 };
      case "housefly": return { ...base, type, ax: ex, minX: ex - 5, maxX: ex + 5, speed: 2.2 + r() * 0.8, base: y + 1.1 + r() * 0.5, y: y + 1.4, r: 0.83 };
      case "worm": return { ...base, type, up: 0, st: "hide", t: 0.5 + r() * 2.5, base: y, r: 0.75 };
      case "beetle": return { ...base, type, speed: 2.4 + r() * 0.8, r: 0.75 };
      case "shield": case "charger": case "bomb":
        return makeBot(type, ex, y, r, { minX: Math.max(s.x0 + 2, ex - 4), maxX: Math.min(s.x1 - 3, ex + 4) });
      case "laser": return makeBot("laser", ex, y, r);
      case "support": return makeBot("support", ex, y + 1.6 + r() * 0.6, r, { minX: Math.max(s.x0 + 2, ex - 5), maxX: Math.min(s.x1 - 3, ex + 5) });
      default: return base;
    }
  };
  const boss = lv.enemies.find((e) => e.type === "boss");
  const stopX = Math.min(lv.goalX - 50, boss ? boss.minX - 12 : Infinity);
  // Sobre el suelo: tramos llanos de al menos 6 unidades; los voladores pueden ir en cualquier sitio sin trampas
  const flat = S.filter((q) => q.kind === "ground" && !q.wade && !q.gallery && !q.slab && !q.noEnemy && q.x1 - q.x0 >= 6);
  const traps = S.filter((q) => ["spikes", "water", "spring", "block"].includes(q.kind));
  const trapNear = (x0, x1) => traps.some((h) => h.x1 > x0 - 3 && h.x0 < x1 + 3) || lv.checkpoints.some((c) => c.x > x0 - 4 && c.x < x1 + 4);
  const enemyNear = (ex) => lv.enemies.some((e) => Math.abs(e.x - ex) < 9);
  for (let c = 60; c < stopX; c += 100) {
    const cEnd = Math.min(c + 100, stopX);
    for (let tries = 0, have = lv.enemies.filter((e) => e.x >= c && e.x < cEnd).length; have < 6 && tries < 1500; tries++) {
      const ex = c + (cEnd - c) * rng();
      // Bichos de cada zona: gusanos y escarabajos en la verde, escarabajos en la industrial, moscas sobre el agua
      const bugs = { worm: zi === 0 ? 4 : 0, beetle: zi === 1 ? 5 : zi === 0 ? 3 : 0, housefly: zi === 2 ? 4 : 2 };
      const type = pickWeighted({ walk: 4, fly: prof.fly * 6, wasp: prof.wasp * 5, hop: prof.hop * 8, spiny: prof.spiny * 8, shoot: prof.shoot * 8, ...bugs, ...ROBOT_FILL[zi] }, rng);
      const flying = type === "fly" || type === "wasp" || type === "housefly" || type === "support";
      const s = flat.find((q) => ex >= q.x0 + 3 && ex <= q.x1 - 3);
      if (!flying && !s) continue;
      if (lv.caves.some((c) => ex > c.x0 - 14 && ex < c.x1 + 14)) continue;   // nada cerca de una cueva: un volador o una torreta alcanzan el tubo
      if ((type === "shoot" || type === "laser") && (!s || ex - s.x0 < 16)) continue;
      if (enemyNear(ex) || trapNear(ex - 4, ex + 4)) continue;
      const seg = flying ? { x0: ex - 4, x1: ex + 4, y1: laneY(S, ex) } : s;
      lv.enemies.push(placeEnemy(type, ex, seg, rng));
      have++;
    }
  }
  // Ningún bicho cerca de una cueva, tampoco los de las secciones anteriores: su patrulla o su alcance llegan al tubo
  lv.enemies = lv.enemies.filter((e) => !lv.caves.some((c) => Math.max(e.x, e.maxX ?? e.x) + 14 > c.x0 && Math.min(e.x, e.minX ?? e.x) - 14 < c.x1));
  // Ningún suelo puede quedar con la base por encima de su superficie (un valle o un arroyo bajo -4)
  for (const q of S) if (q.kind === 'ground' && q.y0 >= q.y1) q.y0 = q.y1 - 4;
  return lv;
}
