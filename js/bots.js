// Robots nuevos: movimiento y estados de cada tipo, campo de escudo del dron de apoyo, explosiones y reglas de contacto
// (qué pasa cuando el jugador toca un enemigo). Solo lógica: el dibujo está en robots.js
import { clamp } from './util.js';

export const BOT_TYPES = ['shield', 'bomb', 'spider', 'charger', 'laser', 'support'];
export const FLYER_TYPES = ['fly', 'housefly', 'wasp', 'support'];
export const FIELD_R = 4.5;     // radio del campo de escudo de un dron de apoyo
export const BLAST_R = 2.6;     // radio de la explosión de una bomba
export const BEAM_LEN = 9;      // largo máximo del rayo de un láser

// Enemigo nuevo: x e y son la posición de partida (y, para la araña, la altura en la que cuelga; para el dron de
// apoyo, la altura de vuelo). opt trae los límites de patrulla y, para la araña, el techo y el suelo bajo ella
export function makeBot(type, x, y, rng, opt = {}) {
  const dir = rng() < 0.5 ? -1 : 1, phase = rng() * 6;
  const base = { type, x, y, minX: opt.minX ?? x - 4, maxX: opt.maxX ?? x + 4, dir, face: dir, phase, alive: true, inv: 0, r: 0.5, shielded: false };
  switch (type) {
    case 'shield': return { ...base, r: 0.5 };
    case 'charger': return { ...base, r: 0.55, st: 'walk', t: 0 };
    case 'bomb': return { ...base, r: 0.45, st: 'idle', fuse: 0 };
    case 'spider': return { ...base, r: 0.45, st: 'hang', hangY: y, ceilY: opt.ceilY, floorY: opt.floorY ?? y, vy: 0, flee: 0, t: 0 };
    case 'laser': return { ...base, r: 0.6, mid: -0.3, amp: 0.85, ang: -0.3 };
    case 'support': return { ...base, r: 0.6, base: y, y };
    default: throw new Error(`robot desconocido: ${type}`);
  }
}

// Patrulla entre minX y maxX (igual que la de los caminantes)
function patrol(e, speed, dt) {
  e.x += e.dir * speed * dt;
  if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
  if (e.x > e.maxX) { e.x = e.maxX; e.dir = -1; }
  e.face = e.dir;
}

// Una bomba explota: deja su explosión para que la física la resuelva en el paso siguiente
function explode(e, lv) {
  lv.blasts.push({ x: e.x, y: e.y + 0.4, r: BLAST_R });
  e.alive = false;
}

// Campo de escudo: cada dron de apoyo protege a los enemigos cercanos (no a sí mismo, ni a otros apoyos, ni al jefe)
export function updateShields(lv) {
  for (const e of lv.enemies) e.shielded = false;
  for (const s of lv.enemies) {
    if (!s.alive || s.type !== 'support') continue;
    for (const e of lv.enemies) {
      if (e === s || !e.alive || e.type === 'boss' || e.type === 'support') continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) < FIELD_R) e.shielded = true;
    }
  }
}

