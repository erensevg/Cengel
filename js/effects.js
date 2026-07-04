// Tween motoru, partikül efektleri ve WebAudio sesleri.
import * as THREE from 'three';

/* ---------------- Tween ---------------- */
export const Ease = {
  linear:      t => t,
  outCubic:    t => 1 - Math.pow(1 - t, 3),
  inOutCubic:  t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
  inOutQuint:  t => t < .5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5) / 2,
  outBack:     t => { const c = 1.70158; return 1 + (c+1)*Math.pow(t-1,3) + c*Math.pow(t-1,2); },
  outElastic:  t => t === 0 ? 0 : t === 1 ? 1 :
                Math.pow(2, -10*t) * Math.sin((t*10 - 0.75) * (2*Math.PI/3)) + 1,
};

class TweenPool {
  constructor() { this.list = []; }
  add({ dur = 1, delay = 0, ease = Ease.inOutCubic, update, complete }) {
    const tw = { t: -delay, dur, ease, update, complete, done: false };
    this.list.push(tw);
    return tw;
  }
  kill(tw) { if (tw) tw.done = true; }
  step(dt) {
    for (const tw of this.list) {
      if (tw.done) continue;
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(tw.t / tw.dur, 1);
      tw.update && tw.update(tw.ease(k), k);
      if (k >= 1) { tw.done = true; tw.complete && tw.complete(); }
    }
    this.list = this.list.filter(t => !t.done);
  }
}
export const tweens = new TweenPool();

/* ---------------- Partiküller ---------------- */
function makeDotTexture(soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(soft ? 0.35 : 0.7, 'rgba(255,255,255,.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let dotTex = null;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.systems = [];
    dotTex = dotTex || makeDotTexture();
  }

  // Doğru kelimede altın ışıltı patlaması
  burst(pos, color = 0xe8b84b, count = 46, speed = 3.2) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const vel = [];
    for (let i = 0; i < count; i++) {
      p[i*3] = pos.x; p[i*3+1] = pos.y; p[i*3+2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.75);
      vel.push(new THREE.Vector3(
        Math.sin(b) * Math.cos(a) * s,
        Math.abs(Math.cos(b)) * s * 1.15,
        Math.sin(b) * Math.sin(a) * s));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16, map: dotTex, color, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.systems.push({ pts, vel, life: 0, maxLife: 1.25, gravity: 5.4, kind: 'burst' });
  }

  // Zafer konfetisi: tahtanın üstünden renkli pullar yağar
  confetti(center, extent = 6, count = 260) {
    const colors = [0xe8b84b, 0x63d8ff, 0xef6a6a, 0x7ee787, 0xd6a4ff, 0xfff3c4];
    const geo = new THREE.PlaneGeometry(0.14, 0.2);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const items = [];
    const dummy = new THREE.Object3D();
    const colAttr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color(colors[i % colors.length]);
      colAttr[i*3] = c.r; colAttr[i*3+1] = c.g; colAttr[i*3+2] = c.b;
      items.push({
        pos: new THREE.Vector3(
          center.x + (Math.random() - .5) * extent * 2,
          center.y + 6 + Math.random() * 7,
          center.z + (Math.random() - .5) * extent * 2),
        vel: new THREE.Vector3((Math.random() - .5) * .8, -(1.4 + Math.random() * 1.4), (Math.random() - .5) * .8),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 5 + 2, Math.random() * 5 + 2, Math.random() * 3),
        sway: Math.random() * Math.PI * 2,
      });
      dummy.position.copy(items[i].pos);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, c);
    }
    mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    this.systems.push({ pts: mesh, items, life: 0, maxLife: 11, kind: 'confetti', floorY: center.y - 0.4 });
  }

  step(dt) {
    const dummy = new THREE.Object3D();
    for (const s of this.systems) {
      s.life += dt;
      const k = s.life / s.maxLife;
      if (s.kind === 'burst') {
        const arr = s.pts.geometry.attributes.position.array;
        for (let i = 0; i < s.vel.length; i++) {
          s.vel[i].y -= s.gravity * dt;
          arr[i*3]   += s.vel[i].x * dt;
          arr[i*3+1] += s.vel[i].y * dt;
          arr[i*3+2] += s.vel[i].z * dt;
        }
        s.pts.geometry.attributes.position.needsUpdate = true;
        s.pts.material.opacity = Math.max(0, 1 - k * k);
      } else if (s.kind === 'confetti') {
        for (let i = 0; i < s.items.length; i++) {
          const it = s.items[i];
          if (it.pos.y > s.floorY) {
            it.sway += dt * 2.2;
            it.pos.x += (it.vel.x + Math.sin(it.sway) * .6) * dt;
            it.pos.y += it.vel.y * dt;
            it.pos.z += it.vel.z * dt;
            it.rot.x += it.spin.x * dt;
            it.rot.y += it.spin.y * dt;
            it.rot.z += it.spin.z * dt;
          }
          dummy.position.copy(it.pos);
          dummy.rotation.copy(it.rot);
          dummy.updateMatrix();
          s.pts.setMatrixAt(i, dummy.matrix);
        }
        s.pts.instanceMatrix.needsUpdate = true;
        if (k > .82) s.pts.material.opacity = Math.max(0, 1 - (k - .82) / .18);
        s.pts.material.transparent = true;
      }
      if (s.life >= s.maxLife) {
        this.scene.remove(s.pts);
        s.pts.geometry?.dispose?.();
        s.pts.material?.dispose?.();
        s.dead = true;
      }
    }
    this.systems = this.systems.filter(s => !s.dead);
  }
}

