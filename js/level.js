// Generador de fases: secciones (tramos con objetos, colinas, huecos, bucles, bajadas a una galería subterránea,
// mesetas con muelle y escaladas)
import { mulberry32, clamp, lerp, pickWeighted } from './util.js';

export const ZONE_NAMES = ['Zona Verde', 'Zona Industrial', 'Zona Acuática'];
export const KILL_Y = [-14, -14, -3.4];
export const SLOPE_MAX = 3.2;
export const LOOP_R = 3;      // radio del bucle vertical (centro de la trayectoria)
export const TUBE_R = 1.6;    // radio interior del tubo que rodea la trayectoria
export const SPRING_V = 26;
export const DROP_W = 6;      // ancho horizontal de una bajada (y de una subida)
export const DROP_D = 7;      // profundidad de una bajada: hasta el suelo de la galería
const WALL = 8.5;             // distancia del muelle al muro de una meseta: a velocidad de carrera el vuelo la libra

// Cada acto tiene longitud y pesos de sección propios (el agua no deja bajar: el fondo queda bajo el mar).
// spike: pinchos con muelle que lanza sobre una meseta (en verde e industrial, a veces con galería bajo los pinchos)
// water: un hueco con agua, con muelle y meseta. lift: muelle y meseta de 4. climb: dos mesetas (4 y 8)
const PROFILE = [
  [ // Verde: tramos, bucles, bajadas, pinchos, charcos y mesetas
    { len: 900, enemies: 0.45, fly: 0.30, shoot: 0.25, w: { run: 34, hills: 16, gap: 9, boost: 7, loop: 6, gallery: 5, spike: 7, water: 3, lift: 8, climb: 4 } },
    { len: 1050, enemies: 0.55, fly: 0.40, shoot: 0.35, w: { run: 26, hills: 12, gap: 8, boost: 7, loop: 11, gallery: 6, spike: 9, water: 4, lift: 9, climb: 6 } },
    { len: 1200, enemies: 0.65, fly: 0.50, shoot: 0.45, w: { run: 20, hills: 9, gap: 7, boost: 6, loop: 14, gallery: 6, spike: 10, water: 4, lift: 10, climb: 7 } },
  ],
  [ // Industrial: cintas, huecos, pinchos, mesetas y mantenimiento subterráneo
    { len: 950, enemies: 0.5, fly: 0.25, shoot: 0.35, w: { run: 30, hills: 4, gap: 14, boost: 8, loop: 6, gallery: 6, spike: 9, lift: 8, climb: 5 } },
    { len: 1100, enemies: 0.6, fly: 0.30, shoot: 0.45, w: { run: 24, hills: 4, gap: 16, boost: 7, loop: 10, gallery: 7, spike: 11, lift: 9, climb: 7 } },
    { len: 1250, enemies: 0.7, fly: 0.35, shoot: 0.55, w: { run: 18, hills: 4, gap: 18, boost: 6, loop: 12, gallery: 8, spike: 13, lift: 10, climb: 8 } },
  ],
  [ // Acuática: balsas, bucles, pinchos de coral, agua y mesetas
    { len: 1000, enemies: 0.5, fly: 0.45, shoot: 0.20, w: { run: 24, hills: 10, gap: 16, boost: 5, loop: 8, spike: 7, water: 9, lift: 6, climb: 4 } },
    { len: 1150, enemies: 0.6, fly: 0.50, shoot: 0.30, w: { run: 20, hills: 10, gap: 16, boost: 5, loop: 10, spike: 8, water: 11, lift: 7, climb: 5 } },
    { len: 1300, enemies: 0.7, fly: 0.55, shoot: 0.35, w: { run: 16, hills: 8, gap: 16, boost: 5, loop: 14, spike: 8, water: 13, lift: 8, climb: 6 } },
  ],
];

// Altura de la rampa en x
export const slopeAt = (s, x) => s.ya + (s.yb - s.ya) * clamp((x - s.x0) / (s.x1 - s.x0), 0, 1);

