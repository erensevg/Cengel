// 3B dünya: arazi, varlıklar (oyuncu/mob/metin), kamera, tıklama, efektler.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// KayKit Adventurers (CC0) karakterleri + animasyon adları
const CHAR_FILES = ['Knight', 'Barbarian', 'Rogue', 'Mage'];
// sınıf -> model indeksi (Knight0/Barbarian1/Rogue2/Mage3) + Tritas karanlık tonu
const CLASS_MODEL = { savasci: 0, ninja: 2, buyucu: 3, tritas: 1 };
const CLASS_TINT = { tritas: 0x8a1030 };
const ANIM = {
  idle: 'Idle', run: 'Running_A',
  attack: '1H_Melee_Attack_Slice_Diagonal', death: 'Death_A',
};

// Mob kodu -> animasyonlu iskelet modeli (KayKit Skeletons, CC0)
// tint: boss/element renk tonu (emissive) — büyük düşmanları öne çıkarır.
const MOB_MODEL = {
  // Doğu Vadisi
  yaban_domuzu:   { file: 'Skeleton_Minion',  scale: 0.92 },
  golge_yarasa:   { file: 'Skeleton_Minion',  scale: 0.72, tint: 0x5a3f8a },
  kurt:           { file: 'Skeleton_Warrior', scale: 1.0 },
  mezar_muhafizi: { file: 'Skeleton_Rogue',   scale: 1.05 },
  kemik_lordu:    { file: 'Skeleton_Warrior', scale: 1.8,  tint: 0x8a1f1f },
  // Kızıl Çöl
  col_akrebi:     { file: 'Skeleton_Rogue',   scale: 1.0 },
  col_yilani:     { file: 'Skeleton_Minion',  scale: 1.1,  tint: 0xc09030 },
  col_kurdu:      { file: 'Skeleton_Mage',    scale: 1.0 },
  dag_ayisi:      { file: 'Skeleton_Warrior', scale: 1.35 },
  kum_firavunu:   { file: 'Skeleton_Mage',    scale: 1.9,  tint: 0xd8a028 },
  // Buz Zirvesi
  kar_cini:       { file: 'Skeleton_Minion',  scale: 1.0,  tint: 0x6ab0e0 },
  buz_kurdu:      { file: 'Skeleton_Rogue',   scale: 1.15, tint: 0x9fd8ff },
  buz_savascisi:  { file: 'Skeleton_Warrior', scale: 1.2,  tint: 0x9fd8ff },
  kar_ayisi:      { file: 'Skeleton_Mage',    scale: 1.4,  tint: 0xbfe8ff },
  ejder_ruhu:     { file: 'Skeleton_Warrior', scale: 2.2,  tint: 0xffcf3a },
};
const MOB_FILES = ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage'];

const MOB_STYLE = {
  yaban_domuzu: { color: 0x8a5a33, w: 1.3, h: 0.8, shape: 'beast' },
  kurt:         { color: 0x9aa3ad, w: 1.2, h: 0.9, shape: 'beast' },
  col_akrebi:   { color: 0x8a2f2f, w: 1.4, h: 0.55, shape: 'beast' },
  dag_ayisi:    { color: 0x5b4632, w: 1.7, h: 1.5, shape: 'beast' },
  // metinler (kristal) — her tür farklı renkte parlar
  metin_kaya:   { color: 0x8f7bd8, emissive: 0x5a3fd0, shape: 'metin', h: 3.2 },
  metin_ates:   { color: 0xff8a4c, emissive: 0xd84b12, shape: 'metin', h: 3.8 },
  metin_buz:    { color: 0x9fd8ff, emissive: 0x4aa0e0, shape: 'metin', h: 3.5 },
  metin_golge:  { color: 0x8f6ad0, emissive: 0x3a1f6a, shape: 'metin', h: 3.4 },
  metin_kum:    { color: 0xe0c078, emissive: 0xc08a20, shape: 'metin', h: 3.6 },
  metin_ruh:    { color: 0xcfeaff, emissive: 0x7ad0ff, shape: 'metin', h: 4.0 },
};