// Arka plandaki yıldızlar ve süzülen toz zerreleri
export function makeStars(count = 1400, radius = 90) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = Math.acos(2 * Math.random() - 1);
    const r = radius * (0.55 + Math.random() * 0.45);
    p[i*3]   = Math.sin(b) * Math.cos(a) * r;
    p[i*3+1] = Math.abs(Math.cos(b)) * r * 0.6 - 6;
    p[i*3+2] = Math.sin(b) * Math.sin(a) * r;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  dotTex = dotTex || makeDotTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.5, map: dotTex, color: 0xbdd4ff, transparent: true, opacity: .8,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

export function makeDust(count = 260, extent = 14) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    p[i*3]   = (Math.random() - .5) * extent * 2;
    p[i*3+1] = Math.random() * 7 + 0.4;
    p[i*3+2] = (Math.random() - .5) * extent * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  dotTex = dotTex || makeDotTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.075, map: dotTex, color: 0xe8cf9a, transparent: true, opacity: .5,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.step = (t) => {
    pts.rotation.y = t * 0.011;
    pts.material.opacity = 0.34 + Math.sin(t * 0.7) * 0.14;
  };
  return pts;
}

/* ---------------- Ses ---------------- */
class Sound {
  constructor() { this.ctx = null; this.muted = false; this.padNodes = null; }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq, { dur = .18, type = 'sine', gain = .16, delay = 0, slide = 0 } = {}) {
    if (this.muted || !this.ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + .05);
  }

  click()  { this.tone(1250, { dur: .05, gain: .05, type: 'triangle' }); }
  place()  { this.tone(620,  { dur: .07, gain: .09, type: 'triangle', slide: 90 }); }
  erase()  { this.tone(300,  { dur: .07, gain: .07, type: 'triangle', slide: -60 }); }
  select() { this.tone(880,  { dur: .09, gain: .06, type: 'sine' }); }
  wrong()  {
    this.tone(150, { dur: .22, gain: .14, type: 'sawtooth' });
    this.tone(118, { dur: .26, gain: .12, type: 'sawtooth', delay: .05 });
  }
  correct() {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      this.tone(f, { dur: .5, gain: .13, delay: i * 0.085 });
      this.tone(f * 2, { dur: .3, gain: .04, delay: i * 0.085 });
    });
  }
  hint() { this.tone(987, { dur: .3, gain: .1 }); this.tone(1318, { dur: .4, gain: .08, delay: .1 }); }
  victory() {
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    seq.forEach((f, i) => {
      this.tone(f, { dur: .8, gain: .12, delay: i * 0.13 });
      this.tone(f / 2, { dur: .9, gain: .06, delay: i * 0.13 });
    });
  }
  whoosh() { this.tone(220, { dur: 1.15, gain: .05, type: 'sine', slide: 420 }); }

  startPad() {
    if (this.muted || !this.ensure() || this.padNodes) return;
    const mk = (f, detune) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = detune;
      return o;
    };
    const g = this.ctx.createGain(); g.gain.value = 0;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const o1 = mk(65.4, 0), o2 = mk(98, 6), o3 = mk(130.8, -7);
    [o1, o2, o3].forEach(o => o.connect(lp));
    lp.connect(g).connect(this.master);
    [o1, o2, o3].forEach(o => o.start());
    g.gain.linearRampToValueAtTime(0.045, this.ctx.currentTime + 4);
    this.padNodes = { g, oscs: [o1, o2, o3] };
  }
  stopPad() {
    if (!this.padNodes) return;
    const { g, oscs } = this.padNodes;
    g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
    oscs.forEach(o => o.stop(this.ctx.currentTime + 0.8));
    this.padNodes = null;
  }
  setMuted(m) {
    this.muted = m;
    if (m) this.stopPad(); else this.startPad();
  }
}
export const sound = new Sound();
