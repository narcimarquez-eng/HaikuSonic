// Punto de entrada: render, cielo y luces, flujo de juego (título, juego, acto completado, fin) y bucle principal
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadFileTextures } from './textures.js';
import { loadModels } from './models.js';
import { buildLevel, ZONE_NAMES } from './level.js';
import { buildWorld, updateWorld, disposeWorld } from './world.js';
import { buildPlayer, updatePlayer } from './player.js';
import { player, G, STEP, LEVELS, stepWorld, hurt } from './physics.js';
import { createFx, spawnBurst, updateFx } from './fx.js';
import { initInput, input } from './input.js';
import { lookFor } from './backdrop.js';
import { fmtTime } from './util.js';

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
let W = null;                 // mundo visual de la fase actual
let levelIndex = 0;

function resetPlayer() {
  Object.assign(player, {
    x: 0, y: 2, vx: 0, vy: 0, rings: 0, facing: 1, grounded: false, groundSolid: null,
    jumping: false, spinAir: false, path: null, s: 0, pv: 0, crouch: false, charge: 0,
    dashT: 0, rolling: false, roll: 0, invT: 0, shield: false, speedT: 0, starT: 0, arc: null, kArc: 1,
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
  $('zone').textContent = `${ZONE_NAMES[zi]} · Acto ${ai + 1}`;
}

function updateCamera(dt) {
  const tx = player.x + THREE.MathUtils.clamp(player.vx * 0.15, -4, 4);
  const ty = player.y + 1.2;
  cam.x += (tx - cam.x) * (1 - Math.exp(-dt * 5));
  cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 3));
  camera.position.set(cam.x, cam.y + 2.4, camDist);      // un poco más alta: se ve la superficie de la pista
  camera.lookAt(cam.x, cam.y + 0.2, 0);
  sky.position.copy(camera.position);
  // El sol y su zona de sombras siguen a la cámara
  sun.position.set(cam.x + 9, cam.y + 16, 22);
  sun.target.position.set(cam.x, cam.y, 0);
  sun.target.updateMatrixWorld();
}

function updateVisuals(t, dt) {
  if (!W) return;
  updatePlayer(PV, player, t, dt);
  if (player.starT > 0 && Math.random() < dt * 14) G.fx.push({ x: player.x + (Math.random() - 0.5) * 1.6, y: player.y + Math.random() * 0.9, n: 3, pal: 0 });
  updateWorld(W, G.lv, t, dt, player.x);
  for (const f of G.fx) spawnBurst(fx, f.x, f.y, f.n, f.pal);
  G.fx.length = 0;
  updateFx(fx, dt);
  updateCamera(dt);
}

/* ---------- Flujo de juego ---------- */
G.onComplete = () => {
  G.mode = 'clear';
  const bonus = Math.max(0, 300 - Math.floor(G.levelTime)) * 10;
  G.score += player.rings * 10 + bonus;
  const secrets = G.lv.secrets.length ? ` · Secretos: ${G.secretsFound}/${G.lv.secrets.length}` : '';
  $('clearText').textContent = `Anillos: ${player.rings} · Tiempo: ${fmtTime(G.levelTime)} · Bonus: ${bonus}${secrets}`;
  $('btnNext').textContent = levelIndex < LEVELS - 1 ? 'SIGUIENTE' : 'JUGAR DE NUEVO';
  show('clear', true);
};
G.onGameOver = () => {
  G.mode = 'over';
  $('overText').textContent = `Puntuación: ${G.score}`;
  show('over', true);
};

function startGame() {
  G.lives = 3; G.score = 0;
  loadLevel(0);
  G.mode = 'play';
  show('title', false); show('clear', false); show('over', false);
}

async function tryFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    await screen.orientation?.lock?.('landscape');
  } catch (e) { /* no soportado: se ignora */ }
}

$('btnPlay').addEventListener('click', () => { tryFullscreen(); startGame(); });
$('btnNext').addEventListener('click', () => {
  show('clear', false);
  if (levelIndex < LEVELS - 1) { loadLevel(levelIndex + 1); G.mode = 'play'; }
  else startGame();
});
$('btnRetry').addEventListener('click', () => {
  show('over', false);
  G.lives = 3; loadLevel(levelIndex); G.mode = 'play';
});

/* ---------- Marcador y bucle principal ---------- */
const hud = { rings: $('rings'), lives: $('lives'), time: $('time'), score: $('score'), power: $('power'), secrets: $('secrets') };
// Aviso al encontrar una zona secreta (durante un rato sustituye al contador de secretos)
let secretToastUntil = 0;
G.onSecret = () => { secretToastUntil = performance.now() + 2500; };
function updateHud() {
  const r = String(player.rings), l = String(G.lives), t = fmtTime(G.levelTime), s = String(G.score + player.rings * 10);
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
