// 3B çengel tahtası: hücre kutuları, canvas dokulu harf/ipucu yüzeyleri,
// seçim vurguları ve çözüm animasyonları.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tweens, Ease } from './effects.js';

const COLORS = {
  letter:  0xf2ead6,
  letterInk: '#241d12',
  clue:    0x27335f,
  clueInk: '#dfe6ff',
  block:   0x141a33,
  solved:  0xe9c064,
  solvedInk: '#4a3406',
  select:  0x1c4a63,
  cursor:  0x8a6a14,
  wrong:   0xff3b30,
};

const CELL = 1.0;          // hücre aralığı
const BOX = 0.95;          // kutu genişliği
const H_LETTER = 0.22;     // harf hücresi yüksekliği
const H_CLUE = 0.30;       // ipucu hücresi yüksekliği

let geoLetter, geoClue, geoFace;
function geometries() {
  geoLetter = geoLetter || new RoundedBoxGeometry(BOX, H_LETTER, BOX, 3, 0.055);
  geoClue   = geoClue   || new RoundedBoxGeometry(BOX, H_CLUE, BOX, 3, 0.055);
  geoFace   = geoFace   || new THREE.PlaneGeometry(BOX * 0.94, BOX * 0.94);
  return { geoLetter, geoClue, geoFace };
}

/* ---------- Doku çizimleri ---------- */
function canvasTexture(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawLetter(g, s, ch, ink) {
  g.clearRect(0, 0, s, s);
  if (!ch) return;
  g.fillStyle = ink;
  g.font = `800 ${s * 0.62}px "Trebuchet MS", "Segoe UI", Verdana, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, s / 2, s * 0.55);
}

function wrapText(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? line + ' ' + w : w;
    if (g.measureText(probe).width > maxW && line) { lines.push(line); line = w; }
    else line = probe;
  }
  if (line) lines.push(line);
  return lines;
}

function drawArrow(g, s, arrow, half, single) {
  // half: 0 = üst yarı, 1 = alt yarı (tek ipucuysa -1)
  g.strokeStyle = '#ffd76e';
  g.fillStyle = '#ffd76e';
  g.lineWidth = s * 0.028;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const m = s * 0.055;           // kenar payı
  const ah = s * 0.052;          // ok başı boyutu
  const head = (x, y, dx, dy) => {  // (dx,dy) yönüne ok başı
    g.beginPath();
    g.moveTo(x + dx * ah, y + dy * ah);
    g.lineTo(x - dy * ah * .8 , y + dx * ah * .8);
    g.lineTo(x + dy * ah * .8, y - dx * ah * .8);
    g.closePath();
    g.fill();
  };
  if (arrow === 'right') {
    const y = single ? s / 2 : (half === 0 ? s * 0.27 : s * 0.75);
    g.beginPath(); g.moveTo(s - m - s*0.12, y); g.lineTo(s - m, y); g.stroke();
    head(s - m, y, 1, 0);
  } else if (arrow === 'down') {
    const x = single ? s / 2 : (half === 0 ? s * 0.3 : s * 0.72);
    g.beginPath(); g.moveTo(x, s - m - s*0.12); g.lineTo(x, s - m); g.stroke();
    head(x, s - m, 0, 1);
  } else if (arrow === 'rightDown') {
    // sağındaki hücreden aşağı: sağ kenarda dirsek
    const y = single ? s * 0.42 : (half === 0 ? s * 0.22 : s * 0.68);
    g.beginPath();
    g.moveTo(s - m - s*0.13, y);
    g.lineTo(s - m - s*0.02, y);
    g.lineTo(s - m - s*0.02, y + s*0.11);
    g.stroke();
    head(s - m - s*0.02, y + s*0.11, 0, 1);
  } else if (arrow === 'downRight') {
    // altındaki hücreden sağa: alt kenarda dirsek
    const x = single ? s * 0.42 : (half === 0 ? s * 0.24 : s * 0.66);
    g.beginPath();
    g.moveTo(x, s - m - s*0.13);
    g.lineTo(x, s - m - s*0.02);
    g.lineTo(x + s*0.11, s - m - s*0.02);
    g.stroke();
    head(x + s*0.11, s - m - s*0.02, 1, 0);
  }
}

function drawClueFace(g, s, clues, slots) {
  g.clearRect(0, 0, s, s);
  const two = clues.length === 2;
  clues.forEach((cl, i) => {
    const slot = slots[cl.slot];
    const top = two && i === 0;
    const y0 = two ? (i === 0 ? 0 : s / 2) : 0;
    const h = two ? s / 2 : s;
    const pad = s * 0.07;
    if (slot.emoji) {
      // resimli ipucu
      const fs = two ? h * 0.62 : s * 0.5;
      g.font = `${fs}px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(slot.emoji, s * 0.47, y0 + h * 0.52);
    } else {
      g.fillStyle = COLORS.clueInk;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = two ? s * 0.108 : s * 0.12;
      let lines;
      for (;;) {
        g.font = `600 ${fs}px "Trebuchet MS", "Segoe UI", Verdana, sans-serif`;
        lines = wrapText(g, slot.clue.toLocaleUpperCase('tr'), s - pad * 2 - s * 0.1);
        const maxLines = Math.floor((h - pad) / (fs * 1.14));
        if (lines.length <= maxLines || fs < s * 0.062) break;
        fs *= 0.92;
      }
      const lh = fs * 1.14;
      const cy = y0 + h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, li) => g.fillText(ln, s * 0.47, cy + li * lh));
    }
    drawArrow(g, s, cl.arrow, two ? i : -1, !two);
  });
  if (two) {
    g.strokeStyle = 'rgba(255, 215, 110, 0.45)';
    g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(s * 0.08, s / 2); g.lineTo(s * 0.92, s / 2); g.stroke();
  }
}

