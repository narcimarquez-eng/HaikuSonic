// Física: jugador, sólidos AABB con rampas, tubos, agua poco profunda y reglas (anillos, enemigos, control, meta)
import { input, isJumpHeld, readAxisX, readDown } from './input.js';
import { slopeAt, pathAt, laneY } from './level.js';
import { approach, clamp } from './util.js';

export const STEP = 1 / 120;      // paso fijo de física (estable a cualquier FPS)
export const LEVELS = 9;          // 3 zonas × 3 actos
export const PW = 0.8, PH = 1.0;  // caja de colisión del jugador
const GRAVITY = 42;
const EPS = 0.01;
const TOP_SPEED = 22, ACCEL = 16, FRICTION = 12, ROLL_FRICTION = 5, OVER_DRAG = 5;
const MAX_RUN = 38;               // velocidad máxima bajando pendientes
const UPHILL = 0.5, DOWNHILL = 1.6; // la pendiente frena la mitad al subir y acelera un 60% más al bajar
const WADE_MAX = 12;              // velocidad máxima chapoteando en agua poco profunda
const SPLASH_T = 0.14;            // intervalo entre salpicaduras al correr por el agua
const JUMP_V = 15.5, MAX_FALL = 48;
const DASH_MIN = 14, DASH_RANGE = 14;
const BOOST_V = 28;               // velocidad mínima sobre una franja de aceleración
const ENEMY_R = 0.45, RING_R = 0.8, MAX_SCATTER = 60;
const WALL_LIFT = 1.2;            // escalón que se sube al entrar de lado en una rampa
const STEP_UP = 0.3;              // escalón bajo los pies que se sube sin frenar (la unión de una rampa con la pista)
const MAX_SHOTS = 30;             // proyectiles de enemigos a la vez
const SPRING_VX = 24;             // velocidad horizontal máxima al salir de un muelle (el vuelo cae donde lo espera la meseta)

// Estado del jugador (se reinicia en cada fase)
export const player = {
  x: 0, y: 2, vx: 0, vy: 0, rings: 0, facing: 1,
  grounded: false, groundSolid: null, jumping: false, spinAir: false,
  crouch: false, charge: 0, dashT: 0, rolling: false, roll: 0, invT: 0,
  path: null, s: 0, pv: 0, wet: false, splashT: 0,
};

// Estado de la partida; main.js fija onComplete y onGameOver
export const G = {
  mode: 'title', lives: 3, score: 0, levelTime: 0, lv: null,
  checkpoint: { x: 0, y: 2 }, onComplete: null, onGameOver: null,
  fx: [],                           // efectos pendientes (chispas, salpicaduras): main.js los convierte en partículas
};

const slopeMax = (s, p) => Math.max(slopeAt(s, p.x - PW / 2), slopeAt(s, p.x + PW / 2));

// Golpe a un enemigo: los de la pista caen de una vez; el jefe aguanta tres golpes y luego estalla
function hitEnemy(e, y) {
  if (e.type === 'boss') {
    e.hp--; e.inv = 1;
    G.fx.push({ x: e.x, y });
    if (e.hp > 0) return;
    for (let i = 0; i < 5; i++) G.fx.push({ x: e.x + (i - 2) * 0.9, y: y + (i % 2) * 0.8 });
    G.score += 1000;
  } else {
    G.score += 100;
  }
  e.alive = false;
  G.fx.push({ x: e.x, y });
}

// Proyectil hacia el jugador desde (sx, sy), con un desvío de a radianes
function aim(lv, sx, sy, speed, a) {
  if (lv.shots.length >= MAX_SHOTS) return;
  const p = player;
  const t = Math.atan2(p.y + 0.5 - sy, p.x + p.vx * 0.3 - sx) + a;
  lv.shots.push({ x: sx, y: sy, vx: Math.cos(t) * speed, vy: Math.sin(t) * speed, life: 4 });
}

// Patrulla entre minX y maxX; el enemigo mira hacia donde camina
function patrol(e, speed, dt) {
  e.x += e.dir * speed * dt;
  if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
  if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
  e.face = e.dir;
}

