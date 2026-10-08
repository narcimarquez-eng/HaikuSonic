// Generador de fases: secciones (tramos con objetos, colinas, huecos, bucles, tubos y escaladas)
import { mulberry32, clamp, lerp, pickWeighted } from './util.js';

export const ZONE_NAMES = ['Zona Verde', 'Zona Industrial', 'Zona Acuática'];
export const KILL_Y = [-14, -14, -3.4];
export const SLOPE_MAX = 3.2;
export const LOOP_R = 3;      // radio del bucle vertical (centro de la trayectoria)
export const HUMP_H = 3;      // altura de la colina dentro del tubo
export const TUBE_R = 1.6;    // radio interior del tubo que rodea la trayectoria
export const SPRING_V = 26;

// Cada acto tiene longitud y pesos de sección propios
const PROFILE = [
  [ // Verde: tramos, colinas y bucles
    { len: 900, enemies: 0.45, w: { run: 40, hills: 22, gap: 12, boost: 8, loop: 6, tube: 7, climb: 5 } },
    { len: 1050, enemies: 0.55, w: { run: 30, hills: 18, gap: 10, boost: 9, loop: 14, tube: 14, climb: 5 } },
    { len: 1200, enemies: 0.65, w: { run: 24, hills: 14, gap: 12, boost: 8, loop: 20, tube: 16, climb: 6 } },
  ],
  [ // Industrial: cintas, huecos y escaladas
    { len: 950, enemies: 0.5, w: { run: 36, hills: 4, gap: 24, boost: 10, loop: 7, tube: 10, climb: 9 } },
    { len: 1100, enemies: 0.6, w: { run: 30, hills: 4, gap: 26, boost: 9, loop: 10, tube: 12, climb: 9 } },
    { len: 1250, enemies: 0.7, w: { run: 24, hills: 4, gap: 28, boost: 8, loop: 14, tube: 14, climb: 8 } },
  ],
  [ // Acuática: balsas sobre el agua y tubos
    { len: 1000, enemies: 0.5, w: { run: 30, hills: 12, gap: 30, boost: 6, loop: 8, tube: 10, climb: 4 } },
    { len: 1150, enemies: 0.6, w: { run: 24, hills: 12, gap: 30, boost: 6, loop: 12, tube: 14, climb: 6 } },
    { len: 1300, enemies: 0.7, w: { run: 20, hills: 10, gap: 30, boost: 6, loop: 16, tube: 16, climb: 8 } },
  ],
];

// Altura de la rampa en x
export const slopeAt = (s, x) => s.ya + (s.yb - s.ya) * clamp((x - s.x0) / (s.x1 - s.x0), 0, 1);

// Altura de la superficie bajo la coordenada x (sin contar plataformas, muelles ni piedras)
export function laneY(solids, x) {
  for (const s of solids) {
    if (s.kind === 'platform' || s.kind === 'spring' || s.kind === 'ceiling' || s.kind === 'block') continue;
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
// Colina: sube y baja entre x0 y x1 con tangente horizontal en los extremos
export function humpPts(x0, x1, y0, H) {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    pts.push([x0 + (x1 - x0) * u, y0 + H * (1 - Math.cos(2 * Math.PI * u)) / 2]);
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
    solids: [], enemies: [], rings: [], checkpoints: [], paths: [],
  };
  const S = lv.solids;
  let x = -10, top = 0, nextCp = 60;

  const pushGround = (x0, x1, y1, extra = {}) => S.push({ kind: 'ground', x0, x1, y0: -4, y1, ...extra });
  const spring = (sx, y0) => S.push({ kind: 'spring', x0: sx, x1: sx + 1.2, y0, y1: y0 + 0.6, power: SPRING_V, squash: 0 });
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
        lv.enemies.push({ x: rnd(x0 + 4, x1 - 4), minX: x0 + 1, maxX: x1 - 1, dir: rng() < 0.5 ? -1 : 1, alive: true, phase: rng() * 6, y: top });
      }
      if (rng() < 0.6) ringArc(rnd(x0 + 2, x1 - 6), top + 1.2, 4.5, 5);
      if (len > 8 && rng() < 0.22) spring(rnd(x0 + 2, x1 - 3), top);
      if (len > 10 && rng() < 0.18) boulder(rnd(x0 + 4, x1 - 6), top);
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

  // Colina dentro de un tubo ondulado
  const tubeSec = () => {
    const a = x, b = x + rnd(20, 26);
    pushGround(a, b, top);
    pathRings(addPath(humpPts(a, b, top + 0.5, HUMP_H), 'hump'), [0.2, 0.35, 0.5, 0.65, 0.8]);
    x = b;
  };

  // Escalada: dos plataformas altas con muelles
  const climbSec = () => {
    const len = rnd(36, 46), x0 = x, x1 = x + len;
    pushGround(x0, x1, top);
    const p1 = x0 + 8, p2 = x0 + len - 14;
    S.push({ kind: 'platform', x0: p1, x1: p1 + 4, y0: top + 3.0, y1: top + 3.6 });
    spring(p1 + 0.5, top);
    ringArc(p1 + 2, top + 4.7, 4, 5);
    S.push({ kind: 'platform', x0: p2, x1: p2 + 4, y0: top + 3.4, y1: top + 4.0 });
    spring(p2 + 0.5, top);
    ringArc(p2 + 2, top + 5.1, 4, 5);
    x = x1;
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
    else if (r === 'tube') { tubeSec(); runSec(rnd(10, 16)); }
    else if (r === 'climb') climbSec();
  }
  // Meta: suelo liso al final
  pushGround(x, x + 40, top);
  lv.goalX = x + 12; lv.goalY = top;
  lv.endX = x + 40;
  return lv;
}