// Harita temaları: arazi paleti, sis, bitki örtüsü
const THEMES = {
  vadi:  { kind: 'vadi', c: [0x3d6b35, 0x5d8a3e, 0x8a7a4e], fog: 0x141c33, fogD: 0.009,
           leaf: 0x2f5d2a, trunk: 0x5a4128, trees: 170, rocks: 45,
           sky: ['#4a6fae', '#243458', '#101728'],
           sun: 0xfff2d8, sunI: 2.2, hemi: 0xbdd4ff, speck: ['#4a7a3e', '#6a9a4a', '#8aa85a'] },
  col:   { kind: 'col', c: [0x9a7a3e, 0xc09a54, 0xd8b46e], fog: 0x3a2410, fogD: 0.010,
           leaf: 0x4a7a3a, trunk: 0x6a8a4a, trees: 40, rocks: 90,
           sky: ['#c07a3a', '#5a3418', '#1a0e06'],
           sun: 0xffd8a0, sunI: 2.6, hemi: 0xffd8b0, speck: ['#b08a48', '#caa45e', '#e0c078'] },
  zirve: { kind: 'zirve', c: [0xbecbde, 0xdae4f0, 0xf4f8fc], fog: 0x2c3850, fogD: 0.012,
           leaf: 0x3a5d4a, trunk: 0x3a3f4a, trees: 190, rocks: 60,
           sky: ['#7a92c0', '#37456a', '#141a2c'],
           sun: 0xe8f0ff, sunI: 1.7, hemi: 0xd8e6ff, speck: ['#c8d4e4', '#e2eaf4', '#ffffff'] },
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

    this.mapMeshes = [];   // tema değişince sökülecekler
    this.portalPos = null;
    this.chars = null;     // GLTF karakter kütüphanesi
    this.assetsReady = this._loadCharacters();
    this._buildTerrain(THEMES.vadi);
    this._buildProps(THEMES.vadi);
    this._buildMarkers();

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

  async _loadCharacters() {
    try {
      const loader = new GLTFLoader();
      const [chars, mobs] = await Promise.all([
        Promise.all(CHAR_FILES.map(n => loader.loadAsync(`assets/characters/${n}.glb`))),
        Promise.all(MOB_FILES.map(n => loader.loadAsync(`assets/mobs/${n}.glb`))),
      ]);
      this.chars = chars;
      this.mobLib = {};
      MOB_FILES.forEach((n, i) => this.mobLib[n] = mobs[i]);
    } catch (e) {
      console.warn('Karakter modelleri yüklenemedi, basit modeller kullanılacak', e);
      this.chars = null;
    }
  }

  _buildTerrain(th) {
    const size = this.cfg.worldHalf * 2 + 40;
    const geo = new THREE.PlaneGeometry(size, size, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(th.c[0]), c2 = new THREE.Color(th.c[1]),
          c3 = new THREE.Color(th.c[2]), tmp = new THREE.Color();
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
    // zemin detay dokusu: temaya göre benekli (çimen/kum/kar)
    const dc = document.createElement('canvas');
    dc.width = dc.height = 256;
    const dg = dc.getContext('2d');
    dg.fillStyle = '#c8c8c8';
    dg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      dg.fillStyle = Math.random() < 0.75 ? `rgba(255,255,255,${0.05 + Math.random() * 0.1})`
        : th.speck[(Math.random() * th.speck.length) | 0] + 'aa'.slice(0, 0) ;
      if (Math.random() < 0.3) dg.fillStyle = th.speck[(Math.random() * th.speck.length) | 0];
      const w = 1 + Math.random() * 2;
      dg.globalAlpha = 0.25 + Math.random() * 0.4;
      dg.fillRect(Math.random() * 256, Math.random() * 256, w, w * (0.5 + Math.random() * 2));
      dg.globalAlpha = 1;
    }
    const detail = new THREE.CanvasTexture(dc);
    detail.colorSpace = THREE.SRGBColorSpace;
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.repeat.set(44, 44);
    const ground = this.ground = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: detail }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.mapMeshes.push(ground);
    this.scene.fog.color.setHex(th.fog);
    this.scene.fog.density = th.fogD;
    this.sun.color.setHex(th.sun ?? 0xfff0d0);
    this.sun.intensity = th.sunI ?? 1.9;
    {
      const c = document.createElement('canvas');
      c.width = 2; c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0, th.sky[0]); grd.addColorStop(.55, th.sky[1]); grd.addColorStop(1, th.sky[2]);
      g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = tex;
    }
  }

  _buildProps(th) {
    // ağaçlar + kayalar (deterministik dağılım, spawn noktası çevresi boş)
    const rng = (() => { let s = 1337; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
    const nTree = th.trees, nRock = th.rocks;
    const H = this.cfg.worldHalf;
    const trunkG = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6);
    const leafG = new THREE.ConeGeometry(1.15, 2.6, 7);
    const trunkM = new THREE.MeshStandardMaterial({ color: th.trunk, roughness: 1 });
    const leafM = new THREE.MeshStandardMaterial({ color: th.leaf, roughness: 0.9 });
    const rockG = new THREE.DodecahedronGeometry(0.7);
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6d6d78, roughness: 0.9 });
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
    this.mapMeshes.push(trunks, leaves, rocks);
  }

  _buildMarkers() {
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

  /* ---------------- harita değişimi ---------------- */
  setMap(mapDef) {
    // eski arazi/bitkileri sök
    for (const m of this.mapMeshes) {
      this.scene.remove(m);
      m.geometry?.dispose?.();
    }
    this.mapMeshes = [];
    if (this.portal) { this.scene.remove(this.portal); this.portal = null; }
    const th = THEMES[mapDef.theme] || THEMES.vadi;
    this._buildTerrain(th);
    this._buildProps(th);
    // Işınlanma Kapısı: dönen parlak halka
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.16, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x63d8ff, emissive: 0x2a8fd8,
        emissiveIntensity: 1.2, metalness: .6, roughness: .3 }));
    ring.position.y = 2.2;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.8, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c3350, roughness: .6 }));
    base.position.y = 0.25;
    ring.userData.portal = base.userData.portal = true;
    g.add(ring, base);
    g.position.set(mapDef.portalX, groundH(mapDef.portalX, mapDef.portalZ), mapDef.portalZ);
    this.portal = g;
    this.portalRing = ring;
    this.scene.add(g);

    // köy NPC'leri + kulübeler
    if (this.npcs) for (const n of this.npcs) this.scene.remove(n.group);
    this.npcs = [];
    // rol -> karakter modeli (Knight0/Barbarian1/Rogue2/Mage3)
    const npcModel = { demirci: 1, silahci: 0, zirhci: 1, tuccar: 3, iksirci: 2, at_tuccari: 0 };
    const npcEmoji = { demirci: '⚒️ ', silahci: '⚔️ ', zirhci: '🛡️ ',
                       tuccar: '💰 ', iksirci: '🧪 ', at_tuccari: '🐎 ' };
    for (const npc of (this.cfg.npcs || []).filter(n => n.mapId === mapDef.id)) {
      const grp = new THREE.Group();
      let clickMesh;
      if (this.chars) {
        const src = this.chars[npcModel[npc.role] ?? 0];
        const model = cloneSkeleton(src.scene);
        model.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; o.userData.npcRole = npc.role; } });
        grp.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const clip = src.animations.find(a => a.name === 'Idle');
        if (clip) mixer.clipAction(clip).play();
        this.npcs.push({ group: grp, mixer, role: npc.role });
        clickMesh = model;
      } else {
        clickMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0xaa8844 }));
        clickMesh.position.y = 0.9;
        clickMesh.userData.npcRole = npc.role;
        grp.add(clickMesh);
        this.npcs.push({ group: grp, role: npc.role });
      }
      const lbl = makeLabel((npcEmoji[npc.role] ?? '💰 ') + npc.name, '#ffd76e', 26);
      lbl.position.y = 2.7;
      grp.add(lbl);
      grp.position.set(npc.x, groundH(npc.x, npc.z), npc.z);
      grp.rotation.y = Math.PI / 3;
      this.scene.add(grp);
      // kulübe
      const hut = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x7a5f3a, roughness: .9 }));
      wall.position.y = 0.8; wall.castShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: .9 }));
      roof.position.y = 2.3; roof.castShadow = true;
      hut.add(wall, roof);
      hut.position.set(npc.x - 2.5, groundH(npc.x - 2.5, npc.z - 2), npc.z - 2);
      this.scene.add(hut);
      this.mapMeshes.push(hut);
      this.npcs[this.npcs.length - 1].group = grp;
    }
  }

  clearEntities() {
    for (const [, e] of this.players) this.scene.remove(e.group);
    for (const [, e] of this.mobs) this.scene.remove(e.group);
    this.players.clear();
    this.mobs.clear();
    this.select(null);
  }

  /* ---------------- +9/+10/+11 aurası ---------------- */
  static _glowTex = null;
  static glowTex() {
    if (World._glowTex) return World._glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,.9)');
    grd.addColorStop(.45, 'rgba(255,255,255,.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    World._glowTex = tex;
    return tex;
  }

  setGlow(e, tier) {
    if ((e.glowTier || 0) === tier) return;
    e.glowTier = tier;
    if (e.aura) { e.group.remove(e.aura); e.aura = null; }
    if (e.auraLight) { e.group.remove(e.auraLight); e.auraLight = null; }
    if (!tier) return;
    const conf = {
      1: { color: 0xeef4ff, op: 0.30, scale: 2.4, light: 0 },
      2: { color: 0xffd75c, op: 0.45, scale: 2.8, light: 0xffc23c },
      3: { color: 0xff3a2a, op: 0.60, scale: 3.2, light: 0xff2a1a },
    }[tier];
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: World.glowTex(), color: conf.color, transparent: true,
      opacity: conf.op, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sp.scale.set(conf.scale, conf.scale, 1);
    sp.position.y = 1.0;
    e.aura = sp;
    e.auraBase = conf.op;
    e.group.add(sp);
    if (conf.light) {
      const li = new THREE.PointLight(conf.light, tier === 3 ? 14 : 8, 7);
      li.position.y = 1.4;
      e.auraLight = li;
      e.group.add(li);
    }
  }

  // ata bin/in: basit prosedürel at meshi + oyuncuyu yukarı kaldır
  setMounted(e, on) {
    if (!!e.mounted === on) return;
    e.mounted = on;
    if (on) {
      const horse = new THREE.Group();
      const bodyC = e.horseArmored ? 0x556074 : 0x6b4a2e;
      const mat = new THREE.MeshStandardMaterial({ color: bodyC, roughness: .8 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: .9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.7), mat);
      body.position.y = 1.0; body.castShadow = true; horse.add(body);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.4), mat);
      neck.position.set(0, 1.35, 0.85); neck.rotation.x = -0.5; horse.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.6), mat);
      head.position.set(0, 1.7, 1.15); horse.add(head);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), dark);
        leg.position.set(lx * 0.26, 0.5, lz * 0.6); leg.castShadow = true; horse.add(leg);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), dark);
      tail.position.set(0, 1.0, -0.95); tail.rotation.x = 0.6; horse.add(tail);
      e.horse = horse;
      e.group.add(horse);
      if (e.model) e.model.position.y = 1.4;
    } else {
      if (e.horse) { e.group.remove(e.horse); e.horse = null; }
      if (e.model) e.model.position.y = 0;
    }
  }

  /* ---------------- skill efektleri ---------------- */
  skillFx(code, x, z, targetIds) {
    const colors = { guclu_vurus: 0xff5b4d, kasirga: 0x63d8ff, savas_cigligi: 0xffd75c };
    const col = colors[code] || 0xffffff;
    // yayılan halka
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.09, 8, 36).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: col, transparent: true }));
    ring.position.set(x, groundH(x, z) + 0.3, z);
    this.scene.add(ring);
    this.effects.push({ obj: ring, ringGrow: code === 'kasirga' ? 5.5 : 2.2, life: .6, t: 0 });
    // hedeflerde patlama
    for (const id of targetIds || []) {
      const e = this.mobs.get(id);
      if (e) this.burst(e.x, e.z, col);
    }
    if (code === 'savas_cigligi') this.burst(x, z, col);
  }

  burst(x, z, color) {
    const n = 26, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) {
      pos[i*3] = x; pos[i*3+1] = groundH(x, z) + 1; pos[i*3+2] = z;
      const a = Math.random() * 6.28;
      vel.push([Math.cos(a) * (1 + Math.random() * 2.4), 2 + Math.random() * 3.4,
                Math.sin(a) * (1 + Math.random() * 2.4)]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.2, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending }));
    this.scene.add(pts);
    this.effects.push({ obj: pts, particles: vel, life: .9, t: 0 });
  }

  /* ---------------- varlıklar ---------------- */
  _makePlayer(p) {
    const self = p.id === this.selfId;
    if (this.chars) return this._makeGltfPlayer(p, self);
    return this._makeProcPlayer(p, self);
  }

  _makeGltfPlayer(p, self) {
    // sınıfa göre model: Savaşçı=Şövalye, Ninja=Kurnaz, Büyücü=Büyücü, Tritas=Barbar(karanlık)
    const idx = CLASS_MODEL[p.cls] ?? 0;
    const src = this.chars[idx];
    const model = cloneSkeleton(src.scene);
    const tint = CLASS_TINT[p.cls];
    const tintApply = tint ? mt => {
      const c = mt.clone();
      c.emissive = new THREE.Color(tint); c.emissiveIntensity = 0.45;
      c.color = c.color.clone().multiplyScalar(0.7);
      return c;
    } : null;
    model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = false;
        if (tintApply && o.material)
          o.material = Array.isArray(o.material) ? o.material.map(tintApply) : tintApply(o.material);
      }
    });
    const g = new THREE.Group();
    g.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const act = name => {
      const clip = src.animations.find(a => a.name === name);
      return clip ? mixer.clipAction(clip) : null;
    };
    const actions = {
      idle: act(ANIM.idle), run: act(ANIM.run),
      attack: act(ANIM.attack), death: act(ANIM.death),
    };
    actions.idle?.play();
    const label = makeLabel(p.name, self ? '#ffe9ad' : '#cfe0ff');
    label.position.y = 2.65;
    const hp = makeHpBar();
    hp.sprite.position.y = 2.3;
    const e = { group: g, model, mixer, actions, hp, cur: 'idle', attacking: false,
                tx: p.x, tz: p.z, x: p.x, z: p.z, moving: false, dead: false, swing: 0 };
    e.setAnim = (name, fade = 0.18) => {
      if (e.cur === name || !e.actions[name]) return;
      const from = e.actions[e.cur], to = e.actions[name];
      to.reset().play();
      if (from && from !== to) from.crossFadeTo(to, fade, false);
      e.cur = name;
    };
    e.playAttack = () => {
      const a = e.actions.attack;
      if (!a || e.attacking) return;
      e.attacking = true;
      a.reset();
      a.setLoop(THREE.LoopOnce);
      a.timeScale = 1.6;
      a.clampWhenFinished = false;
      const from = e.actions[e.cur];
      if (from && from !== a) from.crossFadeTo(a, 0.08, false);
      a.play();
      const prev = e.cur;
      e.cur = 'attack_';
      setTimeout(() => {
        e.attacking = false;
        e.cur = '';
        e.setAnim(prev === 'attack_' ? 'idle' : prev || 'idle');
      }, (a.getClip().duration / 1.6) * 1000 - 60);
    };
    g.add(label, hp.sprite);
    this.scene.add(g);
    return e;
  }

  _makeProcPlayer(p, self) {
    // Yedek: Metin2 esintili savaşçı (modeller yüklenemezse)
    const g = new THREE.Group();
    const armorC = self ? 0x7d1f1f : 0x2c3e6b;   // kendin: kızıl zırh, diğerleri: çelik mavisi
    const trimC = self ? 0xe8b84b : 0x9fb4d8;
    const armor = new THREE.MeshStandardMaterial({ color: armorC, roughness: 0.5, metalness: 0.45 });
    const trim = new THREE.MeshStandardMaterial({ color: trimC, roughness: 0.35, metalness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8c39a, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.8 });

    const mk = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
    };
    // bacaklar (pivotu kalçada — animasyon için grup)
    const legG = new THREE.BoxGeometry(0.2, 0.62, 0.24);
    legG.translate(0, -0.31, 0);
    const legL = mk(legG, dark, -0.16, 0.66, 0);
    const legR = mk(legG.clone(), dark, 0.16, 0.66, 0);
    // gövde zırhı + göğüs plakası + kuşak
    mk(new THREE.BoxGeometry(0.6, 0.62, 0.36), armor, 0, 0.98, 0);
    mk(new THREE.BoxGeometry(0.46, 0.3, 0.4), trim, 0, 1.12, 0.01);
    mk(new THREE.BoxGeometry(0.62, 0.1, 0.38), trim, 0, 0.7, 0);
    // omuzluklar
    mk(new THREE.SphereGeometry(0.17, 8, 6), trim, -0.4, 1.26, 0);
    mk(new THREE.SphereGeometry(0.17, 8, 6), trim, 0.4, 1.26, 0);
    // kollar (pivot omuzda)
    const armG = new THREE.BoxGeometry(0.15, 0.55, 0.18);
    armG.translate(0, -0.27, 0);
    const armL = mk(armG, armor, -0.42, 1.22, 0);
    // kılıç kolu: grup — savurma animasyonu bunun üstünde
    const armSw = new THREE.Group();
    armSw.position.set(0.42, 1.22, 0);
    const armRm = new THREE.Mesh(armG.clone(), armor);
    armRm.castShadow = true;
    armSw.add(armRm);
    // büyük kılıç (elde)
    const sw = new THREE.Group();
    sw.position.set(0, -0.5, 0.05);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.35, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xdfe5f0, metalness: 0.9, roughness: 0.2 }));
    blade.position.y = 0.85; blade.castShadow = true;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), trim.clone());
    guard.position.y = 0.16;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 6), dark);
    sw.add(blade, guard, grip);
    sw.rotation.x = 0.5;
    armSw.add(sw);
    g.add(armSw);
    // baş + bandana/miğfer
    mk(new THREE.SphereGeometry(0.24, 12, 10), skin, 0, 1.62, 0);
    mk(new THREE.SphereGeometry(0.255, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), armor, 0, 1.66, 0);
    // topuz saç (metin2 savaşçısı)
    mk(new THREE.SphereGeometry(0.09, 6, 5), dark, 0, 1.92, -0.05);

    const label = makeLabel(p.name, self ? '#ffe9ad' : '#cfe0ff');
    label.position.y = 2.65;
    const hp = makeHpBar();
    hp.sprite.position.y = 2.3;
    g.add(label, hp.sprite);
    this.scene.add(g);
    return { group: g, hp, tx: p.x, tz: p.z, x: p.x, z: p.z,
             moving: false, dead: false, swing: 0, walk: 0,
             legL, legR, armL, armSw };
  }

  _makeMob(m) {
    const mm = MOB_MODEL[m.code];
    if (mm && this.mobLib && this.mobLib[mm.file]) return this._makeGltfMob(m, mm);
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
      const dark = new THREE.MeshStandardMaterial({
        color: new THREE.Color(st.color).multiplyScalar(0.55), roughness: 0.9 });
      const legH = m.code === 'kurt' ? 0.44 : 0.3;
      // gövde
      bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.w * 1.7), mat);
      bodyMesh.position.y = legH + st.h / 2;
      // baş + türe özgü detaylar
      const headM = new THREE.Mesh(
        new THREE.BoxGeometry(st.w * 0.55, st.h * 0.62, st.w * 0.55), mat);
      headM.position.set(0, legH + st.h * 0.8, st.w * 1.0);
      headM.castShadow = true;
      g.add(headM);
      if (m.code === 'yaban_domuzu') {
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.3), dark);
        snout.position.set(0, legH + st.h * 0.66, st.w * 1.35);
        const tusk = new THREE.CylinderGeometry(0.03, 0.015, 0.24, 5);
        for (const s of [-1, 1]) {
          const t = new THREE.Mesh(tusk, new THREE.MeshStandardMaterial({ color: 0xf0e6c8 }));
          t.position.set(s * 0.16, legH + st.h * 0.6, st.w * 1.3);
          t.rotation.x = -0.9;
          g.add(t);
        }
        g.add(snout);
      } else if (m.code === 'kurt') {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.6), dark);
        tail.position.set(0, legH + st.h * 0.7, -st.w * 1.05);
        tail.rotation.x = 0.7;
        for (const s of [-1, 1]) {   // kulaklar
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), dark);
          ear.position.set(s * 0.16, legH + st.h * 1.18, st.w * 0.95);
          g.add(ear);
        }
        g.add(tail);
      } else if (m.code === 'col_akrebi') {
        // kıskaçlar + kalkık kuyruk
        for (const s of [-1, 1]) {
          const claw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.42), dark);
          claw.position.set(s * st.w * 0.62, legH + 0.12, st.w * 1.0);
          g.add(claw);
        }
        let py = legH + st.h, pz = -st.w * 0.9;
        for (let i = 0; i < 3; i++) {
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.14 - i * 0.02, 6, 5), dark);
          seg.position.set(0, py += 0.2, pz += 0.12);
          g.add(seg);
        }
      } else if (m.code === 'dag_ayisi') {
        for (const s of [-1, 1]) {   // yuvarlak kulaklar
          const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), dark);
          ear.position.set(s * 0.2, legH + st.h * 1.25, st.w * 0.9);
          g.add(ear);
        }
      }
      // dört bacak (pivot üstte — yürüme animasyonu döndürür)
      const legG = new THREE.BoxGeometry(0.16, legH + 0.06, 0.16);
      legG.translate(0, -(legH + 0.06) / 2, 0);
      const legs = [];
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(legG, dark);
        leg.position.set(lx * st.w * 0.34, legH + 0.03, lz * st.w * 0.6);
        g.add(leg);
        legs.push(leg);
      }
      g.userData.legs = legs;
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

  // Animasyonlu iskelet mob (KayKit Skeletons, CC0)
  _makeGltfMob(m, mm) {
    const src = this.mobLib[mm.file];
    const model = cloneSkeleton(src.scene);
    const tintApply = mm.tint ? mt => {
      const c = mt.clone();
      c.emissive = new THREE.Color(mm.tint);
      c.emissiveIntensity = 0.5;
      return c;
    } : null;
    model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = false; o.userData.mobId = m.id;
        if (tintApply && o.material)
          o.material = Array.isArray(o.material) ? o.material.map(tintApply) : tintApply(o.material);
      }
    });
    model.scale.setScalar(mm.scale);
    const g = new THREE.Group();
    g.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const act = name => {
      const clip = src.animations.find(a => a.name === name);
      return clip ? mixer.clipAction(clip) : null;
    };
    const actions = { idle: act(ANIM.idle), run: act(ANIM.run), attack: act(ANIM.attack) };
    actions.idle?.play();
    const def = this.cfg.mobs.find(x => x.code === m.code);
    const topY = 2.55 * mm.scale + 0.35;
    const label = makeLabel(`${def?.name ?? m.code} · Sv ${def?.level ?? '?'}`, '#ffd2ad', 24);
    label.position.y = topY;
    const hp = makeHpBar();
    hp.sprite.position.y = topY - 0.4;
    g.add(label, hp.sprite);
    this.scene.add(g);
    const e = { group: g, hp, body: g, mixer, actions, cur: 'idle', attacking: false,
                tx: m.x, tz: m.z, x: m.x, z: m.z, code: m.code,
                maxHp: m.maxHp, lastHp: m.hp, dying: 0, gltf: true };
    e.setAnim = (name, fade = 0.18) => {
      if (e.cur === name || !e.actions[name]) return;
      const from = e.actions[e.cur], to = e.actions[name];
      to.reset().play();
      if (from && from !== to) from.crossFadeTo(to, fade, false);
      e.cur = name;
    };
    e.playAttack = () => {
      const a = e.actions.attack;
      if (!a || e.attacking || e.dying) return;
      e.attacking = true;
      a.reset(); a.setLoop(THREE.LoopOnce); a.timeScale = 1.4; a.clampWhenFinished = false;
      const from = e.actions[e.cur];
      if (from && from !== a) from.crossFadeTo(a, 0.08, false);
      a.play();
      e.cur = 'attack_';
      setTimeout(() => { e.attacking = false; e.cur = ''; e.setAnim('idle', 0.12); },
                 (a.getClip().duration / 1.4) * 1000 - 40);
    };
    return e;
  }

  /* ---------------- sunucu durumunu uygula ---------------- */
  applySnapshot(snap) {
    const seenP = new Set();
    for (const p of snap.players) {
      seenP.add(p.id);
      let e = this.players.get(p.id);
      if (!e) { e = this._makePlayer(p); this.players.set(p.id, e); }
      e.name = p.name;
      e.tx = p.x; e.tz = p.z; e.moving = p.moving; e.dead = p.dead;
      e.hp.draw(p.maxHp ? p.hp / p.maxHp : 0, '#58d68d');
      this.setGlow(e, p.glow || 0);
      e.horseArmored = !!p.horseArmored;
      this.setMounted(e, !!p.mounted);
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
    } else {
      // oyuncu hasar aldı: en yakın mobu görsel saldırıya geçir
      let near = null, best = 3.2;
      for (const mb of this.mobs.values()) {
        if (mb.dying || !mb.playAttack) continue;
        const d = Math.hypot(mb.x - e.x, mb.z - e.z);
        if (d < best) { best = d; near = mb; }
      }
      near?.playAttack();
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
    if (this.npcs?.length) {
      for (const n of this.npcs) {
        const hit = this.ray.intersectObject(n.group, true)[0];
        if (hit) { this.cb.onNpcClick(n.role); return; }
      }
    }
    if (this.portal) {
      const hitPortal = this.ray.intersectObject(this.portal, true)[0];
      if (hitPortal) { this.cb.onPortalClick(); return; }
    }
    let pickedMob = null, pickBest = Infinity;
    for (const [id, mb] of this.mobs) {
      if (mb.dying) continue;
      const hit = this.ray.intersectObject(mb.body || mb.group, true)[0];
      if (hit && hit.distance < pickBest) { pickBest = hit.distance; pickedMob = id; }
    }
    if (pickedMob != null) { this.cb.onMobClick(pickedMob); return; }
    // diğer oyuncular (düello/ticaret)
    let pickedPl = null, pickedPlId = null, plBest = Infinity;
    for (const [id, pe] of this.players) {
      if (id === this.selfId || pe.dead) continue;
      const hit = this.ray.intersectObject(pe.group, true)[0];
      if (hit && hit.distance < plBest) { plBest = hit.distance; pickedPl = pe; pickedPlId = id; }
    }
    if (pickedPl && this.cb.onPlayerClick) {
      this.cb.onPlayerClick(pickedPlId, pickedPl.name || 'Oyuncu'); return;
    }
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
      if (e.mixer) {
        e.mixer.update(dt);
        if (speed > 0.05) e.group.rotation.y = Math.atan2(dx, dz);
        if (!e.attacking) e.setAnim(speed > 0.05 ? 'run' : 'idle');
        if (e.swing > 0) { e.swing = 0; e.playAttack(); }
        continue;
      }
      if (speed > 0.05) {
        e.group.rotation.y = Math.atan2(dx, dz);
        e.walk += dt * 10;
        const s = Math.sin(e.walk);
        e.legL.rotation.x = s * 0.7;
        e.legR.rotation.x = -s * 0.7;
        e.armL.rotation.x = -s * 0.5;
        if (e.swing <= 0) e.armSw.rotation.x = s * 0.5;
        e.group.position.y += Math.abs(Math.sin(e.walk)) * 0.05;
      } else {
        e.legL.rotation.x *= 0.85; e.legR.rotation.x *= 0.85; e.armL.rotation.x *= 0.85;
        if (e.swing <= 0) e.armSw.rotation.x *= 0.85;
      }
      if (e.swing > 0) {   // kılıç savurma: kolu yukarıdan aşağı indir
        e.swing -= dt;
        const k = Math.sin((0.24 - e.swing) / 0.24 * Math.PI);
        e.armSw.rotation.x = -2.1 * k;
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
      const mobMoving = Math.hypot(dx, dz) > 0.05;
      if (mobMoving) e.group.rotation.y = Math.atan2(dx, dz);
      if (e.gltf) {
        e.mixer.update(dt);
        if (!e.attacking) e.setAnim(mobMoving ? 'run' : 'idle');
        continue;
      }
      const legs = e.group.userData.legs;
      if (legs) {
        e.walk = (e.walk || 0) + (mobMoving ? dt * 11 : 0);
        legs.forEach((leg, i) => {
          leg.rotation.x = mobMoving ? Math.sin(e.walk + (i % 2) * Math.PI) * 0.7
                                     : leg.rotation.x * 0.85;
        });
      }
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
      } else if (fx.ringGrow) {
        const k = fx.t / fx.life;
        fx.obj.scale.setScalar(1 + k * fx.ringGrow);
        fx.obj.material.opacity = 1 - k;
      } else {
        fx.obj.position.y += fx.vy * dt;
        fx.obj.material.opacity = 1 - (fx.t / fx.life) ** 2;
      }
      if (fx.t >= fx.life) { this.scene.remove(fx.obj); fx.dead = true; }
    }
    this.effects = this.effects.filter(f => !f.dead);

    if (this.npcs) for (const n of this.npcs) n.mixer?.update(dt);
    for (const e of this.players.values()) {
      if (e.aura) {
        e.aura.material.opacity = e.auraBase + Math.sin(t * 4) * 0.12;
        e.aura.material.rotation = t * 0.8;
      }
    }
    if (this.portalRing) {
      this.portalRing.rotation.y = t * 1.2;
      this.portalRing.material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.5;
    }

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