// Avispa: vuela de un lado a otro ondulando; de vez en cuando se lanza en picado al punto donde estaba el jugador
function wasp(e, lv, dt) {
  const p = player;
  if (e.mode === 'dive') {
    const dx = e.tx - e.x, dy = e.ty - e.y, L = Math.hypot(dx, dy) || 1;
    e.x += dx / L * 17 * dt; e.y += dy / L * 17 * dt;
    e.face = dx < 0 ? -1 : 1;
    e.diveT -= dt;
    if (L < 0.4 || e.diveT <= 0) e.mode = 'back';
    return;
  }
  if (e.mode === 'back') {                         // vuelve a su altura de vuelo
    const dy = e.base - e.y;
    e.y += Math.sign(dy) * Math.min(Math.abs(dy), 7 * dt);
    e.x += e.dir * 3 * dt;
    e.face = e.dir;
    if (Math.abs(dy) < 0.05) e.mode = 'patrol';
    return;
  }
  patrol(e, 3.2, dt);
  e.y = e.base + Math.sin(lv.t * 3 + e.phase) * 0.5;
  e.cd -= dt;
  if (e.cd <= 0 && Math.abs(p.x - e.x) < 9 && p.y < e.y + 1.5 && p.y > e.y - 6) {
    e.mode = 'dive'; e.tx = p.x; e.ty = p.y + 0.5; e.diveT = 1.3; e.cd = 3.2;
  }
}

// Saltamontes: camina despacio y de vez en cuando da un salto por la pista
function hop(e, lv, dt) {
  if (e.air) {
    e.yv -= GRAVITY * dt;
    e.y += e.yv * dt;
    e.x = clamp(e.x + e.hv * dt, e.minX, e.maxX);
    const g = laneY(lv.solids, e.x);
    if (e.yv < 0 && e.y <= g) { e.y = g; e.air = false; e.yv = 0; e.hv = 0; e.cd = 1.6; }
    return;
  }
  patrol(e, 1.0, dt);
  e.cd -= dt;
  if (e.cd <= 0) { e.air = true; e.yv = 12; e.hv = e.dir * 3.2; }
}

// Pez saltarín: se esconde bajo el agua y de vez en cuando salta hasta fuera
function fish(e, dt) {
  if (e.leap) {
    e.yv -= GRAVITY * dt;
    e.y += e.yv * dt;
    if (e.y <= e.base) { e.y = e.base; e.leap = false; e.cd = e.gap; }
  } else {
    e.cd -= dt;
    if (e.cd <= 0) { e.leap = true; e.yv = 11; }   // salta sobre el agua sin llegar a la altura de la pista
  }
}

// Mosca doméstica: vuela en círculos pequeños y rápidos sobre un punto que patrulla por el tramo
function housefly(e, lv, dt) {
  e.ax += e.dir * e.speed * dt;
  if (e.ax < e.minX) { e.ax = e.minX; e.dir = 1; }
  if (e.ax > e.maxX) { e.ax = e.maxX; e.dir = -1; }
  const a = lv.t * 7 + e.phase;
  e.x = e.ax + Math.cos(a) * 0.7;
  e.y = e.base + Math.sin(2 * a) * 0.25;
  e.face = e.dir;
}

// Gusano: asoma del suelo, se queda un rato y se vuelve a hundir. Solo toca cuando está fuera (up ≥ 0.5)
function worm(e, dt) {
  if (e.st === 'hide') { if ((e.t -= dt) <= 0) e.st = 'rise'; }
  else if (e.st === 'rise') { e.up = Math.min(1, e.up + dt * 2.2); if (e.up >= 1) { e.st = 'out'; e.t = 1.5; } }
  else if (e.st === 'out') { if ((e.t -= dt) <= 0) e.st = 'sink'; }
  else { e.up = Math.max(0, e.up - dt * 2.2); if (e.up <= 0) { e.st = 'hide'; e.t = 1.2 + e.phase * 0.5; } }
  e.y = e.base + (e.up - 1) * 0.6;                  // el cuerpo, plano, asoma del suelo al subir
}

// Torreta y jefe: disparan al jugador cuando está a su alcance
function fire(e, lv, dt) {
  const p = player;
  e.cd -= dt;
  e.face = p.x > e.x ? 1 : -1;                     // se gira hacia el jugador (no cambia la patrulla)
  const range = e.type === 'boss' ? 30 : 13;
  if (e.cd > 0 || Math.abs(p.x - e.x) > range || Math.abs(p.y - e.y) > 9) return;
  if (e.type === 'shoot') {
    aim(lv, e.x + e.face * 0.9, e.y + 1.0, 8, 0);
    e.cd = 2.8;
  } else {
    for (const a of [-0.22, 0, 0.22]) aim(lv, e.x + e.face * 1.8, e.y + 1.9, 9, a);
    e.cd = 2.6;
  }
}

