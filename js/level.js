// Generador de fases: secciones (tramos con objetos, colinas, huecos, bucles, bajadas a una galería subterránea y escaladas)
import { mulberry32, clamp, lerp, pickWeighted } from './util.js';

export const ZONE_NAMES = ['Zona Verde', 'Zona Industrial', 'Zona Acuática'];
export const KILL_Y = [-14, -14, -3.4];
export const SLOPE_MAX = 3.2;
export const LOOP_R = 3;      // radio del bucle vertical (centro de la trayectoria)
export const TUBE_R = 1.6;    // radio interior del tubo que rodea la trayectoria
export const SPRING_V = 26;
export const DROP_W = 6;      // ancho horizontal de una bajada (y de una subida)
export const DROP_D = 7;      // profundidad de una bajada: hasta el suelo de la galería

// Cada acto tiene longitud y pesos de sección propios (el agua no deja bajar: el fondo queda bajo el mar).
// spike: pinchos con muelle y plataforma alta (en verde e industrial, a veces con galería bajo los pinchos)
// water: un hueco con agua, con muelle y plataforma alta. climb: escalada en tres niveles
const PROFILE = [
  [ // Verde: tramos, bucles, bajadas, pinchos y charcos
    { len: 900, enemies: 0.45, w: { run: 36, hills: 18, gap: 10, boost: 8, loop: 6, gallery: 5, spike: 7, water: 3, climb: 5 } },
    { len: 1050, enemies: 0.55, w: { run: 28, hills: 14, gap: 9, boost: 8, loop: 12, gallery: 6, spike: 9, water: 4, climb: 6 } },
    { len: 1200, enemies: 0.65, w: { run: 22, hills: 10, gap: 8, boost: 7, loop: 16, gallery: 6, spike: 11, water: 4, climb: 7 } },
  ],
  [ // Industrial: cintas, huecos, pinchos, escaladas y mantenimiento subterráneo
    { len: 950, enemies: 0.5, w: { run: 32, hills: 4, gap: 16, boost: 9, loop: 7, gallery: 6, spike: 9, climb: 7 } },
    { len: 1100, enemies: 0.6, w: { run: 26, hills: 4, gap: 18, boost: 8, loop: 10, gallery: 7, spike: 11, climb: 8 } },
    { len: 1250, enemies: 0.7, w: { run: 20, hills: 4, gap: 20, boost: 7, loop: 12, gallery: 8, spike: 13, climb: 9 } },
  ],
  [ // Acuática: balsas, bucles, pinchos de coral y agua con muelle
    { len: 1000, enemies: 0.5, w: { run: 26, hills: 10, gap: 18, boost: 5, loop: 8, spike: 7, water: 9, climb: 4 } },
    { len: 1150, enemies: 0.6, w: { run: 22, hills: 10, gap: 18, boost: 5, loop: 10, spike: 8, water: 11, climb: 6 } },
    { len: 1300, enemies: 0.7, w: { run: 18, hills: 8, gap: 18, boost: 5, loop: 14, spike: 8, water: 13, climb: 7 } },
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
    solids: [], enemies: [], rings: [], checkpoints: [], paths: [], galleries: [],
  };
  const S = lv.solids;
  let x = -10, top = 0, nextCp = 60;

  const pushGround = (x0, x1, y1, extra = {}) => S.push({ kind: 'ground', x0, x1, y0: -4, y1, ...extra });
  // fwd: el muelle conserva la velocidad horizontal al lanzar (vuela hacia delante, no solo arriba)
  const spring = (sx, y0, fwd = false) => S.push({ kind: 'spring', x0: sx, x1: sx + 1.2, y0, y1: y0 + 0.6, power: SPRING_V, squash: 0, fwd });
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
      if (rng() < 0.6) ringArc(rnd(x0 + 2, x1 - 6), top + 1.2, 4.5, 5);
      // Muelles y piedras lejos del final del tramo: un muelle de lado no debe lanzar al jugador sobre el hueco
      if (len > 32 && rng() < 0.22) spring(rnd(x0 + 2, x1 - 28), top, true);   // lanza hacia delante: el vuelo cae dentro del tramo
      if (len > 14 && rng() < 0.18) boulder(rnd(x0 + 4, x1 - 9), top);
      if (len > 14 && rng() < 0.28) {                  // plataforma alta con muelle debajo
        const px = rnd(x0 + 2, x1 - 7), pw = rnd(3, 5), py = top + rnd(3.2, 4);
        S.push({ kind: 'platform', x0: px, x1: px + pw, y0: py - 0.6, y1: py });
        ringArc(px + pw / 2, py + 1.1, pw, 5);
        spring(px + 0.3, top);
        if (rng() < 0.4) boulder(px + 0.5, py);
      }
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
  const gallerySec = () => {
    const W = DROP_W, D = DROP_D, yF = top - D;
    const Xs = x + rnd(12, 18);                     // boca de bajada, en la superficie
    const G = rnd(30, 38);                           // longitud de la galería entre los dos pozos
    const Xr = Xs + W + G;                           // boca de subida, en el suelo de la galería
    pushGround(x, Xs, top);
    ringArc(x + (Xs - x) * 0.5, top + 1.2, 4.5, 5);
    const drop = addPath(slidePts(Xs, top + 0.5, W, D, -1), 'drop');
    const rise = addPath(slidePts(Xr, yF + 0.5, W, D, 1), 'rise');
    pathRings(drop, [0.3, 0.5, 0.7]);
    pathRings(rise, [0.3, 0.5, 0.7]);
    // Suelo de la galería (franja de aceleración justo antes de la subida)
    S.push({ kind: 'ground', x0: Xs, x1: Xr - 8, y0: yF - 8, y1: yF, gallery: true });
    S.push({ kind: 'ground', x0: Xr - 8, x1: Xr - 1, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
    S.push({ kind: 'ground', x0: Xr - 1, x1: Xr + W, y0: yF - 8, y1: yF, gallery: true });
    // Losa de la superficie sobre la galería y su techo: no se puede saltar a través de ella
    S.push({ kind: 'ground', x0: Xs + W, x1: Xr, y0: top - 4, y1: top, slab: true });
    S.push({ kind: 'ceiling', x0: Xs + W, x1: Xr, y0: top - 4, y1: top - 3.9, base: top, slabCeil: true });
    lv.galleries.push({ xs: Xs, xr: Xr, w: W, yF, top });
    ringLine(Xs + W + 2, Xr - 2, yF + 1.2, 6);
    if (rng() < 0.6) {
      lv.enemies.push({ x: rnd(Xs + W + 3, Xr - 10), minX: Xs + W + 1, maxX: Xr - 9, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: yF });
    }
    if (rng() < 0.5) boulder(rnd(Xs + W + 6, Xr - 14), yF);
    x = Xr + W;
  };

  // Zona de peligro con muelle: pinchos o agua entre el muelle y el suelo de llegada.
  // El muelle, pisado corriendo, lanza al jugador por encima de la franja; una plataforma alta (6.5 sobre la pista)
  // recoge a quien va en el vuelo. Con galería, un tubo baja bajo los pinchos: el camino sin peligro.
  const hazardSec = (kind, gallery) => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const wd = rnd(7, 8);                              // ancho de la franja de pinchos o de agua
    const Xs = x + rnd(10, 14);                        // boca de bajada (solo con galería)
    const W = DROP_W, yF = top - DROP_D;
    const sx = gallery ? Xs + W + 5 : x + rnd(10, 14); // muelle
    const b0 = sx + 4, b1 = b0 + wd;                   // franja de pinchos o agua
    const end = sx + 26;                               // suelo de llegada (el vuelo del muelle cae hacia sx + 20)
    const P = top + 6.5;                               // plataforma alta sobre la franja
    if (gallery) {
      pushGround(x, Xs, top);
      const drop = addPath(slidePts(Xs, top + 0.5, W, DROP_D, -1), 'drop');
      const rise = addPath(slidePts(end, yF + 0.5, W, DROP_D, 1), 'rise');
      pathRings(drop, [0.4, 0.7]);
      pathRings(rise, [0.4, 0.7]);
      S.push({ kind: 'ground', x0: Xs, x1: end - 8, y0: yF - 8, y1: yF, gallery: true });
      S.push({ kind: 'ground', x0: end - 8, x1: end - 1, y0: yF - 8, y1: yF, gallery: true, boost: 1 });
      S.push({ kind: 'ground', x0: end - 1, x1: end + W, y0: yF - 8, y1: yF, gallery: true });
      S.push({ kind: 'ground', x0: Xs + W, x1: end, y0: top - 4, y1: top, slab: true });
      S.push({ kind: 'ceiling', x0: Xs + W, x1: end, y0: top - 4, y1: top - 3.9, base: top, slabCeil: true });
      lv.galleries.push({ xs: Xs, xr: end, w: W, yF, top });
      spring(sx, top, true);
      S.push({ kind: 'spikes', x0: b0, x1: b1, y0: top, y1: top + 1.1 });
      x = end + W;
    } else {
      if (kind === 'water') {
        pushGround(x, b0, top); pushGround(b1, end, top);
        S.push({ kind: 'water', x0: b0, x1: b1, level: top - 1.4 });
      } else {
        pushGround(x, end, top);
        S.push({ kind: 'spikes', x0: b0, x1: b1, y0: top, y1: top + 1.1 });
      }
      spring(sx, top, true);
      x = end;
    }
    // Plataforma alta sobre la franja, anillos en la trayectoria del muelle y arco de anillos sobre la franja
    S.push({ kind: 'platform', x0: sx + 12, x1: sx + 22, y0: P - 0.6, y1: P });
    ringArc(sx + 17, P + 1.2, 8, 5);
    for (const t of [0.25, 0.45, 0.65]) lv.rings.push({ x: sx + 22 * t, y: top + 1.1 + 26 * t - 21 * t * t + 0.5, taken: false });
    ringArc(b0 + wd / 2, top + 2.4, wd, 3);
  };

  // Escalada en tres niveles: un muelle lanza a una plataforma alta (6.5) y otro, sobre ella, a una más alta (12.5)
  const climb3Sec = () => {
    if (x > nextCp) { lv.checkpoints.push({ x: x + 2, y: top, hit: false }); nextCp = x + 170; }
    const s1 = x + rnd(10, 14), s2 = s1 + 22, P1 = top + 6.5, P2 = top + 12.5;
    pushGround(x, s1 + 48, top);
    spring(s1, top, true);
    S.push({ kind: 'platform', x0: s1 + 11, x1: s1 + 25, y0: P1 - 0.6, y1: P1 });
    spring(s2, P1, true);
    S.push({ kind: 'platform', x0: s2 + 14, x1: s2 + 24, y0: P2 - 0.6, y1: P2 });
    ringArc(s1 + 18, P1 + 1.2, 8, 5);
    ringArc(s2 + 19, P2 + 1.2, 8, 5);
    x = s1 + 48;
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
    else if (r === 'climb') climb3Sec();
  }
  // Meta: suelo liso al final
  pushGround(x, x + 40, top);
  lv.goalX = x + 12; lv.goalY = top;
  lv.endX = x + 40;
  return lv;
}
