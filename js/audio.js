// Sonido: efectos sintetizados con WebAudio y una música sencilla por zona (sin archivos de audio).
// El contexto se crea con el primer toque (los navegadores no dejan sonar antes) y se puede silenciar
const MUTE_KEY = 'haikusonic-muted';
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* sin almacenamiento: se oye */ }
let ringPan = 1;                         // los anillos suenan alternando izquierda y derecha
let chargeN = 0, chargeT = 0;            // pulsaciones seguidas del spin dash (cada una más aguda)
const lastPlay = {};                     // último instante de cada efecto: no se amontonan en el mismo fotograma

export const isMuted = () => muted;

// Crea (o reanuda) el contexto de audio; se llama desde un gesto del jugador
export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

/* ---------- Piezas: un tono con envolvente y barrido de frecuencia, y un ruido filtrado ---------- */
function tone(type, f0, f1, t0, dur, vol, { pan = 0, bus = sfxBus, attack = 0.005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let out = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  o.connect(g); out.connect(bus);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, vol, { type = 'bandpass', f0 = 1200, f1 = f0, q = 1, bus = sfxBus } = {}) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // número MIDI → Hz
function arp(notes, t0, step, type = 'square', vol = 0.12, len = step * 1.6) {
  notes.forEach((n, i) => tone(type, NOTE(n), NOTE(n), t0 + i * step, len, vol));
}

// Efectos por nombre (los manda la física a través de G.sfx)
const SFX = {
  ring(t) { ringPan = -ringPan; tone('square', 1568, 1568, t, 0.06, 0.09, { pan: ringPan * 0.6 }); tone('triangle', 2637, 2637, t + 0.05, 0.28, 0.12, { pan: ringPan * 0.6 }); },
  jump(t) { tone('square', 260, 760, t, 0.16, 0.1); },
  spring(t) { tone('triangle', 180, 1100, t, 0.32, 0.22); tone('square', 360, 2200, t, 0.12, 0.05); },
  pop(t) { noise(t, 0.22, 0.35, { f0: 3000, f1: 300, q: 0.8 }); tone('square', 880, 110, t, 0.2, 0.08); },
  boom(t) { noise(t, 0.6, 0.6, { type: 'lowpass', f0: 2400, f1: 80, q: 0.5 }); tone('sine', 120, 35, t, 0.5, 0.4); },
  bump(t) { tone('sine', 300, 520, t, 0.1, 0.18); },
  hurt(t) { tone('sawtooth', 700, 140, t, 0.45, 0.14); noise(t, 0.3, 0.15, { f0: 900, f1: 200 }); },
  shieldLost(t) { tone('triangle', 1200, 300, t, 0.35, 0.16); },
  die(t) { [72, 67, 64, 60, 55].forEach((n, i) => tone('square', NOTE(n), NOTE(n - 1), t + i * 0.11, 0.16, 0.1)); },
  charge(t) {
    chargeN = t - chargeT < 0.7 ? Math.min(chargeN + 1, 6) : 0; chargeT = t;
    const f = 300 * Math.pow(1.12, chargeN);
    tone('sawtooth', f, f * 2.6, t, 0.22, 0.07); noise(t, 0.2, 0.12, { f0: 1500 + chargeN * 400, f1: 5000, q: 2 });
  },
  dash(t) { noise(t, 0.4, 0.3, { f0: 600, f1: 6000, q: 1.5 }); tone('square', 200, 900, t, 0.25, 0.06); chargeN = 0; },
  dive(t) { tone('triangle', 900, 200, t, 0.18, 0.12); },
  skid(t) { noise(t, 0.25, 0.18, { type: 'highpass', f0: 2500, q: 0.7 }); },
  land(t) { noise(t, 0.12, 0.18, { type: 'lowpass', f0: 600, f1: 150 }); },
  boost(t) { noise(t, 0.35, 0.22, { f0: 800, f1: 4000, q: 2 }); tone('triangle', 500, 1500, t, 0.25, 0.08); },
  tube(t) { noise(t, 0.7, 0.25, { f0: 300, f1: 2400, q: 3 }); },
  loop(t) { noise(t, 0.9, 0.22, { f0: 400, f1: 3200, q: 4 }); tone('triangle', 330, 990, t, 0.6, 0.05); },
  crack(t) { noise(t, 0.4, 0.5, { type: 'lowpass', f0: 1800, f1: 120, q: 0.7 }); tone('square', 160, 60, t, 0.25, 0.12); },
  item(t) { arp([72, 76, 79, 84], t, 0.06, 'triangle', 0.16); },
  life(t) { arp([67, 71, 74, 79, 74, 79, 83], t, 0.09, 'square', 0.1, 0.12); },
  checkpoint(t) { tone('triangle', NOTE(84), NOTE(84), t, 0.18, 0.15); tone('triangle', NOTE(79), NOTE(79), t + 0.12, 0.35, 0.15); },
  secret(t) { arp([72, 79, 84, 88, 91, 96], t, 0.07, 'triangle', 0.14, 0.2); },
  goal(t) { arp([72, 76, 79, 84, 79, 84, 88], t, 0.1, 'square', 0.1, 0.16); },
};

export function playSfx(name) {
  if (!ctx || muted || !SFX[name]) return;
  const t = ctx.currentTime;
  if (lastPlay[name] !== undefined && t - lastPlay[name] < (name === 'ring' ? 0.05 : 0.03)) return;
  lastPlay[name] = t;
  SFX[name](t + 0.005);
}

/* ---------- Música: bajo, arpegio y percusión con un secuenciador de semicorcheas ---------- */
// Por zona: tempo, tónica (MIDI), acordes (grados en semitonos sobre la tónica, con su calidad) y timbre de la melodía
const SONGS = [
  { bpm: 148, root: 60, lead: 'square', chords: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']] },        // verde: Do La- Fa Sol
  { bpm: 136, root: 62, lead: 'sawtooth', chords: [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']] },     // industrial: Re- Sib Lab La
  { bpm: 116, root: 65, lead: 'triangle', chords: [[0, 'M'], [9, 'm'], [2, 'm'], [7, 'M']] },      // acuática: Fa Re- Sol- Do
];
const RHYTHM = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0];
let song = null, step = 0, nextT = 0, timer = null, melody = [];

function buildMelody(zi) {
  // Melodía fija por zona: notas del acorde elegidas con un generador con semilla (siempre la misma canción)
  let seed = 1234 + zi * 77;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (let bar = 0; bar < 8; bar++) {
    const [deg, q] = SONGS[zi].chords[bar % 4];
    const tones = [0, q === 'm' ? 3 : 4, 7, 12, q === 'm' ? 15 : 16];
    let last = 2;
    for (let s = 0; s < 16; s++) {
      if (!RHYTHM[s] || (bar % 4 === 3 && s > 11)) { out.push(null); continue; }
      last = Math.max(0, Math.min(tones.length - 1, last + Math.round((rnd() - 0.5) * 3)));
      out.push(deg + tones[last]);
    }
  }
  return out;
}

function schedule() {
  const S = SONGS[song], sp = 60 / S.bpm / 4;
  while (nextT < ctx.currentTime + 0.12) {
    const bar = Math.floor(step / 16) % 8, s = step % 16, [deg, q] = S.chords[bar % 4];
    const t = nextT;
    if (s % 2 === 0) {                                     // bajo en corcheas: tónica y quinta
      const n = S.root - 24 + deg + (s % 8 === 4 ? 7 : 0);
      tone('triangle', NOTE(n), NOTE(n), t, sp * 1.8, 0.5, { bus: musicBus });
    }
    if (s % 4 === 0) tone('sine', 150, 45, t, 0.14, 0.7, { bus: musicBus });          // bombo en negras
    if (s % 4 === 2) noise(t, 0.05, 0.18, { type: 'highpass', f0: 7000, bus: musicBus });   // charles a contratiempo
    if (s === 4 || s === 12) noise(t, 0.12, 0.25, { f0: 1800, q: 0.6, bus: musicBus });     // caja
    const m = melody[(bar * 16 + s) % melody.length];
    if (m !== null) tone(S.lead, NOTE(S.root + 12 + m), NOTE(S.root + 12 + m), t, sp * 1.7, S.lead === 'sawtooth' ? 0.1 : 0.16, { bus: musicBus });
    if (s % 2 === 1) {                                     // arpegio suave del acorde, una octava abajo
      const ch = [0, q === 'm' ? 3 : 4, 7];
      const n = S.root + deg + ch[(s >> 1) % 3];
      tone('square', NOTE(n), NOTE(n), t, sp * 0.9, 0.04, { bus: musicBus });
    }
    nextT += sp; step++;
  }
}

export function startMusic(zi) {
  if (!ctx) return;
  if (song === zi && timer) return;
  stopMusic();
  song = zi; step = 0; melody = buildMelody(zi);
  nextT = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setValueAtTime(0.22, ctx.currentTime);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
}