// Movimiento de cada tipo de enemigo
function moveEnemy(e, lv, dt) {
  e.inv = Math.max(0, (e.inv || 0) - dt);
  switch (e.type) {
    case 'fly': e.y = e.base + Math.sin(lv.t * 2.2 + e.phase) * 0.7; patrol(e, e.speed, dt); break;
    case 'wasp': wasp(e, lv, dt); break;
    case 'hop': hop(e, lv, dt); break;
    case 'fish': fish(e, dt); break;
    case 'housefly': housefly(e, lv, dt); break;
    case 'worm': worm(e, dt); break;
    case 'shoot': patrol(e, 0, dt); fire(e, lv, dt); break;
    case 'boss': patrol(e, e.speed, dt); fire(e, lv, dt); break;
    default: patrol(e, e.speed ?? 2.2, dt);        // caminantes y erizos
  }
}

function resolveX(p, solids, prevX) {
  const top = p.y + PH / 2, bottom = p.y - PH / 2;
  const left = p.x - PW / 2, right = p.x + PW / 2;
  for (const s of solids) {
    // Una cara o solo techo no bloquean de lado; pinchos y agua no son sólidos (hacen daño o matan en stepWorld)
    if (s.kind === 'platform' || s.kind === 'ceiling' || s.kind === 'spikes' || s.kind === 'water') continue;
    if (top <= s.y0 + EPS || bottom >= s.y1 - STEP_UP) continue;
    if (right <= s.x0 || left >= s.x1) continue;
    if (s.kind === 'slope') {
      // Una pared muy empinada detiene al jugador; un escalón de hasta WALL_LIFT se sube
      if (bottom < slopeMax(s, p) - WALL_LIFT) { p.x = prevX; p.vx = 0; p.dashT = 0; p.charge = 0; }
      continue;
    }
    if (s.kind === 'spring') continue;          // un muelle no bloquea: se pisa y lanza (resolveY)
    const pushLeft = right - s.x0, pushRight = s.x1 - left;
    p.x = pushLeft < pushRight ? s.x0 - PW / 2 : s.x1 + PW / 2;
    p.vx = 0; p.dashT = 0; p.charge = 0;
  }
}

function resolveY(p, solids, prevBottom) {
  p.grounded = false; p.groundSolid = null;
  const left = p.x - PW / 2, right = p.x + PW / 2;
  for (const s of solids) {
    if (right <= s.x0 || left >= s.x1) continue;
    if (s.kind === 'spikes' || s.kind === 'water') continue;
    if (s.kind === 'spring') {
      // Un muelle se activa al pisarlo (de frente o al caer encima) y lanza sin frenar la velocidad horizontal
      const bottom = p.y - PH / 2;
      if (p.vy <= 0.5 && bottom < s.y1 + 0.02 && bottom > s.y0 - 0.25) {
        p.y = s.y1 + PH / 2; p.vy = s.power; p.grounded = false; p.groundSolid = null; p.jumping = false;
        p.vx = clamp(p.vx, -SPRING_VX, SPRING_VX);
        p.spinAir = true;                       // el vuelo es un salto: el giro en el aire también destruye
        s.squash = 0.15;
      }
      continue;
    }
    if (s.kind === 'ceiling') {
      // Bajo un saliente: el salto se corta al chocar con la roca
      if (p.vy > 0 && prevBottom + PH <= s.y0 + 0.02 && p.y + PH / 2 > s.y0) { p.y = s.y0 - PH / 2; p.vy = 0; }
      continue;
    }
    const bottom = p.y - PH / 2;
    const slope = s.kind === 'slope';
    const surf = slope ? slopeMax(s, p) : s.y1;
    const tol = slope ? 0.3 : 0.02;   // en rampas se "pega" al bajar
    const reach = slope ? 0.3 : 0;
    // Aterriza sólo si los pies estaban por encima de la superficie en el paso anterior;
    // en rampas también sube al jugador si ha entrado de lado por debajo de la superficie
    const inside = p.vy <= 0 && bottom < surf && bottom > surf - (slope ? 1.2 : STEP_UP);
    if ((p.vy <= 0 && prevBottom >= surf - tol && bottom < surf + reach) || inside) {
      p.y = surf + PH / 2;
      p.vy = 0; p.grounded = true; p.groundSolid = s;
    }
  }
}

