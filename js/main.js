// Punto de entrada: render, cielo y luces, flujo de juego (título, juego, acto completado, fin) y bucle principal
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadFileTextures } from './textures.js';
import { loadModels } from './models.js';
import { buildLevel, ZONE_NAMES } from './level.js';
import { buildWorld, updateWorld, disposeWorld } from './world.js';
import { buildPlayer, buildTrail, updatePlayer, updateTrail } from './player.js';
import { player, G, STEP, LEVELS, stepWorld, hurt } from './physics.js';
import { createFx, spawnBurst, updateFx } from './fx.js';
import { initInput, input } from './input.js';
import { lookFor } from './backdrop.js';
import { clamp, fmtTime } from './util.js';
import { initAudio, isMuted, playSfx, setMuted, startMusic, stopMusic } from './audio.js';

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);

/* ---------- Renderer, escena, luces, cielo y cámara ---------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;     // los tubos se cortan con un plano (ver geo.js)

const scene = new THREE.Scene();
const fx = createFx(scene);             // chispas de los enemigos destruidos (compartidas por todas las fases)
const dust = createFx(scene, { max: 90, dust: true });   // polvo de aterrizajes, derrapes y spin dash
scene.fog = new THREE.Fog(0xc4e8ff, 70, 260);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);

// Entorno de reflejos (IBL): brillos realistas en metal y plástico
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xdfeeff, 0x5a4a3a, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 14, bottom: -12, near: 1, far: 90 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);

// Cielo con degradado en shader (sigue a la cámara)
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y * 0.8 + 0.25, 0.0, 1.0);
      float glow = pow(max(0.0, dot(normalize(vDir), normalize(vec3(0.5, 0.35, -0.8)))), 6.0) * 0.25;
      vec3 c = mix(uBottom, uTop, pow(h, 0.9)) + glow;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);

let camDist = 16;
const cam = { x: 0, y: 2 };
function fitCamera() {
  // Garantiza ~22 unidades de ancho visible, también en pantallas estrechas
  const aspect = window.innerWidth / window.innerHeight;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camDist = Math.max(7.5 / tanH, 11 / (tanH * aspect), 12);
}
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  fitCamera();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// Colores de cielo, niebla y luz de cada zona y acto
function applyLook(look) {
  skyMat.uniforms.uTop.value.setHex(look.top);
  skyMat.uniforms.uBottom.value.setHex(look.bottom);
  scene.fog.color.setHex(look.fog);
  sun.color.setHex(look.sun);
  hemi.color.setHex(look.hemi);
}

/* ---------- Jugador y fases ---------- */
const PV = buildPlayer(scene);
const trail = buildTrail(scene);
let W = null;                 // mundo visual de la fase actual
let levelIndex = 0;

function resetPlayer() {
  Object.assign(player, {
    x: 0, y: 2, vx: 0, vy: 0, rings: 0, facing: 1, grounded: false, groundSolid: null,
    jumping: false, spinAir: false, path: null, s: 0, pv: 0, crouch: false, charge: 0,
    dashT: 0, rolling: false, roll: 0, invT: 0, shield: false, speedT: 0, starT: 0, arc: null, kArc: 1,
    chain: 0, skid: false, boosting: false, loopFwd: false,
  });
}

function loadLevel(n) {
  if (W) disposeWorld(W);
  levelIndex = n;
  const zi = Math.floor(n / 3), ai = n % 3;
  const lv = buildLevel(zi, ai);
  lv.scatter = [];
  G.lv = lv;
  G.fx.length = 0;
  G.secretsFound = 0;
  W = buildWorld(lv, zi, ai, scene);
  applyLook(lookFor(zi, ai));
  resetPlayer();
  G.checkpoint = { x: 0, y: 2 };
  G.levelTime = 0;
  cam.x = player.x; cam.y = player.y;
  input.jumpPressed = false; input.spinPressed = false;
  G.sfx.length = 0; G.popups.length = 0; G.dust.length = 0; G.shake = 0;
  $('zone').textContent = `${ZONE_NAMES[zi]} · Acto ${ai + 1}`;
  if (G.mode !== 'title') startMusic(zi);
}