// Altura de la superficie bajo la coordenada x (sin contar plataformas, muelles ni piedras)
export function laneY(solids, x) {
  for (const s of solids) {
    if (s.kind === 'platform' || s.kind === 'spring' || s.kind === 'ceiling' || s.kind === 'block' || s.kind === 'spikes' || s.kind === 'water') continue;
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

// Bucle: empieza y acaba en (x0, y0) con tangente horizontal
export function loopPts(x0, y0, R) {
  const pts = [];
  for (let i = 0; i <= 160; i++) {
    const th = (i / 160) * 2 * Math.PI;
    pts.push([x0 + R * Math.sin(th), y0 + R - R * Math.cos(th)]);
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
    solids: [], enemies: [], rings: [], checkpoints: [], paths: [], galleries: [], shots: [],
  };
  const S = lv.solids;
  let x = -10, top = 0, nextCp = 60;

  const pushGround = (x0, x1, y1, extra = {}) => S.push({ kind: 'ground', x0, x1, y0: -4, y1, ...extra });
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
        lv.enemies.push({ x: rnd(x0 + 4, x1 - 6), minX: x0 + 2, maxX: x1 - 4, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: top });   // se aleja del borde: no espera junto a los huecos
      }
      if (len > 24 && rng() < prof.fly) {              // dron que patrulla sobre el tramo, a la altura de un salto
        const fx0 = rnd(x0 + 4, x1 - 16), fw = rnd(8, 12);
        lv.enemies.push({ type: 'fly', x: fx0, minX: fx0, maxX: fx0 + fw, dir: rng() < 0.5 ? -1 : 1, speed: rnd(2.2, 3.2), base: top + rnd(1.8, 2.4), y: top + 2, phase: rng() * 6, alive: true, inv: 0, r: 0.5 });
      }
      if (len > 30 && rng() < prof.shoot) {            // torreta en el suelo, lejos del inicio del tramo (el punto de control no cae en su alcance)
        const sx = rnd(x0 + 16, x1 - 10);
        lv.enemies.push({ type: 'shoot', x: sx, minX: sx, maxX: sx, dir: -1, speed: 0, y: top, cd: rnd(0.5, 1.5), phase: 0, alive: true, inv: 0, r: 0.5 });
      }
      if (rng() < 0.6) ringArc(rnd(x0 + 2, x1 - 6), top + 1.2, 4.5, 5);
      // Muelles y piedras lejos del final del tramo: el vuelo del muelle cae dentro del tramo
      if (len > 32 && rng() < 0.22) spring(rnd(x0 + 2, x1 - 28), top);
      if (len > 14 && rng() < 0.18) boulder(rnd(x0 + 4, x1 - 9), top);
      if (len > 20 && rng() < 0.22) {
        let ax = rnd(x0 + 4, x1 - 19);
        const n = rng() < 0.5 ? 1 : 2;
        for (let i = 0; i < n && ax + 5 <= x1 - 14; i++) { overhang(ax, top); ax += rnd(9, 11); }
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

  // Colinas: subidas y bajadas de rampa con un pequeño tramo plano entre ellas
  const hillsSec = (len) => {
    const end = x + len;
    while (x < end - 4) {
      const L = rnd(10, 15), nt = clamp(top + (rng() < 0.5 ? -1 : 1) * rnd(1.2, 2.2), 0, SLOPE_MAX);
      if (Math.abs(nt - top) > 0.3) {
        const sl = { x0: x, x1: x + L, ya: top, yb: nt };
        S.push({ kind: 'slope', ...sl, y0: -4, y1: Math.max(top, nt) });
        for (let i = 0; i < 4; i++) {
          const sx = x + L * (0.2 + i * 0.2);
          lv.rings.push({ x: sx, y: slopeAt(sl, sx) + 1.3, taken: false });
        }
        x += L; top = nt;
      }
      const f = rnd(3, 6);
      pushGround(x, x + f, top);
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

  // Bucle vertical: franja de aceleración antes para tener velocidad, y luego el tubo en lazo
  const loopSec = () => {
    const a = x + 6;
    S.push({ kind: 'ground', x0: x, x1: a, y0: -4, y1: top, boost: 1 });
    pushGround(a, a + 7, top);
    pathRings(addPath(loopPts(a, top + 0.5, LOOP_R), 'loop'), [0.2, 0.35, 0.5, 0.65, 0.8]);
    x = a + 7;
  };

  // Bajada: un tubo lleva de la superficie a una galería bajo la pista; otro tubo la devuelve arriba.
  // La losa de la superficie queda encima de la galería, así que el atajo es opcional (se puede saltar el pozo).
  // La galería es un túnel rápido: su suelo entero es franja de aceleración.
  const gallerySec = () => {
    const W = DROP_W, D = DROP_D, yF = top - D;
    const Xs = x + rnd(12, 18);                     // boca de bajada, en la superficie
    const G = rnd(40, 50);                           // longitud de la galería entre los dos pozos
    const Xr = Xs + W + G;                           // boca de subida, en el suelo de la galería
    pushGround(x, Xs, top);
    ringArc(x + (Xs - x) * 0.5, top + 1.2, 4.5, 5);
    const drop = addPath(slidePts(Xs, top + 0.5, W, D, -1), 'drop');
    const rise = addPath(slidePts(Xr, yF + 0.5, W, D, 1), 'rise');
    pathRings(drop, [0.3, 0.5, 0.7]);
    pathRings(rise, [0.3, 0.5, 0.7]);
    // Suelo de la galería: franja de aceleración de extremo a extremo
    S.push({ kind: 'ground', x0: Xs, x1: Xr - 8, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
    S.push({ kind: 'ground', x0: Xr - 8, x1: Xr - 1, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
    S.push({ kind: 'ground', x0: Xr - 1, x1: Xr + W, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
    // Losa de la superficie sobre la galería y su techo: no se puede saltar a través de ella
    S.push({ kind: 'ground', x0: Xs + W, x1: Xr, y0: top - 4, y1: top, slab: true });
    S.push({ kind: 'ceiling', x0: Xs + W, x1: Xr, y0: top - 4, y1: top - 3.9, base: top, slabCeil: true });
    lv.galleries.push({ xs: Xs, xr: Xr, w: W, yF, top });
    ringLine(Xs + W + 2, Xr - 2, yF + 1.2, 8);
    if (rng() < 0.6) {
      lv.enemies.push({ x: rnd(Xs + W + 3, Xr - 10), minX: Xs + W + 1, maxX: Xr - 9, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: yF });
    }
    if (rng() < 0.5) boulder(rnd(Xs + W + 6, Xr - 14), yF);
    x = Xr + W;
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
      S.push({ kind: 'ground', x0: Xs + W, x1: end, y0: top - 4, y1: top, slab: true });
      S.push({ kind: 'ceiling', x0: Xs + W, x1: end, y0: top - 4, y1: top - 3.9, base: top, slabCeil: true });
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
    const sp2 = wx1 + 18, wx2 = sp2 + WALL;          // el vuelo del primer muelle cae entre los dos muelles
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

  // Inicio tranquilo y después secciones según el perfil del acto
  runSec(rnd(24, 34), true);
  while (x < prof.len) {
    const r = pickWeighted(prof.w, rng);
    if (r === 'run') runSec(rnd(30, 60));
    else if (r === 'hills') hillsSec(rnd(45, 70));
    else if (r === 'gap') { gapSec(); runSec(rnd(10, 16)); }
    else if (r === 'boost') boostSec(rnd(28, 40));
    else if (r === 'loop') { loopSec(); runSec(rnd(12, 18)); }
    else if (r === 'gallery') { gallerySec(); runSec(rnd(10, 16)); }
    else if (r === 'spike') hazardSec('spikes', zi < 2 && rng() < 0.5);
    else if (r === 'water') hazardSec('water', false);
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
  return lv;
}