// Movimiento dentro de un tubo: la gravedad actúa a lo largo de la trayectoria (el tubo sujeta por ambos lados)
function pathStep(dt) {
  const p = player, pt = p.path;
  const q = pathAt(pt, p.s);
  p.pv += -GRAVITY * q.T[1] * dt;
  p.s += p.pv * dt;
  if (p.s >= pt.L || p.s <= 0) {                        // sale por un extremo: vuelve a la pista
    const end = p.s >= pt.L ? pt.pts[pt.pts.length - 1] : pt.pts[0];
    p.path = null;
    p.x = end[0]; p.y = end[1] + 0.5;
    p.vx = p.pv; p.vy = 0;
    p.grounded = false; p.groundSolid = null;
    return;
  }
  const r = pathAt(pt, p.s);
  p.x = r.P[0] + r.N[0] * 0.5; p.y = r.P[1] + r.N[1] * 0.5;
  p.vx = p.pv * r.T[0]; p.vy = p.pv * r.T[1];
}

function stepPlayer(dt) {
  const p = player, lv = G.lv;
  if (p.path) { pathStep(dt); return; }
  const ax = readAxisX();
  const down = readDown();
  p.invT = Math.max(0, p.invT - dt);
  p.dashT = Math.max(0, p.dashT - dt);

  // Salto (altura variable: soltar pronto corta el salto)
  if (input.jumpPressed) {
    input.jumpPressed = false;
    if (p.grounded) { p.vy = JUMP_V; p.grounded = false; p.groundSolid = null; p.jumping = true; p.spinAir = true; p.crouch = false; }
  }
  if (p.jumping && p.vy > 0 && !isJumpHeld()) { p.vy *= 0.5; p.jumping = false; }

  // SPIN en el aire = picado
  if (input.spinPressed) {
    input.spinPressed = false;
    if (!p.grounded) p.vy = Math.min(p.vy, -20);
  }

  // Spin dash: cargar parado y soltar
  if (p.grounded) {
    if (down && Math.abs(p.vx) < 1.5) { p.crouch = true; p.charge = Math.min(1, p.charge + dt); }
    else if (p.crouch && !down) {
      p.crouch = false;
      if (p.charge > 0.05) { p.vx = p.facing * (DASH_MIN + DASH_RANGE * p.charge); p.dashT = 0.5; }
      p.charge = 0;
    }
  } else { p.crouch = false; p.charge = 0; }

  if (!p.crouch && Math.abs(ax) > 0.1) p.facing = ax > 0 ? 1 : -1;
  p.rolling = p.grounded && (p.dashT > 0 || (down && Math.abs(p.vx) > 4));
  if (p.rolling) p.roll += p.vx * dt / 0.5;

  // Velocidad horizontal con momentum: sobre la velocidad de carrera (bajadas) se pierde despacio
  if (p.grounded) {
    if (p.crouch) p.vx = approach(p.vx, 0, 30 * dt);
    else if (Math.abs(ax) > 0.1) {
      const reversing = Math.sign(ax) !== Math.sign(p.vx) && Math.abs(p.vx) > 1;
      if (!reversing && Math.abs(p.vx) > TOP_SPEED) p.vx = approach(p.vx, Math.sign(p.vx) * TOP_SPEED, OVER_DRAG * dt);
      else p.vx = approach(p.vx, ax * TOP_SPEED, (reversing ? ACCEL * 2.5 : ACCEL) * dt);
    } else {
      p.vx = approach(p.vx, 0, (p.rolling ? ROLL_FRICTION : FRICTION) * dt);
    }
    // Pendientes: la gravedad acelera al bajar y frena (menos) al subir
    const s = p.groundSolid;
    if (!p.crouch && s && s.kind === 'slope') {
      const g = (s.yb - s.ya) / (s.x1 - s.x0);
      p.vx -= GRAVITY * g * (g > 0 ? UPHILL : DOWNHILL) / (1 + g * g) * dt;
    }
  } else if (Math.abs(ax) > 0.1 && (Math.abs(p.vx) <= TOP_SPEED || Math.sign(p.vx) !== Math.sign(ax))) {
    p.vx = approach(p.vx, ax * TOP_SPEED, 9 * dt);
  }
  p.vx = clamp(p.vx, -MAX_RUN, MAX_RUN);

  // Gravedad (en suelo mantiene vy ligeramente negativa para detectar apoyo)
  if (p.grounded) p.vy = -GRAVITY * dt;
  else p.vy = Math.max(p.vy - GRAVITY * dt, -MAX_FALL);

  const prevX = p.x;
  p.x += p.vx * dt;
  resolveX(p, lv.solids, prevX);
  const prevBottom = p.y - PH / 2;
  p.y += p.vy * dt;
  resolveY(p, lv.solids, prevBottom);
  if (p.grounded) p.spinAir = false;

  // Franja de aceleración: empuja hacia delante mientras estés encima
  if (p.grounded && p.groundSolid && p.groundSolid.boost && (p.vx > 0 || ax > 0.1)) {
    p.vx = Math.max(p.vx, BOOST_V);
  }
  // Agua poco profunda (vados, arroyos y estanques): se chapotea más despacio y salpica al entrar y al correr
  const wade = !!(p.grounded && p.groundSolid && p.groundSolid.wade);
  if (wade) {
    p.vx = clamp(p.vx, -WADE_MAX, WADE_MAX);
    p.splashT -= dt;
    if (!p.wet) G.fx.push({ x: p.x, y: p.groundSolid.wl, n: 12, pal: 1 });
    else if (p.splashT <= 0 && Math.abs(p.vx) > 5) { G.fx.push({ x: p.x, y: p.groundSolid.wl, n: 3, pal: 1 }); p.splashT = SPLASH_T; }
  }
  p.wet = wade;
  // Entrada a un tubo al cruzar su base hacia la derecha: sobre la pista, o bajo en la boca de una subida de galería
  // (el techo de la galería corta los saltos, así que un salto sobre la boca no deja al jugador en el vacío)
  if (p.vx > 0) {
    for (const pt of lv.paths) {
      const onBase = p.grounded || (pt.kind === 'rise' && p.y - PH / 2 < pt.y0 + 1.5);
      if (onBase && prevX < pt.x0 && p.x >= pt.x0) {
        p.path = pt; p.s = 0; p.pv = p.vx;
        p.x = pt.x0; p.y = pt.y0 + 0.5;
        p.grounded = false; p.groundSolid = null; p.spinAir = true; p.jumping = false;
        break;
      }
    }
  }
}