// Cámara: mira por delante de la marcha, se aleja con la velocidad y en los bucles se centra en el lazo entero.
// En los tubos sigue más deprisa (el erizo cambia de altura de golpe). Las sacudidas vienen de G.shake
let zoom = 1, shake = 0;
function updateCamera(dt) {
  const p = player, loop = p.path && p.path.loop;
  const speed = Math.hypot(p.vx, p.vy);
  const wantZoom = 1 + clamp((speed - 16) / 22, 0, 1) * 0.22 + (loop ? 0.12 : p.path ? 0.06 : 0);
  zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 2));
  let tx = p.x + clamp(p.vx * 0.2, -6, 6), ty = p.y + 1.2 + clamp(p.vy * 0.06, -2.5, 1.5);
  if (loop) { tx = loop.cx + 2; ty = loop.cy - 0.6; }
  const rx = p.path ? 7 : 5, ry = p.path ? 7 : p.grounded ? 4 : 3;
  cam.x += (tx - cam.x) * (1 - Math.exp(-dt * rx));
  cam.y += (ty - cam.y) * (1 - Math.exp(-dt * ry));
  // Que el erizo no se salga de la vista aunque la cámara vaya con retraso
  cam.y = clamp(cam.y, p.y - 4.5, p.y + 3);
  shake = Math.max(shake * Math.exp(-dt * 7), Math.min(G.shake, 1)); G.shake = 0;
  const sx = (Math.random() - 0.5) * shake * 0.7, sy = (Math.random() - 0.5) * shake * 0.7;
  camera.position.set(cam.x + sx, cam.y + 2.4 + sy, camDist * zoom);      // un poco más alta: se ve la superficie de la pista
  camera.lookAt(cam.x + sx, cam.y + 0.2 + sy, 0);
  sky.position.copy(camera.position);
  // El sol y su zona de sombras siguen a la cámara
  sun.position.set(cam.x + 9, cam.y + 16, 22);
  sun.target.position.set(cam.x, cam.y, 0);
  sun.target.updateMatrixWorld();
}

function updateVisuals(t, dt) {
  if (!W) return;
  updatePlayer(PV, player, t, dt);
  updateTrail(trail, PV, player, dt);
  if (player.starT > 0 && Math.random() < dt * 14) G.fx.push({ x: player.x + (Math.random() - 0.5) * 1.6, y: player.y + Math.random() * 0.9, n: 3, pal: 0 });
  if (player.crouch && player.charge > 0.05 && Math.random() < dt * 20) G.dust.push({ x: player.x - player.facing * 0.5, y: player.y - 0.5, n: 1, dir: -player.facing });
  // Destellos sobre las losas agrietadas cercanas: una pista discreta de que ahí hay algo
  for (const s of G.lv.solids) {
    if (s.crack && !s.broken && Math.abs(s.x0 - player.x) < 30 && Math.random() < dt * 2.5) {
      G.fx.push({ x: s.x0 + Math.random() * (s.x1 - s.x0), y: s.y1 + 0.1, n: 1, pal: 2 });
    }
  }
  updateWorld(W, G.lv, t, dt, player.x);
  for (const f of G.fx) spawnBurst(fx, f.x, f.y, f.n, f.pal, f.z || 0);
  G.fx.length = 0;
  for (const d of G.dust) spawnBurst(dust, d.x, d.y, d.n, 3, 0, d.dir);
  G.dust.length = 0;
  updateFx(fx, dt);
  updateFx(dust, dt);
  for (const name of G.sfx) playSfx(name);
  G.sfx.length = 0;
  updateCamera(dt);
  updatePopups(dt);
  // Líneas de velocidad en los bordes de la pantalla: a toda velocidad y en los bucles
  const sp = player.path ? Math.abs(player.pv) : Math.abs(player.vx);
  const lines = G.mode === 'play' ? clamp((sp - 27) / 10, 0, 1) * 0.6 + (player.path && player.path.loop ? 0.25 : 0) : 0;
  speedEl.style.opacity = lines.toFixed(2);
  speedEl.style.visibility = lines > 0.01 ? 'visible' : 'hidden';
}