function drawMotif(g, s) {
  // dolgu hücresi: zarif sekiz köşeli yıldız motifi (çini esintisi)
  g.clearRect(0, 0, s, s);
  g.save();
  g.translate(s / 2, s / 2);
  g.strokeStyle = 'rgba(120, 140, 210, 0.20)';
  g.lineWidth = s * 0.014;
  const R = s * 0.2;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + (k ? Math.PI / 4 : 0);
      const x = Math.cos(a) * R, y = Math.sin(a) * R;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, s * 0.05, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/* ---------- Tahta ---------- */
export class Board {
  constructor(scene, puzzle, particles) {
    this.scene = scene;
    this.puzzle = puzzle;
    this.particles = particles;
    this.group = new THREE.Group();
    this.cells = [];          // [r][c] -> {group, box, face, tex, canvasDraw, type, base}
    this.raycastTargets = [];
    this.selection = [];      // seçili hücre koordinatları
    this.cursor = null;
    this.locked = new Set();  // "r,c" çözülmüş
    this._build();
    scene.add(this.group);
  }

  worldOf(r, c, y = 0) {
    const { rows, cols } = this.puzzle;
    return new THREE.Vector3(
      (c - (cols - 1) / 2) * CELL,
      y,
      (r - (rows - 1) / 2) * CELL);
  }

  _build() {
    const { geoLetter, geoClue, geoFace } = geometries();
    const { rows, cols, cells, slots } = this.puzzle;
    for (let r = 0; r < rows; r++) {
      this.cells.push([]);
      for (let c = 0; c < cols; c++) {
        const data = cells[r][c];
        const cg = new THREE.Group();
        cg.position.copy(this.worldOf(r, c));
        let box, face = null, tex = null;
        if (data.t === 'L') {
          const mat = new THREE.MeshStandardMaterial({
            color: COLORS.letter, roughness: 0.55, metalness: 0.06,
          });
          box = new THREE.Mesh(geoLetter, mat);
          box.position.y = H_LETTER / 2;
          tex = canvasTexture(g => drawLetter(g, 256, '', COLORS.letterInk));
          face = new THREE.Mesh(geoFace, new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
          }));
          face.rotation.x = -Math.PI / 2;
          face.position.y = H_LETTER + 0.004;
        } else if (data.t === 'C') {
          const mat = new THREE.MeshStandardMaterial({
            color: COLORS.clue, roughness: 0.42, metalness: 0.22,
            emissive: 0x0a1030, emissiveIntensity: 0.7,
          });
          box = new THREE.Mesh(geoClue, mat);
          box.position.y = H_CLUE / 2;
          tex = canvasTexture(g => drawClueFace(g, 320, data.clues, slots), 320);
          face = new THREE.Mesh(geoFace, new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
          }));
          face.rotation.x = -Math.PI / 2;
          face.position.y = H_CLUE + 0.004;
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color: COLORS.block, roughness: 0.8, metalness: 0.3,
          });
          box = new THREE.Mesh(geoLetter, mat);
          box.position.y = H_LETTER / 2;
          tex = canvasTexture(g => drawMotif(g, 256));
          face = new THREE.Mesh(geoFace, new THREE.MeshBasicMaterial({
            map: tex, transparent: true, depthWrite: false,
          }));
          face.rotation.x = -Math.PI / 2;
          face.position.y = H_LETTER + 0.004;
        }
        box.castShadow = true;
        box.receiveShadow = true;
        box.userData = { r, c, type: data.t };
        cg.add(box);
        if (face) cg.add(face);
        this.group.add(cg);
        this.cells[r].push({ group: cg, box, face, tex, type: data.t, baseY: 0 });
        this.raycastTargets.push(box);
      }
    }
  }

  // Açılış: hücreler dalga halinde yükselerek gelir
  intro() {
    const { rows, cols } = this.puzzle;
    let maxDelay = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = this.cells[r][c];
        const d = (Math.hypot(r - rows / 2, c - cols / 2)) * 0.07 + Math.random() * 0.05;
        maxDelay = Math.max(maxDelay, d);
        cell.group.position.y = -6;
        cell.group.scale.setScalar(0.6);
        tweens.add({
          dur: 0.9, delay: 0.35 + d, ease: Ease.outBack,
          update: t => {
            cell.group.position.y = -6 * (1 - t);
            const s = 0.6 + 0.4 * t;
            cell.group.scale.setScalar(s);
          },
        });
      }
    }
    return 0.35 + maxDelay + 0.9;
  }

  setLetter(r, c, ch, solved = false) {
    const cell = this.cells[r][c];
    if (!cell || cell.type !== 'L') return;
    const ink = solved ? COLORS.solvedInk : COLORS.letterInk;
    drawLetter(cell.tex.source.data.getContext('2d'), 256, ch || '', ink);
    cell.tex.needsUpdate = true;
    if (ch && !solved) {
      // yazma tepkisi: minik zıplama
      tweens.add({
        dur: 0.28, ease: Ease.outBack,
        update: t => { cell.group.scale.setScalar(1 + 0.1 * Math.sin(t * Math.PI)); },
      });
    }
  }

  _applyCellLook(r, c) {
    const cell = this.cells[r][c];
    if (cell.type !== 'L') return;
    const key = `${r},${c}`;
    const mat = cell.box.material;
    const isCursor = this.cursor && this.cursor[0] === r && this.cursor[1] === c;
    const inSel = this.selection.some(([rr, cc]) => rr === r && cc === c);
    let targetY = 0;
    if (this.locked.has(key)) {
      mat.color.setHex(COLORS.solved);
      mat.emissive.setHex(0x3a2a05);
      mat.emissiveIntensity = inSel ? 1.2 : 0.75;
      mat.metalness = 0.5; mat.roughness = 0.32;
      targetY = inSel ? 0.05 : 0;
    } else if (isCursor) {
      mat.color.setHex(0xfff3cf);
      mat.emissive.setHex(COLORS.cursor);
      mat.emissiveIntensity = 0.85;
      targetY = 0.14;
    } else if (inSel) {
      mat.color.setHex(0xdcefff);
      mat.emissive.setHex(COLORS.select);
      mat.emissiveIntensity = 0.8;
      targetY = 0.07;
    } else {
      mat.color.setHex(COLORS.letter);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      targetY = 0;
    }
    const g = cell.group;
    const fromY = g.position.y;
    if (Math.abs(fromY - targetY) > 1e-4) {
      tweens.kill(cell.moveTween);
      cell.moveTween = tweens.add({
        dur: 0.22, ease: Ease.outCubic,
        update: t => { g.position.y = fromY + (targetY - fromY) * t; },
      });
    }
  }

  setSelection(cellsArr, cursor) {
    const prev = this.selection.concat(this.cursor ? [this.cursor] : []);
    this.selection = cellsArr || [];
    this.cursor = cursor || null;
    const touched = new Set();
    for (const [r, c] of [...prev, ...this.selection, ...(this.cursor ? [this.cursor] : [])]) {
      const key = `${r},${c}`;
      if (!touched.has(key)) { touched.add(key); this._applyCellLook(r, c); }
    }
  }

  highlightClueCell(r, c, on) {
    const cell = this.cells[r][c];
    if (cell.type !== 'C') return;
    const mat = cell.box.material;
    mat.emissive.setHex(on ? 0x2a4a8f : 0x0a1030);
    mat.emissiveIntensity = on ? 1.4 : 0.7;
  }

  lockSlot(slot, letters) {
    const cellsArr = slotCells(slot);
    cellsArr.forEach(([r, c], i) => {
      const key = `${r},${c}`;
      this.locked.add(key);
      const cell = this.cells[r][c];
      this.setLetter(r, c, letters[i], true);
      // altın dalga: sırayla zıpla + parıltı
      tweens.add({
        dur: 0.55, delay: i * 0.07, ease: Ease.outBack,
        update: t => {
          cell.group.position.y = 0.34 * Math.sin(t * Math.PI);
          cell.group.scale.setScalar(1 + 0.16 * Math.sin(t * Math.PI));
        },
        complete: () => this._applyCellLook(r, c),
      });
      tweens.add({
        dur: 0.01, delay: i * 0.07 + 0.14,
        update: () => {},
        complete: () => this.particles.burst(
          this.worldOf(r, c, 0.6).add(this.group.position), 0xe8b84b, 26, 2.6),
      });
      this._applyCellLook(r, c);
    });
  }

  wrongSlot(slot) {
    const cellsArr = slotCells(slot);
    for (const [r, c] of cellsArr) {
      const cell = this.cells[r][c];
      if (this.locked.has(`${r},${c}`)) continue;
      const mat = cell.box.material;
      const ox = cell.group.position.x;
      tweens.add({
        dur: 0.5, ease: Ease.linear,
        update: t => {
          cell.group.position.x = ox + Math.sin(t * Math.PI * 6) * 0.06 * (1 - t);
          const k = Math.sin(t * Math.PI);
          mat.emissive.setHex(COLORS.wrong);
          mat.emissiveIntensity = k * 0.9;
        },
        complete: () => { cell.group.position.x = ox; this._applyCellLook(r, c); },
      });
    }
  }

  // Zafer: bütün tahta hafifçe dalgalanır
  victoryWave() {
    const { rows, cols } = this.puzzle;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = this.cells[r][c];
        const d = Math.hypot(r - rows / 2, c - cols / 2) * 0.09;
        tweens.add({
          dur: 1.1, delay: d, ease: Ease.outCubic,
          update: t => {
            cell.group.position.y = 0.5 * Math.sin(t * Math.PI) * (cell.type === 'L' ? 1 : 0.6);
          },
        });
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh) {
        o.geometry !== geoLetter && o.geometry !== geoClue && o.geometry !== geoFace && o.geometry.dispose();
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}

export function slotCells(slot) {
  const out = [];
  const dr = slot.dir === 'D' ? 1 : 0;
  const dc = slot.dir === 'A' ? 1 : 0;
  for (let i = 0; i < slot.len; i++) out.push([slot.r + dr * i, slot.c + dc * i]);
  return out;
}
