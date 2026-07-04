// Çengel — sinematik Three.js çengel bulmaca
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { PUZZLES } from './puzzles.js';
import { Board } from './board.js';
import { Game, TR_LETTERS } from './game.js';
import { tweens, Ease, ParticleSystem, makeStars, makeDust, sound } from './effects.js';

/* ================= Sahne ================= */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
{
  // gece gökyüzü degradesi
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#1b2452');
  grd.addColorStop(0.45, '#0e1430');
  grd.addColorStop(1, '#05070f');
  g.fillStyle = grd; g.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
}
scene.fog = new THREE.FogExp2(0x070b1c, 0.016);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 300);

/* Işıklar */
scene.add(new THREE.HemisphereLight(0x93a7ff, 0x241a08, 0.55));
const key = new THREE.DirectionalLight(0xfff0d2, 2.1);
key.position.set(7, 14, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -9;
key.shadow.camera.right = key.shadow.camera.top = 9;
key.shadow.camera.far = 40;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.PointLight(0x3fa9ff, 160, 60);
rim.position.set(-10, 5, -8);
scene.add(rim);
const warm = new THREE.PointLight(0xffc36b, 60, 40);
warm.position.set(4, 7, -5);
scene.add(warm);

/* Zemin + ışık havuzu */
{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 48),
    new THREE.MeshStandardMaterial({ color: 0x0b1128, roughness: 0.92, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 256;
  const gg = glowC.getContext('2d');
  const grd = gg.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(84, 110, 220, .30)');
  grd.addColorStop(0.55, 'rgba(48, 66, 150, .12)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  gg.fillStyle = grd; gg.fillRect(0, 0, 256, 256);
  const gtex = new THREE.CanvasTexture(glowC);
  gtex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 34),
    new THREE.MeshBasicMaterial({ map: gtex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.04;
  scene.add(glow);
}

const stars = makeStars();
scene.add(stars);
const dust = makeDust();
scene.add(dust);
const particles = new ParticleSystem(scene);

/* Post-processing: bloom */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ================= Kamera yönetmeni ================= */
const rig = {
  target: new THREE.Vector3(0, 0, 0),
  look: new THREE.Vector3(0, 0, 0),
  az: Math.PI / 2, el: 0.97, radius: 14,
  // sinematik ofsetler
  parX: 0, parY: 0, shake: 0, t: 0,
  focus: new THREE.Vector3(0, 0, 0),
};

function rigApply(dt) {
  rig.t += dt;
  // fare paralaksı yumuşak takip
  rig.parX += (pointerNorm.x * 0.055 - rig.parX) * Math.min(1, dt * 3);
  rig.parY += (pointerNorm.y * 0.035 - rig.parY) * Math.min(1, dt * 3);
  const az = rig.az + Math.sin(rig.t * 0.23) * 0.010 + rig.parX;
  const el = Math.max(0.25, Math.min(1.45, rig.el + Math.sin(rig.t * 0.31) * 0.008 + rig.parY));
  const r = rig.radius * (1 + Math.sin(rig.t * 0.19) * 0.006);
  camera.position.set(
    rig.target.x + Math.cos(el) * Math.cos(az) * r,
    rig.target.y + Math.sin(el) * r,
    rig.target.z + Math.cos(el) * Math.sin(az) * r);
  if (rig.shake > 0) {
    camera.position.x += (Math.random() - .5) * rig.shake;
    camera.position.y += (Math.random() - .5) * rig.shake;
    rig.shake *= Math.pow(0.001, dt);
    if (rig.shake < 0.001) rig.shake = 0;
  }
  rig.look.lerp(rig.focus, Math.min(1, dt * 4));
  camera.lookAt(rig.look);
}

let rigTween = null;
function tweenRig(to, dur = 2, ease = Ease.inOutCubic, complete) {
  tweens.kill(rigTween);
  const from = { az: rig.az, el: rig.el, radius: rig.radius };
  return rigTween = tweens.add({
    dur, ease,
    update: t => {
      if (to.az != null) rig.az = from.az + (to.az - from.az) * t;
      if (to.el != null) rig.el = from.el + (to.el - from.el) * t;
      if (to.radius != null) rig.radius = from.radius + (to.radius - from.radius) * t;
    },
    complete,
  });
}

/* ================= Arayüz ================= */
const $ = id => document.getElementById(id);
const titleScreen = $('title-screen');
const hud = $('hud');
const cluePanel = $('clue-panel');
const clueArrow = $('clue-arrow');
const clueText = $('clue-text');
const progressBar = $('progress-bar');
const hudName = $('hud-name');
const victoryEl = $('victory');
const victoryStats = $('victory-stats');

const toast = document.createElement('div');
toast.id = 'word-toast';
document.body.appendChild(toast);

/* Ekran klavyesi */
const KB_ROWS = [
  'A B C Ç D E F G Ğ H'.split(' '),
  'I İ J K L M N O Ö P'.split(' '),
  'R S Ş T U Ü V Y Z ⌫'.split(' '),
];
{
  const kb = $('keyboard');
  for (const row of KB_ROWS) {
    const div = document.createElement('div');
    div.className = 'kb-row';
    for (const k of row) {
      const b = document.createElement('button');
      b.className = 'kb-key' + (k === '⌫' ? ' wide' : '');
      b.textContent = k;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!game) return;
        if (k === '⌫') game.backspace();
        else game.type(k);
      });
      div.appendChild(b);
    }
    kb.appendChild(div);
  }
}

/* ================= Oyun akışı ================= */
let board = null;
let game = null;
let puzzleIndex = 0;
let running = false;

function boardRadiusFor(p) {
  return Math.max(p.cols, p.rows) * 1.22 + 3.2;
}

function startPuzzle(idx, { firstTime = false } = {}) {
  puzzleIndex = idx % PUZZLES.length;
  const puzzle = PUZZLES[puzzleIndex];

  if (board) { board.dispose(); board = null; }
  game = null;

  board = new Board(scene, puzzle, particles);
  game = new Game({
    puzzle, board, particles,
    onSelect: showClue,
    onProgress: (done, total, slot) => {
      progressBar.style.width = `${(done / total) * 100}%`;
      rig.shake = 0.05;
      toast.textContent = slot.word;
      toast.classList.remove('pop');
      void toast.offsetWidth;      // animasyonu yeniden tetikle
      toast.classList.add('pop');
    },
    onVictory: onVictory,
    focusWord: cells => {
      const ctr = cells.reduce((a, v) => a.add(v), new THREE.Vector3())
                       .multiplyScalar(1 / cells.length);
      rig.focus.set(ctr.x * 0.42, 0, ctr.z * 0.42);
    },
  });

  hudName.textContent = `ÇENGEL · ${puzzle.name.toLocaleUpperCase('tr')}`;
  progressBar.style.width = '0%';
  showClue(null);
  victoryEl.classList.add('hidden');
  hud.classList.remove('hidden');

  // sinematik giriş: yüksekten süzülerek in
  const D = boardRadiusFor(puzzle);
  rig.focus.set(0, 0, 0);
  rig.look.set(0, 0, 0);
  if (firstTime) {
    rig.az = Math.PI / 2 + 2.6;
    rig.el = 1.42;
    rig.radius = D * 2.6;
  }
  sound.whoosh();
  if (!firstTime) {
    // birikmiş turları at, hedefe en kısa yoldan dön
    rig.az = ((rig.az % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (Math.abs(Math.PI / 2 - rig.az) > Math.PI) {
      rig.az += rig.az < Math.PI / 2 ? Math.PI * 2 : -Math.PI * 2;
    }
  }
  tweenRig({ az: Math.PI / 2, el: 0.96, radius: D },
           firstTime ? 4.2 : 2.6, Ease.inOutQuint);
  board.intro();
  running = true;
}

function showClue(info) {
  if (!info) {
    cluePanel.classList.add('empty');
    clueArrow.textContent = '✦';
    clueText.innerHTML = 'Bir kareye ya da ipucu kutusuna dokun';
    return;
  }
  cluePanel.classList.remove('empty');
  clueArrow.textContent = info.arrow;
  const emoji = info.emoji ? `<span class="clue-emoji">${info.emoji}</span>` : '';
  const state = info.solved ? ' ✓' : '';
  clueText.innerHTML =
    `${emoji}${escapeHtml(info.clue)}` +
    `<span class="clue-len">${info.dirLabel} · ${info.len} harf${state}</span>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function onVictory({ secs, hints }) {
  running = false;
  board.victoryWave();
  particles.confetti(new THREE.Vector3(0, 0, 0), Math.max(PUZZLES[puzzleIndex].cols, 6));
  sound.victory();
  rig.shake = 0.06;
  // tur atan kamera
  tweenRig({ az: rig.az + Math.PI * 2, el: 0.7, radius: rig.radius * 1.12 }, 9, Ease.inOutCubic);
  const dk = Math.floor(secs / 60), sn = secs % 60;
  const t = dk > 0 ? `${dk} dk ${sn} sn` : `${sn} saniye`;
  victoryStats.textContent =
    `${PUZZLES[puzzleIndex].name} bulmacayı ${t} içinde çözdün` +
    (hints > 0 ? ` · ${hints} ipucu` : ' · hiç ipucu almadan!');
  setTimeout(() => victoryEl.classList.remove('hidden'), 1600);
}

/* ================= Girdi ================= */
const pointerNorm = { x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
let downAt = null;

window.addEventListener('pointermove', e => {
  pointerNorm.x = (e.clientX / window.innerWidth - 0.5) * 2;
  pointerNorm.y = (e.clientY / window.innerHeight - 0.5) * 2;
});
renderer.domElement.addEventListener('pointerdown', e => {
  downAt = [e.clientX, e.clientY];
});
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || !running || !board) return;
  const dx = e.clientX - downAt[0], dy = e.clientY - downAt[1];
  downAt = null;
  if (dx * dx + dy * dy > 64) return;      // sürükleme değil, tıklama olsun
  pointerV.set((e.clientX / window.innerWidth) * 2 - 1,
               -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerV, camera);
  const hits = raycaster.intersectObjects(board.raycastTargets, false);
  if (hits.length) {
    const { r, c } = hits[0].object.userData;
    sound.click();
    game.clickCell(r, c);
  }
});

window.addEventListener('keydown', e => {
  if (!running || !game) return;
  if (e.key === 'Backspace') { e.preventDefault(); game.backspace(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { game.moveCursor(-1); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { game.moveCursor(1); return; }
  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    const open = game.puzzle.slots.filter(s => !game.solved.has(s.id));
    if (open.length) {
      const cur = game.selected ? open.findIndex(s => s.id === game.selected.id) : -1;
      game.selectSlot(open[(cur + 1) % open.length]);
    }
    return;
  }
  if (e.key.length === 1) {
    let ch = e.key;
    if (ch === 'i') ch = 'İ';
    else if (ch === 'ı') ch = 'I';
    else ch = ch.toLocaleUpperCase('tr');
    if (TR_LETTERS.includes(ch)) game.type(ch);
  }
});

/* ================= Düğmeler ================= */
for (const btn of document.querySelectorAll('.start-btn')) {
  btn.addEventListener('click', () => {
    const idx = parseInt(btn.dataset.puzzle, 10);
    titleScreen.classList.add('fading');
    sound.ensure();
    sound.startPad();
    startPuzzle(idx, { firstTime: true });
  });
}
$('btn-hint').addEventListener('click', () => game && game.hint());
$('btn-sound').addEventListener('click', e => {
  sound.setMuted(!sound.muted);
  e.currentTarget.textContent = sound.muted ? '🔇' : '🔊';
});
$('btn-menu').addEventListener('click', () => backToMenu());
$('btn-next').addEventListener('click', () => {
  victoryEl.classList.add('hidden');
  startPuzzle(puzzleIndex + 1);
});
$('btn-again').addEventListener('click', () => backToMenu());

function backToMenu() {
  running = false;
  victoryEl.classList.add('hidden');
  hud.classList.add('hidden');
  if (board) { board.dispose(); board = null; }
  game = null;
  titleScreen.classList.remove('fading');
  // menüde ağır çekim gezinme
  rig.az = Math.PI / 2 + 0.001;
  tweenRig({ az: Math.PI / 2 + 0.6, el: 1.1, radius: 20 }, 3, Ease.inOutCubic);
}

/* ================= Döngü ================= */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  const t = now / 1000;
  tweens.step(dt);
  particles.step(dt);
  dust.userData.step(t);
  stars.rotation.y = t * 0.004;
  rigApply(dt);
  composer.render();
});

// hata ayıklama / test kancası
window.__cengel = () => ({ board, game, puzzleIndex, running });

// menü arkasında yavaşça dönen boş sahne
rig.az = Math.PI / 2 - 0.4;
rig.el = 1.05;
rig.radius = 19;
rig.focus.set(0, 0, 0);