/* ---------- Textos flotantes (puntos de los enemigos, 1UP) ---------- */
const popLayer = $('popups'), popups = [], _v = new THREE.Vector3();
function updatePopups(dt) {
  for (const q of G.popups) {
    const el = document.createElement('div');
    el.className = 'popup' + (q.big ? ' big' : '');
    el.textContent = q.text;
    popLayer.appendChild(el);
    popups.push({ el, x: q.x, y: q.y, t: 0 });
  }
  G.popups.length = 0;
  for (let i = popups.length - 1; i >= 0; i--) {
    const q = popups[i];
    q.t += dt;
    if (q.t > 0.9) { q.el.remove(); popups.splice(i, 1); continue; }
    _v.set(q.x, q.y + q.t * 1.6, 0).project(camera);
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth, y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    q.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 + Math.min(q.t * 8, 1) * 0.25 - q.t * 0.2).toFixed(3)})`;
    q.el.style.opacity = String(Math.min(1, (0.9 - q.t) * 4));
  }
}
const speedEl = $('speedfx');

/* ---------- Flujo de juego ---------- */
G.onComplete = () => {
  G.mode = 'clear';
  stopMusic();
  for (const name of G.sfx) playSfx(name);
  G.sfx.length = 0;
  const bonus = Math.max(0, 300 - Math.floor(G.levelTime)) * 10;
  G.score += player.rings * 10 + bonus;
  const secrets = G.lv.secrets.length ? ` · Secretos: ${G.secretsFound}/${G.lv.secrets.length}` : '';
  $('clearText').textContent = `Anillos: ${player.rings} · Tiempo: ${fmtTime(G.levelTime)} · Bonus: ${bonus}${secrets}`;
  $('btnNext').textContent = levelIndex < LEVELS - 1 ? 'SIGUIENTE' : 'JUGAR DE NUEVO';
  show('clear', true);
};
G.onGameOver = () => {
  G.mode = 'over';
  stopMusic();
  $('overText').textContent = `Puntuación: ${G.score}`;
  show('over', true);
};

function startGame() {
  G.lives = 3; G.score = 0;
  G.mode = 'play';
  loadLevel(0);
  show('title', false); show('clear', false); show('over', false);
}

async function tryFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    await screen.orientation?.lock?.('landscape');
  } catch (e) { /* no soportado: se ignora */ }
}

$('btnPlay').addEventListener('click', () => { initAudio(); tryFullscreen(); startGame(); });
$('btnNext').addEventListener('click', () => {
  initAudio();
  show('clear', false);
  if (levelIndex < LEVELS - 1) { G.mode = 'play'; loadLevel(levelIndex + 1); }
  else startGame();
});
$('btnRetry').addEventListener('click', () => {
  initAudio();
  show('over', false);
  G.lives = 3; G.mode = 'play'; loadLevel(levelIndex);
});
// Sonido: botón del marcador y tecla M
const muteBtn = $('mute');
const paintMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
const toggleMute = () => { initAudio(); setMuted(!isMuted()); paintMute(); if (!isMuted() && G.mode === 'play') startMusic(Math.floor(levelIndex / 3)); };
muteBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggleMute(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) toggleMute(); });
paintMute();

/* ---------- Marcador y bucle principal ---------- */
const hud = { rings: $('rings'), lives: $('lives'), time: $('time'), score: $('score'), power: $('power'), secrets: $('secrets') };
// Aviso al encontrar una zona secreta (durante un rato sustituye al contador de secretos)
let secretToastUntil = 0;
G.onSecret = () => { secretToastUntil = performance.now() + 2500; };
let lastRings = 0;
function updateHud() {
  const r = String(player.rings), l = String(G.lives), t = fmtTime(G.levelTime), s = String(G.score + player.rings * 10);
  if (player.rings > lastRings) {                         // el contador de anillos da un saltito al sumar
    hud.rings.classList.remove('bump'); void hud.rings.offsetWidth; hud.rings.classList.add('bump');
  }
  lastRings = player.rings;
  if (hud.rings.textContent !== r) hud.rings.textContent = r;
  if (hud.lives.textContent !== l) hud.lives.textContent = l;
  if (hud.time.textContent !== t) hud.time.textContent = t;
  if (hud.score.textContent !== s) hud.score.textContent = s;
  const parts = [];
  if (player.shield) parts.push('ESCUDO');
  if (player.speedT > 0) parts.push(`ZAPATILLAS ${Math.ceil(player.speedT)}`);
  if (player.starT > 0) parts.push(`ESTRELLA ${Math.ceil(player.starT)}`);
  hud.power.textContent = parts.join(' · ');
  hud.power.classList.toggle('hidden', !parts.length);
  const total = G.lv ? G.lv.secrets.length : 0;
  const sText = performance.now() < secretToastUntil ? '¡ZONA SECRETA!' : `SECRETOS ${G.secretsFound}/${total}`;
  if (hud.secrets.textContent !== sText) hud.secrets.textContent = sText;
  hud.secrets.classList.toggle('hidden', !total);
}

let accumulator = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'play') {
    accumulator += dt;
    G.levelTime += dt;
    while (accumulator >= STEP && G.mode === 'play') {
      stepWorld(STEP);
      accumulator -= STEP;
    }
  }
  updateVisuals(now / 1000, dt);
  renderer.render(scene, camera);
  updateHud();
  requestAnimationFrame(frame);
}

// Ganchos para pruebas automatizadas (solo con ?debug)
if (new URLSearchParams(location.search).has('debug')) {
  window.__hs = {
    startGame, loadLevel, input, STEP,
    setMode: (m) => { G.mode = m; },
    snap: () => { cam.x = player.x; cam.y = player.y; },
    setLives: (n) => { G.lives = n; },
    spark: (x, y) => G.fx.push({ x, y }),
    stepWorld, hurt,
    get player() { return player; },
    get lv() { return G.lv; },
    get draws() { return renderer.info.render.calls; },
    THREE, scene, camera,
    get state() { return { mode: G.mode, lives: G.lives, score: G.score, levelTime: G.levelTime }; },
  };
}

// Texturas primero; luego el nivel 1 se ve de fondo en la pantalla de título
initInput();
const playBtn = $('btnPlay');
playBtn.disabled = true; playBtn.textContent = 'CARGANDO…';
Promise.all([loadFileTextures(), loadModels()]).then(() => {
  loadLevel(0);
  playBtn.disabled = false; playBtn.textContent = 'JUGAR';
  requestAnimationFrame((t) => { last = t; frame(t); });
});
