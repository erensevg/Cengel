// 3B dünya: arazi, varlıklar (oyuncu/mob/metin), kamera, tıklama, efektler.
import * as THREE from 'three';

const MOB_STYLE = {
  yaban_domuzu: { color: 0x8a5a33, w: 1.3, h: 0.8, shape: 'beast' },
  kurt:         { color: 0x9aa3ad, w: 1.2, h: 0.9, shape: 'beast' },
  col_akrebi:   { color: 0x8a2f2f, w: 1.4, h: 0.55, shape: 'beast' },
  dag_ayisi:    { color: 0x5b4632, w: 1.7, h: 1.5, shape: 'beast' },
  metin_kaya:   { color: 0x8f7bd8, emissive: 0x5a3fd0, shape: 'metin', h: 3.2 },
  metin_ates:   { color: 0xff8a4c, emissive: 0xd84b12, shape: 'metin', h: 3.8 },
};

// Arazi yüksekliği — sunucu düz düzlem varsayar; görsel amaçlı hafif dalga.
export function groundH(x, z) {
  return Math.sin(x * 0.045) * Math.cos(z * 0.06) * 1.1 +
         Math.sin(x * 0.11 + 1.7) * Math.sin(z * 0.09) * 0.5;
}

function makeLabel(text, color = '#ffffff', size = 30) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = `700 ${size}px "Segoe UI", Verdana, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6;
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(3.4, 0.85, 1);
  return sp;
}

function makeHpBar() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(1.7, 0.21, 1);
  const draw = (ratio, color = '#e5484d') => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 16);
    g.fillStyle = 'rgba(0,0,0,.65)';
    g.fillRect(0, 0, 128, 16);
    g.fillStyle = color;
    g.fillRect(2, 2, Math.max(0, 124 * ratio), 12);
    tex.needsUpdate = true;
  };
  draw(1);
  return { sprite: sp, draw };
}

export class World {
  constructor(container, config, cb) {
    this.cfg = config;
    this.cb = cb;
    this.selfId = null;
    this.players = new Map();   // id -> entity
    this.mobs = new Map();      // id -> entity
    this.effects = [];
    this.selectedMob = null;
    this.cam = { yaw: Math.PI, pitch: 0.62, dist: 16 };

    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    {
      const c = document.createElement('canvas');
      c.width = 2; c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, '#2c3f6b'); grd.addColorStop(.55, '#151c38'); grd.addColorStop(1, '#0a0c14');
      g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = tex;
    }
    scene.fog = new THREE.FogExp2(0x10142a, 0.011);

    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

    scene.add(new THREE.HemisphereLight(0xbdd0ff, 0x2a2013, 0.75));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -40; sc.right = sc.top = 40; sc.far = 160;
    scene.add(sun, sun.target);

    this._buildTerrain();
    this._buildProps();

    // ---- girdi: sürükle = kamera, tık = etkileşim ----
    const el = renderer.domElement;
    this.ray = new THREE.Raycaster();
    let down = null, dragging = false;
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; dragging = false; });
    el.addEventListener('pointermove', e => {
      if (!down || !(e.buttons & 3)) return;
      const dx = e.clientX - down[0], dy = e.clientY - down[1];
      if (Math.abs(dx) + Math.abs(dy) > 6) dragging = true;
      if (dragging) {
        this.cam.yaw -= e.movementX * 0.0065;
        this.cam.pitch = Math.min(1.35, Math.max(0.18, this.cam.pitch + e.movementY * 0.004));
      }
    });
    el.addEventListener('pointerup', e => {
      const wasDrag = dragging; down = null; dragging = false;
      if (wasDrag) return;
      this._click(e.clientX, e.clientY);
    });
    el.addEventListener('wheel', e => {
      this.cam.dist = Math.min(34, Math.max(7, this.cam.dist + e.deltaY * 0.012));
    }, { passive: true });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    this._last = performance.now();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - this._last) / 1000, 0.1);
      this._last = now;
      this._tick(dt, now / 1000);
      renderer.render(scene, this.camera);
    };
    loop();
  }

  _buildTerrain() {
    const size = this.cfg.worldHalf * 2 + 40;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(0x3d6b35), c2 = new THREE.Color(0x5d8a3e),
          c3 = new THREE.Color(0x8a7a4e), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = groundH(x, z);
      pos.setY(i, h);
      const k = Math.min(1, Math.max(0, (h + 1.6) / 3.2));
      tmp.copy(c1).lerp(c2, k);
      if (h > 1.05) tmp.lerp(c3, (h - 1.05) * 0.8);
      const j = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1 * 0.06;
      colors[i * 3] = tmp.r + j; colors[i * 3 + 1] = tmp.g + j; colors[i * 3 + 2] = tmp.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = this.ground = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _buildProps() {
    // ağaçlar + kayalar (deterministik dağılım, spawn noktası çevresi boş)
    const rng = (() => { let s = 1337; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
    const H = this.cfg.worldHalf;
    const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6);
    const leafG = new THREE.ConeGeometry(1.15, 2.6, 7);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x2f5d2a, roughness: 0.9 });
    const rockG = new THREE.DodecahedronGeometry(0.7);
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6d6d78, roughness: 0.9 });
    const nTree = 150, nRock = 45;
    const trunks = new THREE.InstancedMesh(trunkG, trunkM, nTree);
    const leaves = new THREE.InstancedMesh(leafG, leafM, nTree);
    const rocks = new THREE.InstancedMesh(rockG, rockM, nRock);
    trunks.castShadow = leaves.castShadow = rocks.castShadow = true;
    const d = new THREE.Object3D();
    let placed = 0, guard = 0;
    while (placed < nTree && guard++ < 4000) {
      const x = (rng() * 2 - 1) * (H + 12), z = (rng() * 2 - 1) * (H + 12);
      if (Math.hypot(x - this.cfg.spawnPoint[0], z - this.cfg.spawnPoint[1]) < 12) continue;
      const s = 0.8 + rng() * 1.2;
      d.position.set(x, groundH(x, z) + 0.65 * s, z);
      d.scale.setScalar(s);
      d.rotation.y = rng() * 6.28;
      d.updateMatrix(); trunks.setMatrixAt(placed, d.matrix);
      d.position.y += 1.7 * s; d.updateMatrix(); leaves.setMatrixAt(placed, d.matrix);
      placed++;
    }
    for (let i = 0; i < nRock; i++) {
      const x = (rng() * 2 - 1) * (H + 10), z = (rng() * 2 - 1) * (H + 10);
      d.position.set(x, groundH(x, z) + 0.2, z);
      d.scale.setScalar(0.5 + rng() * 1.4);
      d.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      d.updateMatrix(); rocks.setMatrixAt(i, d.matrix);
    }
    this.scene.add(trunks, leaves, rocks);

    // hedef seçme halkası + yürüme işareti
    this.selRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.05, 8, 32).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff5b4d }));
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.moveMark = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.06, 8, 24).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6fe36f, transparent: true }));
    this.moveMark.visible = false;
    this.scene.add(this.moveMark);
  }

  /* ---------------- varlıklar ---------------- */
  _makePlayer(p) {
    const g = new THREE.Group();
    const self = p.id === this.selfId;
    const armor = new THREE.MeshStandardMaterial({
      color: self ? 0xd8b45a : 0x5a7fd8, roughness: 0.55, metalness: 0.35 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.8, 4, 10), armor);
    body.position.y = 0.85; body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8c39a, roughness: 0.7 }));
    head.position.y = 1.75; head.castShadow = true;
    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 1.15, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xd8dde8, metalness: 0.85, roughness: 0.25 }));
    sword.position.set(0.55, 1.0, 0.15);
    sword.rotation.z = -0.5;
    const label = makeLabel(p.name, self ? '#ffe9ad' : '#cfe0ff');
    label.position.y = 2.6;
    const hp = makeHpBar();
    hp.sprite.position.y = 2.25;
    g.add(body, head, sword, label, hp.sprite);
    this.scene.add(g);
    return { group: g, hp, body, sword, tx: p.x, tz: p.z, x: p.x, z: p.z,
             moving: false, dead: false, swing: 0 };
  }

  _makeMob(m) {
    const st = MOB_STYLE[m.code] || MOB_STYLE.kurt;
    const g = new THREE.Group();
    let bodyMesh;
    if (st.shape === 'metin') {
      const mat = new THREE.MeshStandardMaterial({
        color: st.color, emissive: st.emissive, emissiveIntensity: 0.55,
        roughness: 0.35, metalness: 0.2, flatShading: true });
      bodyMesh = new THREE.Mesh(new THREE.ConeGeometry(1.15, st.h, 5), mat);
      bodyMesh.position.y = st.h / 2;
      const rock2 = new THREE.Mesh(new THREE.ConeGeometry(0.55, st.h * 0.55, 5), mat);
      rock2.position.set(0.9, st.h * 0.27, 0.3);
      rock2.rotation.z = -0.35;
      g.add(rock2);
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.85 });
      bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.w * 1.6), mat);
      bodyMesh.position.y = st.h / 2 + 0.15;
      const headM = new THREE.Mesh(new THREE.BoxGeometry(st.w * 0.55, st.h * 0.6, st.w * 0.5), mat);
      headM.position.set(0, st.h * 0.75, st.w * 0.95);
      headM.castShadow = true;
      g.add(headM);
      // bacaklar
      const legG = new THREE.BoxGeometry(0.16, 0.34, 0.16);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(legG, mat);
        leg.position.set(lx * st.w * 0.32, 0.17, lz * st.w * 0.55);
        g.add(leg);
      }
    }
    bodyMesh.castShadow = true;
    bodyMesh.userData.mobId = m.id;
    const def = this.cfg.mobs.find(x => x.code === m.code);
    const label = makeLabel(`${def?.name ?? m.code} · Sv ${def?.level ?? '?'}`,
      st.shape === 'metin' ? '#d6a4ff' : '#ffd2ad', 24);
    label.position.y = (st.shape === 'metin' ? st.h + 0.7 : st.h + 1.15);
    const hp = makeHpBar();
    hp.sprite.position.y = label.position.y - 0.4;
    g.add(bodyMesh, label, hp.sprite);
    this.scene.add(g);
    return { group: g, hp, body: bodyMesh, tx: m.x, tz: m.z, x: m.x, z: m.z,
             code: m.code, maxHp: m.maxHp, lastHp: m.hp, dying: 0 };
  }

  /* ---------------- sunucu durumunu uygula ---------------- */
  applySnapshot(snap) {
    const seenP = new Set();
    for (const p of snap.players) {
      seenP.add(p.id);
      let e = this.players.get(p.id);
      if (!e) { e = this._makePlayer(p); this.players.set(p.id, e); }
      e.tx = p.x; e.tz = p.z; e.moving = p.moving; e.dead = p.dead;
      e.hp.draw(p.maxHp ? p.hp / p.maxHp : 0, '#58d68d');
      e.group.visible = !p.dead;
    }
    for (const [id, e] of this.players)
      if (!seenP.has(id)) { this.scene.remove(e.group); this.players.delete(id); }

    const seenM = new Set();
    for (const m of snap.mobs) {
      seenM.add(m.id);
      let e = this.mobs.get(m.id);
      if (!e) { e = this._makeMob(m); this.mobs.set(m.id, e); }
      e.tx = m.x; e.tz = m.z;
      if (m.hp !== e.lastHp) { e.hp.draw(m.hp / m.maxHp); e.lastHp = m.hp; }
    }
    for (const [id, e] of this.mobs)
      if (!seenM.has(id) && !e.dying) this._killMob(id, false);
  }

  _killMob(id, anim = true) {
    const e = this.mobs.get(id);
    if (!e) return;
    if (this.selectedMob === id) this.select(null);
    if (anim) e.dying = 0.001;   // animasyonla küçült
    else { this.scene.remove(e.group); this.mobs.delete(id); }
  }

  mobDead(id) { this._killMob(id, true); }

  select(mobId) {
    this.selectedMob = mobId;
    this.selRing.visible = mobId != null;
  }

  /* ---------------- efektler ---------------- */
  damage(tt, id, amount, crit) {
    const e = tt === 'mob' ? this.mobs.get(id) : this.players.get(id);
    if (!e) return;
    const own = tt === 'pl' && id === this.selfId;
    const label = makeLabel(String(amount),
      own ? '#ff6b5c' : crit ? '#ffd75c' : '#ffffff', crit ? 44 : 34);
    label.position.set(e.x + (Math.random() - .5) * .8,
      groundH(e.x, e.z) + 2.6, e.z + (Math.random() - .5) * .8);
    this.scene.add(label);
    this.effects.push({ obj: label, vy: 2.2, life: 1.1, t: 0 });
    // vuruş salınımı
    if (tt === 'mob') {
      e.group.position.y += 0.12;
      const p = this.players.get(this.selfId);
      if (p) p.swing = 0.24;
    }
  }

  levelBurst(id) {
    const e = this.players.get(id);
    if (!e) return;
    const n = 60, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos[i*3] = e.x; pos[i*3+1] = groundH(e.x, e.z) + 0.4; pos[i*3+2] = e.z;
      const a = Math.random() * 6.28;
      vel.push([Math.cos(a) * (1 + Math.random() * 2), 3 + Math.random() * 4,
                Math.sin(a) * (1 + Math.random() * 2)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffd75c, size: 0.22, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.effects.push({ obj: pts, particles: vel, life: 1.4, t: 0 });
  }

  showMoveMark(x, z) {
    this.moveMark.position.set(x, groundH(x, z) + 0.1, z);
    this.moveMark.visible = true;
    this.moveMark.userData.t = 0.9;
  }

  _click(cx, cy) {
    const v = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const mobMeshes = [...this.mobs.values()].filter(m => !m.dying).map(m => m.body);
    const hitMob = this.ray.intersectObjects(mobMeshes, false)[0];
    if (hitMob) { this.cb.onMobClick(hitMob.object.userData.mobId); return; }
    const hitG = this.ray.intersectObject(this.ground, false)[0];
    if (hitG) this.cb.onGroundClick(hitG.point.x, hitG.point.z);
  }

  /* ---------------- kare döngüsü ---------------- */
  _tick(dt, t) {
    // varlık enterpolasyonu
    for (const e of this.players.values()) {
      const dx = e.tx - e.x, dz = e.tz - e.z;
      e.x += dx * Math.min(1, dt * 10);
      e.z += dz * Math.min(1, dt * 10);
      const speed = Math.hypot(dx, dz);
      e.group.position.set(e.x, groundH(e.x, e.z), e.z);
      if (speed > 0.05) {
        e.group.rotation.y = Math.atan2(dx, dz);
        e.group.position.y += Math.abs(Math.sin(t * 9)) * 0.09;  // yürüme zıplaması
      }
      if (e.swing > 0) {   // kılıç savurma
        e.swing -= dt;
        e.sword.rotation.z = -0.5 - Math.sin((0.24 - e.swing) / 0.24 * Math.PI) * 1.4;
      }
    }
    for (const [id, e] of this.mobs) {
      if (e.dying) {
        e.dying += dt;
        const s = Math.max(0.001, 1 - e.dying * 2.2);
        e.group.scale.setScalar(s);
        if (s <= 0.01) { this.scene.remove(e.group); this.mobs.delete(id); }
        continue;
      }
      const dx = e.tx - e.x, dz = e.tz - e.z;
      e.x += dx * Math.min(1, dt * 10);
      e.z += dz * Math.min(1, dt * 10);
      e.group.position.set(e.x, groundH(e.x, e.z), e.z);
      if (Math.hypot(dx, dz) > 0.05) e.group.rotation.y = Math.atan2(dx, dz);
      if (MOB_STYLE[e.code]?.shape === 'metin') {
        e.group.rotation.y = t * 0.4;   // metinler yavaşça döner
        e.body.material.emissiveIntensity = 0.45 + Math.sin(t * 2.4) * 0.2;
      }
    }

    // seçim halkası
    if (this.selectedMob != null) {
      const e = this.mobs.get(this.selectedMob);
      if (e) this.selRing.position.set(e.x, groundH(e.x, e.z) + 0.12, e.z);
      else this.select(null);
    }
    if (this.moveMark.visible) {
      this.moveMark.userData.t -= dt;
      this.moveMark.material.opacity = Math.max(0, this.moveMark.userData.t);
      this.moveMark.scale.setScalar(1 + (0.9 - this.moveMark.userData.t) * 1.6);
      if (this.moveMark.userData.t <= 0) this.moveMark.visible = false;
    }

    // efektler
    for (const fx of this.effects) {
      fx.t += dt;
      if (fx.particles) {
        const arr = fx.obj.geometry.attributes.position.array;
        for (let i = 0; i < fx.particles.length; i++) {
          fx.particles[i][1] -= 6 * dt;
          arr[i*3] += fx.particles[i][0] * dt;
          arr[i*3+1] += fx.particles[i][1] * dt;
          arr[i*3+2] += fx.particles[i][2] * dt;
        }
        fx.obj.geometry.attributes.position.needsUpdate = true;
        fx.obj.material.opacity = 1 - fx.t / fx.life;
      } else {
        fx.obj.position.y += fx.vy * dt;
        fx.obj.material.opacity = 1 - (fx.t / fx.life) ** 2;
      }
      if (fx.t >= fx.life) { this.scene.remove(fx.obj); fx.dead = true; }
    }
    this.effects = this.effects.filter(f => !f.dead);

    // kamera: kendi karakterini takip
    const me = this.players.get(this.selfId);
    if (me) {
      const cy = groundH(me.x, me.z);
      const r = this.cam.dist, pitch = this.cam.pitch, yaw = this.cam.yaw;
      this.camera.position.set(
        me.x + Math.sin(yaw) * Math.cos(pitch) * r,
        cy + Math.sin(pitch) * r + 1.4,
        me.z + Math.cos(yaw) * Math.cos(pitch) * r);
      this.camera.lookAt(me.x, cy + 1.6, me.z);
      this.sun.position.set(me.x + 30, 55, me.z + 18);
      this.sun.target.position.set(me.x, 0, me.z);
    }
  }
}