// Movimiento y estados de los robots nuevos (un paso de dt). Las bombas dejan explosiones en lv.blasts y el toro
// que carga deja en lv.pendingKills a los enemigos que aplasta por el camino
export function stepBot(e, lv, dt, t, p) {
  switch (e.type) {
    case 'shield':
      patrol(e, e.speed ?? 1.5, dt);
      break;
    case 'bomb':
      if (e.st === 'idle') {
        // se arma si el jugador anda cerca a su altura; si cae encima (para pisarla) no, así se puede desarmar
        if (Math.abs(p.x - e.x) < 4.5 && Math.abs(p.y - e.y) < 1.2 && p.vy > -2) { e.st = 'fuse'; e.fuse = 1.3; }
      } else if (e.st === 'fuse') {
        if ((e.fuse -= dt) <= 0) explode(e, lv);
      }
      break;
    case 'spider':
      if (e.st === 'hang') {                             // cuelga del techo y se balancea
        e.y = e.hangY + Math.sin(t * 2 + e.phase) * 0.06;
        if (Math.abs(p.x - e.x) < 1.6 && p.y < e.hangY - 0.2) { e.st = 'drop'; e.vy = 0; }
      } else if (e.st === 'drop') {                      // cae sobre el jugador hasta el suelo que hay debajo
        e.vy -= 34 * dt;
        e.y += e.vy * dt;
        if (e.y <= e.floorY) { e.y = e.floorY; e.st = 'flee'; e.t = 2.2; e.flee = p.x > e.x ? -1 : 1; e.dir = e.flee; }
      } else if (e.st === 'flee') {                      // sale corriendo un rato y luego patrulla
        e.x = clamp(e.x + e.flee * 5.5 * dt, e.minX - 4, e.maxX + 4);
        e.face = e.flee;
        if ((e.t -= dt) <= 0) e.st = 'walk';
      } else {
        patrol(e, 2.2, dt);
      }
      break;
    case 'charger':
      if (e.st === 'walk') {
        patrol(e, 1.6, dt);
        const ahead = (p.x - e.x) * e.dir;
        if (ahead > 1.5 && ahead < 9 && Math.abs(p.y - e.y) < 1.8) { e.st = 'windup'; e.t = 0.6; }
      } else if (e.st === 'windup') {                    // baja la cabeza y se pone rojo antes de embestir
        e.face = e.dir;
        if ((e.t -= dt) <= 0) e.st = 'charge';
      } else if (e.st === 'charge') {
        e.x += e.dir * 17 * dt;
        e.face = e.dir;
        for (const o of lv.enemies) {
          if (o !== e && o.alive && o.type !== 'boss' && Math.abs(o.x - e.x) < 0.9 && Math.abs(o.y - e.y) < 1.2) lv.pendingKills.push(o);
        }
        if (e.x <= e.minX || e.x >= e.maxX) { e.x = clamp(e.x, e.minX, e.maxX); e.st = 'stun'; e.t = 2; }
      } else if ((e.t -= dt) <= 0) {                     // aturdido tras chocar: cualquier toque basta
        e.st = 'walk';
      }
      break;
    case 'laser':                                        // el rayo barre de un lado a otro
      e.ang = e.mid + e.amp * Math.sin(t * 0.9 + e.phase);
      break;
    case 'support':
      patrol(e, e.speed ?? 2.4, dt);
      e.y = e.base + Math.sin(t * 2.2 + e.phase) * 0.35;
      break;
    default:
      break;
  }
}

// Rayo del láser: origen, dirección y largo hasta el primer bloque de piedra (los bloques lo cortan)
export function beamOf(e, lv) {
  const ox = e.x, oy = e.y + 1.5;
  const dx = e.dir * Math.cos(e.ang), dy = Math.sin(e.ang);
  let len = BEAM_LEN;
  for (const s of lv.solids) {
    if (s.kind !== 'block') continue;
    for (let d = 0.3; d < len; d += 0.3) {
      const px = ox + dx * d, py = oy + dy * d;
      if (px >= s.x0 && px <= s.x1 && py >= s.y0 && py <= s.y1) { len = d; break; }
    }
  }
  return { ox, oy, dx, dy, len };
}

// Qué pasa cuando el jugador toca al enemigo e (f = { stomp, roll, spin, star }):
// 'kill' lo destruye; 'defuse' lo desarma sin explosión; 'blast' hace explotar una bomba armada; 'bounce' rebota al
// jugador sin daño; 'hurt' daña al jugador; 'ignore' no toca (la araña colgada)
export function verdict(e, p, f) {
  const hit = f.stomp || f.roll || f.spin;
  if (e.type === 'bomb' && e.st === 'fuse') return 'blast';
  if (e.shielded && !f.star) return 'bounce';                            // el campo del dron de apoyo lo repele (la estrella lo atraviesa)
  if (e.spiky) return f.roll ? 'kill' : 'hurt';                          // erizo: solo rodar o cargar
  if (e.type === 'spider' && e.st === 'hang') return 'ignore';
  if (e.type === 'charger' && e.st === 'stun') return 'kill';
  if (e.type === 'shield' && !f.stomp && !f.star && Math.sign(p.x - e.x) === e.dir) return 'bounce';   // su escudo mira al jugador
  if (e.type === 'bomb') return hit ? 'defuse' : 'hurt';
  if (e.type === 'wasp' && e.mode === 'dive') return hit ? 'kill' : 'hurt';   // solo pica en picado
  if (FLYER_TYPES.includes(e.type)) return hit ? 'kill' : 'bounce';           // los voladores no hieren por tocarlos
  return hit ? 'kill' : 'hurt';
}