export function hurt() {
  const p = player, lv = G.lv;
  if (p.invT > 0) return;
  if (p.rings > 0) {                                    // con anillos: los suelta y sigue
    const n = Math.min(p.rings, 20);
    for (let i = 0; i < n && lv.scatter.length < MAX_SCATTER; i++) {
      const dir = i % 2 ? 1 : -1;
      lv.scatter.push({ x: p.x, y: p.y, vx: dir * (1 + Math.random() * 4), vy: 5 + Math.random() * 5, life: 4 });
    }
    p.rings = 0;
    p.vx = -p.facing * 6; p.vy = 8; p.grounded = false; p.groundSolid = null;
    p.invT = 2; p.rolling = false; p.dashT = 0; p.crouch = false; p.charge = 0; p.path = null;
  } else {
    die();
  }
}

export function die() {
  G.lives--;
  if (G.lives <= 0) { G.onGameOver(); return; }
  const p = player, cp = G.checkpoint;
  p.x = cp.x; p.y = cp.y + 1;
  p.vx = 0; p.vy = 0; p.rings = 0; p.invT = 1.5;
  p.grounded = false; p.groundSolid = null; p.rolling = false; p.dashT = 0; p.crouch = false; p.charge = 0; p.spinAir = false; p.path = null;
  p.wet = false;
}

// Un paso fijo: móviles, jugador, enemigos, anillos, puntos de control, caída y meta
export function stepWorld(dt) {
  const lv = G.lv, p = player;
  lv.t += dt;

  // Plataformas móviles (y el jugador que va encima)
  for (const s of lv.solids) {
    if (!s.mover) continue;
    s.prevCx = s.cx;
    s.cx = s.base + Math.sin(lv.t * s.speed + s.ph) * s.amp;
    s.x0 = s.cx - s.w / 2; s.x1 = s.cx + s.w / 2;
    if (p.groundSolid === s) p.x += s.cx - s.prevCx;
  }

  stepPlayer(dt);

  // Pinchos: tocarlos hace daño (como un enemigo). Agua: caer dentro de un hueco mata
  for (const s of lv.solids) {
    if (s.kind === 'spikes') {
      if (p.x + PW / 2 > s.x0 && p.x - PW / 2 < s.x1 && p.y - PH / 2 < s.y1 - 0.02 && p.y + PH / 2 > s.y0 + 0.02) {
        hurt();
        if (G.mode !== 'play') return;
        break;
      }
    } else if (s.kind === 'water' && p.x > s.x0 && p.x < s.x1 && p.y - PH / 2 < s.level) {
      die();
      if (G.mode !== 'play') return;
      break;
    }
  }

  // Enemigos: destruidos al rodar, al girar en el aire o al pisarlos; te hieren si los tocas de otro modo
  for (const e of lv.enemies) {
    if (!e.alive) continue;
    moveEnemy(e, lv, dt);
    if (e.type === 'fish' && !e.leap) continue;          // el pez escondido bajo el agua no toca
    if (e.type === 'worm' && e.up < 0.5) continue;       // el gusano escondido bajo el suelo no toca
    const r = e.r || ENEMY_R, ey = e.y + r;
    const dx = e.x - p.x, dy = ey - p.y;
    if (dx * dx + dy * dy >= (r + 0.4) ** 2) continue;
    const stomp = p.vy < 0 && p.y - PH / 2 > ey;          // cae sobre él
    const roll = p.rolling || p.dashT > 0;                // rueda o carga
    const spin = p.spinAir && !p.grounded;                // gira en el aire (un salto o un muelle)
    if (e.spiky) {                                        // erizo: solo lo destruye rodar o cargar
      if (roll && !(e.inv > 0)) hitEnemy(e, ey);
      else { hurt(); if (G.mode !== 'play') return; }
      continue;
    }
    const hit = stomp || roll || spin;
    // Un jefe recién golpeado solo rebota al jugador al pisarlo; cualquier otro contacto hace daño
    if (hit && (!(e.inv > 0) || stomp)) {
      if (!(e.inv > 0)) hitEnemy(e, ey);
      if (stomp) { p.vy = 10; p.grounded = false; p.groundSolid = null; }
      else if (!p.grounded) p.vy = Math.max(p.vy, 7);    // el giro en el aire rebota un poco
    } else {
      hurt();
      if (G.mode !== 'play') return;
    }
  }
  // Disparos: vuelan en línea recta y hieren al jugador al tocarlos
  for (let i = lv.shots.length - 1; i >= 0; i--) {
    const s = lv.shots[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.life <= 0) { lv.shots.splice(i, 1); continue; }
    if (Math.abs(s.x - p.x) < 0.5 && Math.abs(s.y - p.y) < 0.75) {
      lv.shots.splice(i, 1);
      hurt();
      if (G.mode !== 'play') return;
    }
  }

  // Anillos
  for (const r of lv.rings) {
    if (r.taken) continue;
    const dx = r.x - p.x, dy = r.y - p.y;
    if (dx * dx + dy * dy < RING_R * RING_R) { r.taken = true; p.rings++; }
  }
  // Anillos dispersos (tras recibir daño): caen y se pueden recoger tras un instante
  for (let i = lv.scatter.length - 1; i >= 0; i--) {
    const r = lv.scatter[i];
    r.life -= dt; r.vy -= GRAVITY * 0.5 * dt;
    r.x += r.vx * dt; r.y += r.vy * dt;
    if (r.life <= 0 || r.y < lv.killY) { lv.scatter.splice(i, 1); continue; }
    if (r.life < 3.4) {
      const dx = r.x - p.x, dy = r.y - p.y;
      if (dx * dx + dy * dy < RING_R * RING_R) { lv.scatter.splice(i, 1); p.rings++; }
    }
  }

  // Puntos de control
  for (const c of lv.checkpoints) {
    if (!c.hit && p.x > c.x) {
      c.hit = true;
      G.checkpoint = { x: c.x, y: c.y + 1.2 };
    }
  }

  // Caída al vacío
  if (p.y < lv.killY) { die(); if (G.mode !== 'play') return; }

  // Meta
  if (p.x >= lv.goalX) G.onComplete();
}
