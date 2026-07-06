// Oyun akışı: giriş, hub bağlantıları, HUD, sohbet, arkadaşlar, envanter.
import { api, setToken, connect, session } from './net.js';
import { World } from './world.js';

const $ = id => document.getElementById(id);
let world = null, gameConn = null, chatConn = null, cfg = null;
let selfId = null, stats = null, targetMobId = null;
let mySkills = {}, currentMapId = null, quest = null;   // quest: {code,title,story,progress,target}

/* ---------------- giriş ---------------- */
async function auth(path) {
  const username = $('in-user').value.trim();
  const password = $('in-pass').value;
  $('login-err').textContent = '';
  try {
    const r = await api(`/api/auth/${path}`, {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    setToken(r.token, r.userId, r.username);
    await startGame();
  } catch (e) {
    $('login-err').textContent = e.message;
  }
}
$('btn-login').addEventListener('click', () => auth('login'));
$('btn-register').addEventListener('click', () => auth('register'));
$('in-pass').addEventListener('keydown', e => { if (e.key === 'Enter') auth('login'); });

/* ---------------- oyun başlatma ---------------- */
async function startGame() {
  cfg = await api('/api/game/config');

  world = new World($('app'), cfg, {
    onGroundClick(x, z) {
      world.showMoveMark(x, z);
      world.select(null);
      targetMobId = null;
      hideTarget();
      gameConn.invoke('MoveTo', x, z);
    },
    onMobClick(mobId) {
      targetMobId = mobId;
      world.select(mobId);
      showTarget(mobId);
      gameConn.invoke('Attack', mobId);
    },
    onPortalClick() { openTeleport(false); },
    onNpcClick(role) {
      if (role === 'demirci') openSmith();
      else if (role === 'at_tuccari') openStable();
      else openShop(role);
    },
  });

  gameConn = connect('/hubs/game');
  wireGameEvents();
  chatConn = connect('/hubs/chat');
  wireChatEvents();
  await Promise.all([gameConn.start(), chatConn.start(), world.assetsReady]);

  const join = await gameConn.invoke('JoinWorld');
  if (join.error) { $('login-err').textContent = join.error; return; }
  selfId = join.self.id;
  world.selfId = selfId;
  currentMapId = join.self.mapId;
  const mapDef = cfg.maps.find(m => m.id === currentMapId);
  world.setMap(mapDef);
  $('minimap-zone').textContent = mapDef.name;
  world.applySnapshot(join.world);
  mySkills = join.skills || {};
  renderQuickbar();
  refreshInv().catch(() => {});
  if (join.quest) {
    setQuest(join.quest);
    if (join.quest.isFirst && join.quest.progress === 0)
      showStory(join.quest.title, join.quest.story);
  } else {
    $('quest-track').classList.add('hidden');
  }

  $('pf-name').textContent = join.self.name;
  $('login').classList.add('hidden');
  $('hud').classList.remove('hidden');
  addChat({ ch: 'sys', from: 'Sistem',
    text: 'Hoş geldin! Yürümek için yere, saldırmak için canavara tıkla.' });
}

/* ---------------- game hub olayları ---------------- */
function wireGameEvents() {
  gameConn.on('world', s => world.applySnapshot(s));
  gameConn.on('dmg', d => {
    world.damage(d.tt, d.id, d.a, d.crit);
    if (d.tt === 'mob' && d.id === targetMobId) refreshTargetHp();
  });
  gameConn.on('mobDead', d => {
    world.mobDead(d.id);
    if (d.id === targetMobId) { targetMobId = null; hideTarget(); }
  });
  gameConn.on('stats', s => {
    stats = s;
    $('bar-hp').style.width = `${(s.hp / s.maxHp) * 100}%`;
    $('txt-hp').textContent = `${s.hp} / ${s.maxHp}`;
    const prev = xpFloor(s.level), next = s.xpNext;
    const ratio = Math.min(1, (s.xp - prev) / Math.max(1, next - prev));
    $('bar-xp').style.width = `${ratio * 100}%`;
    $('txt-xp').textContent = `XP ${s.xp} / ${next}`;
    $('bar-mp').style.width = `${(s.mp / s.maxMp) * 100}%`;
    $('txt-mp').textContent = `${s.mp} / ${s.maxMp}`;
    $('sk-points').textContent = `${s.skillPoints} puan`;
    $('btn-skill').style.borderColor = s.skillPoints > 0 ? 'var(--gold)' : '';
    $('pf-level').textContent = `Sv ${s.level}${s.buff ? ' 🔥' : ''}`;
    $('pf-yang').textContent = `${s.yang.toLocaleString('tr')} Yang`;
    $('xp-strip').style.width = `${ratio * 100}%`;
    if (!$('char-win').classList.contains('hidden')) renderChar();
    if (!$('stable-win').classList.contains('hidden')) renderStable();
  });
  gameConn.on('loot', l => {
    let msg = `+${l.yang} Yang`;
    for (const it of l.items) msg += ` · ${it.name} x${it.count}`;
    addChat({ ch: 'sys', from: 'Ganimet', text: msg });
    if (l.items.length) refreshInv().catch(() => {});
  });
  gameConn.on('levelUp', d => {
    world.levelBurst(d.id);
    if (d.id === selfId) {
      const el = $('levelup');
      el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      setTimeout(() => el.classList.add('hidden'), 2800);
    }
    notice(`⭐ ${d.name} seviye ${d.level} oldu!`);
  });
  gameConn.on('youDied', d => {
    $('death-by').textContent = d.by ? `${d.by} seni öldürdü.` : '';
    $('death').classList.remove('hidden');
  });
  gameConn.on('notice', n => notice(n.text));
  gameConn.on('questProgress', q => {
    if (quest && quest.code === q.code) {
      quest.progress = q.progress;
      renderQuestTrack();
    }
  });
  gameConn.on('questDone', d => {
    let reward = `+${d.rewardYang} Yang · +${d.rewardXp} XP`;
    if (d.rewardItem) reward += ` · ${d.rewardItem} x${d.rewardItemCount}`;
    if (d.rewardSp) reward += ` · ${d.rewardSp} skill puanı`;
    showStory(`${d.title} — TAMAMLANDI`, d.story, reward, () => {
      if (d.next) {
        setQuest({ code: d.next.code, title: d.next.title, story: d.next.story,
                   progress: 0, target: d.next.target });
        showStory(d.next.title, d.next.story);
      } else {
        quest = null;
        $('quest-track').classList.add('hidden');
        notice('🏆 Destan tamamlandı! Yeni maceralar yolda...');
      }
    });
    refreshInv().catch(() => {});
  });
  gameConn.on('skillFx', f => world.skillFx(f.code, f.x, f.z, f.targets));
  gameConn.on('playerLeft', () => {});   // anlık görüntü zaten temizler
}

function xpFloor(level) {
  return cfg.xpTable[level - 1] ?? 0;   // xpTable[l-1] = XpForLevel(l)
}

$('btn-respawn').addEventListener('click', async () => {
  await gameConn.invoke('Respawn');
  $('death').classList.add('hidden');
});

/* ---------------- hedef çerçevesi ---------------- */
function showTarget(mobId) {
  const e = world.mobs.get(mobId);
  if (!e) return;
  const def = cfg.mobs.find(m => m.code === e.code);
  $('tf-name').textContent = `${def.name} · Sv ${def.level}`;
  refreshTargetHp();
  $('target-frame').classList.remove('hidden');
}
function refreshTargetHp() {
  const e = world.mobs.get(targetMobId);
  if (e) {
    $('tf-hp').style.width = `${(e.lastHp / e.maxHp) * 100}%`;
    $('tf-hpnum').textContent = `${Math.max(0, Math.round(e.lastHp))} / ${e.maxHp}`;
  }
}
function hideTarget() { $('target-frame').classList.add('hidden'); }

/* ---------------- M haritası (tam ekran) ---------------- */
let mapTimer = null;
function toggleMap() {
  const ov = $('map-overlay');
  if (ov.classList.contains('hidden')) {
    const md = cfg.maps.find(m => m.id === currentMapId);
    $('map-title').textContent = 'Harita — ' + (md?.name ?? '');
    ov.classList.remove('hidden');
    drawMap();
    mapTimer = setInterval(drawMap, 400);
  } else {
    ov.classList.add('hidden');
    if (mapTimer) { clearInterval(mapTimer); mapTimer = null; }
  }
}
const MAP_BOSSES = ['kemik_lordu', 'kum_firavunu', 'ejder_ruhu'];
function drawMap() {
  if (!world || !cfg) return;
  const c = $('map-canvas'), g = c.getContext('2d');
  const S = c.width, half = cfg.worldHalf + 10;
  const px = v => (v / half) * (S / 2) + S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#0c1220'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const p = i / 8 * S;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.font = '17px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const md = cfg.maps.find(m => m.id === currentMapId);
  g.fillText('🏠', px(cfg.spawnPoint[0]), px(cfg.spawnPoint[1]));
  if (md) g.fillText('🌀', px(md.portalX), px(md.portalZ));
  for (const [, e] of world.mobs) {
    const metin = (e.code || '').startsWith('metin');
    const boss = MAP_BOSSES.includes(e.code);
    g.fillStyle = metin ? '#b07bff' : boss ? '#ff5a4a' : '#ffa64d';
    g.beginPath(); g.arc(px(e.x), px(e.z), boss ? 6 : metin ? 4.5 : 2.6, 0, 7); g.fill();
  }
  for (const [id, e] of world.players) {
    g.fillStyle = id === selfId ? '#58d68d' : '#5aa9ff';
    g.beginPath(); g.arc(px(e.x), px(e.z), id === selfId ? 5 : 3.2, 0, 7); g.fill();
  }
}

/* ---------------- bildirimler ---------------- */
function notice(text) {
  const div = document.createElement('div');
  div.className = 'notice';
  div.textContent = text;
  $('notices').appendChild(div);
  setTimeout(() => div.remove(), 6000);
  if ($('notices').children.length > 4) $('notices').firstChild.remove();
}

/* ---------------- sohbet ---------------- */
function wireChatEvents() {
  chatConn.on('chat', addChat);
  chatConn.on('friendRequest', r => {
    notice(`👥 ${r.fromUsername} arkadaşlık isteği gönderdi`);
    if (panelMode === 'friends') openPanel('friends');
  });
  chatConn.on('friendAccepted', d => notice(`👥 ${d.username} isteğini kabul etti`));
  chatConn.on('friendOnline', d => notice(`🟢 ${d.username} çevrimiçi`));
  chatConn.on('friendOffline', d => notice(`⚪ ${d.username} çevrimdışı`));
}

function addChat(m) {
  const div = document.createElement('div');
  if (m.ch === 'sys') {
    div.innerHTML = `<span class="sys">${esc(m.from)}: ${esc(m.text)}</span>`;
  } else if (m.ch === 'pm') {
    const dir = m.from === session.username ? `→ ${m.to}` : `← ${m.from}`;
    div.innerHTML = `<span class="pm">[${esc(dir)}]</span> ${esc(m.text)}`;
  } else {
    div.innerHTML = `<span class="from">${esc(m.from)}:</span> ${esc(m.text)}`;
  }
  const log = $('chat-log');
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 120) log.firstChild.remove();
}
function esc(s) {
  return String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function sendChat() {
  const inp = $('chat-in');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  const m = text.match(/^\/f\s+(\S+)\s+(.+)/i);   // /f isim mesaj
  if (m) chatConn.invoke('SendWhisper', m[1], m[2]);
  else chatConn.invoke('SendGlobal', text);
}
$('chat-send').addEventListener('click', sendChat);
$('chat-in').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
  e.stopPropagation();
});

/* ---------------- yan paneller ---------------- */
let panelMode = null;
$('btn-friends').addEventListener('click', () => togglePanel('friends'));
$('btn-inv').addEventListener('click', () => toggleInv());
$('btn-char').addEventListener('click', () => toggleChar());
$('btn-board').addEventListener('click', () => togglePanel('board'));
document.querySelectorAll('.m2-close').forEach(b =>
  b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')));
$('panel-close').addEventListener('click', () => togglePanel(panelMode));

function togglePanel(mode) {
  if (panelMode === mode) {
    panelMode = null;
    $('panel').classList.add('hidden');
  } else openPanel(mode);
}

async function openPanel(mode) {
  panelMode = mode;
  $('panel').classList.remove('hidden');
  const body = $('panel-body');
  if (mode === 'friends') {
    $('panel-title').textContent = 'Arkadaşlar';
    const [friends, reqs] = await Promise.all([
      api('/api/social/friends'), api('/api/social/friends/requests')]);
    body.innerHTML = `
      <div class="add-row"><input id="fr-name" placeholder="Oyuncu adı">
      <button id="fr-add">Ekle</button></div>`;
    if (reqs.length) {
      body.insertAdjacentHTML('beforeend', '<div class="panel-sub">Gelen istekler</div>');
      for (const r of reqs)
        body.insertAdjacentHTML('beforeend', `
          <div class="req-row"><span class="fname">${esc(r.fromUsername)}</span>
          <button class="req-ok" data-id="${r.id}" data-a="1">Kabul</button>
          <button class="req-no" data-id="${r.id}" data-a="0">Reddet</button></div>`);
    }
    body.insertAdjacentHTML('beforeend', '<div class="panel-sub">Arkadaş listesi</div>');
    if (!friends.length)
      body.insertAdjacentHTML('beforeend', '<div class="panel-empty">Henüz arkadaşın yok.</div>');
    for (const f of friends)
      body.insertAdjacentHTML('beforeend', `
        <div class="friend-row"><span class="dot ${f.online ? 'on' : ''}"></span>
        <span class="fname">${esc(f.username)}</span>
        ${f.online ? `<button class="req-ok" data-pm="${esc(f.username)}">Fısılda</button>` : ''}</div>`);
    body.querySelector('#fr-add').addEventListener('click', async () => {
      const name = body.querySelector('#fr-name').value.trim();
      if (!name) return;
      try {
        await api('/api/social/friends/request', {
          method: 'POST', body: JSON.stringify({ username: name }) });
        notice('İstek gönderildi.');
      } catch (e) { notice(e.message); }
    });
    body.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', async () => {
      await api('/api/social/friends/respond', {
        method: 'POST',
        body: JSON.stringify({ requestId: b.dataset.id, accept: b.dataset.a === '1' }) });
      openPanel('friends');
    }));
    body.querySelectorAll('[data-pm]').forEach(b => b.addEventListener('click', () => {
      $('chat-in').value = `/f ${b.dataset.pm} `;
      $('chat-in').focus();
    }));
  } else if (mode === 'board') {
    $('panel-title').textContent = 'Sıralama';
    const rows = await api('/api/game/leaderboard');
    body.innerHTML = rows.length ? '' : '<div class="panel-empty">Henüz kimse yok.</div>';
    rows.forEach((r, i) => body.insertAdjacentHTML('beforeend', `
      <div class="lb-row"><span class="rank">${i + 1}.</span>
      <span>${esc(r.name)}</span><span class="lvl">Sv ${r.level}</span></div>`));
  }
}

/* ---------------- Metin2 tarzı envanter penceresi ---------------- */
let invData = null;      // { equippedId, items[] }
let pickedItem = null;   // taşınan eşya
const ghost = document.createElement('div');
ghost.id = 'drag-ghost';
ghost.classList.add('hidden');
document.body.appendChild(ghost);
addEventListener('pointermove', e => {
  if (!pickedItem) return;
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
});

async function toggleInv() {
  const w = $('inv-win');
  if (!w.classList.contains('hidden')) { w.classList.add('hidden'); return; }
  await refreshInv();
  w.classList.remove('hidden');
}

async function refreshInv() {
  invData = await gameConn.invoke('GetInventory');
  const grid = $('inv-grid');
  grid.innerHTML = '';
  const bySlot = new Map(invData.items.filter(i => !i.equipped).map(i => [i.slot, i]));
  const plusCls = it => it.plus >= 11 ? ' p11' : it.plus >= 10 ? ' p10' : it.plus >= 9 ? ' p9' : '';
  const badge = it => it.plus > 0 ? `<span class="plus">+${it.plus}</span>` : '';
  for (let s = 0; s < 45; s++) {
    const div = document.createElement('div');
    const it = bySlot.get(s);
    div.className = 'inv-slot' + (it ? plusCls(it) : '');
    div.dataset.slot = s;
    if (it) {
      div.textContent = it.icon;
      div.insertAdjacentHTML('beforeend', badge(it));
      if (it.count > 1) div.insertAdjacentHTML('beforeend', `<span class="cnt">${it.count}</span>`);
      div.dataset.id = it.id;
      div.addEventListener('mouseenter', e => showTip(it, e));
      div.addEventListener('mouseleave', hideTip);
      div.addEventListener('dblclick', async () => {
        hideTip();
        if (isEquip(it.type)) {
          const r = await gameConn.invoke('Equip', it.id);
          if (r.error) notice(r.error);
          else notice(`⚔ ${it.name}${it.plus ? ' +' + it.plus : ''} kuşanıldı`);
          await refreshInv();
        } else if (it.type === 'iksir') {
          const r = await gameConn.invoke('UseItem', it.id);
          if (r.error) notice(r.error); else notice(`${it.name} içildi`);
          await refreshInv();
        } else if (it.type === 'parsomen') {
          openTeleport(true);
        }
      });
    }
    div.addEventListener('click', async () => {
      if (pickedItem) {
        await gameConn.invoke('MoveItem', pickedItem.id, parseInt(div.dataset.slot, 10));
        pickedItem = null;
        ghost.classList.add('hidden');
        await refreshInv();
      } else if (it) {
        pickedItem = it;
        ghost.textContent = it.icon;
        ghost.classList.remove('hidden');
        div.classList.add('picked');
      }
    });
    grid.appendChild(div);
  }
  document.querySelectorAll('#equip-grid .inv-slot').forEach(slot => {
    const type = slot.dataset.etype;
    const it = invData.items.find(i => i.equipped && i.type === type);
    slot.className = 'inv-slot equip' + (it ? plusCls(it) : '');
    slot.innerHTML = it ? it.icon + badge(it) : '';
    slot.onmouseenter = it ? (e => showTip(it, e)) : null;
    slot.onmouseleave = hideTip;
    slot.ondblclick = it ? (async () => {
      hideTip();
      const r = await gameConn.invoke('Unequip', it.id);
      if (r.error) notice(r.error); else notice(`${it.name} çıkarıldı`);
      await refreshInv();
    }) : null;
  });
  $('inv-yang-val').textContent = (stats?.yang ?? 0).toLocaleString('tr');
  updatePotCounts();
}

function isEquip(t) {
  return ['silah', 'zirh', 'kalkan', 'kupe', 'kolye', 'bileklik'].includes(t);
}

function showTip(it, e) {
  const tip = $('item-tip');
  const typeNames = { silah: 'Silah', zirh: 'Zırh', kalkan: 'Kalkan', kupe: 'Küpe',
    kolye: 'Kolye', bileklik: 'Bileklik', iksir: 'İksir', parsomen: 'Parşömen', malzeme: 'Malzeme' };
  tip.innerHTML =
    `<div class="tname">${it.icon} ${esc(it.name)}${it.plus ? ` +${it.plus}` : ''}</div>` +
    `<div class="ttype">${typeNames[it.type] || it.type}${it.count > 1 ? ` · x${it.count}` : ''}</div>` +
    (it.bonus ? `<div class="tbonus">Saldırı +${it.bonus}</div>` : '') +
    (it.defense ? `<div class="tbonus">Savunma +${it.defense}</div>` : '') +
    (it.hpBonus ? `<div class="tbonus">HP +${it.hpBonus}</div>` : '') +
    (it.price ? `<div class="ttype">Satış: ${Math.floor(it.price * 0.4)} yang</div>` : '') +
    `<div class="tdesc">${esc(it.desc)}</div>`;
  tip.classList.remove('hidden');
  const r = e.currentTarget.getBoundingClientRect();
  tip.style.left = Math.min(innerWidth - 230, r.left - 100) + 'px';
  tip.style.top = (r.bottom + 8) + 'px';
}
function hideTip() { $('item-tip').classList.add('hidden'); }

/* ---------------- karakter penceresi ---------------- */
function toggleChar() {
  const w = $('char-win');
  if (!w.classList.contains('hidden')) { w.classList.add('hidden'); return; }
  renderChar();
  w.classList.remove('hidden');
}
function renderChar() {
  if (!stats) return;
  const eq = invData?.items.find(i => i.equipped && i.type === 'silah');
  $('char-body').innerHTML = `
    <div class="crow"><span>İsim</span><b>${esc(session.username ?? '')}</b></div>
    <div class="crow"><span>Seviye</span><b>${stats.level}</b></div>
    <div class="crow"><span>XP</span><b>${stats.xp} / ${stats.xpNext}</b></div>
    <div class="crow"><span>HP</span><b>${stats.hp} / ${stats.maxHp}</b></div>
    <div class="crow"><span>Savunma</span><b>${stats.defense ?? 0}</b></div>
    <div class="crow"><span>Saldırı</span><b>${stats.damage}</b></div>
    <div class="crow"><span>Silah</span><b>${eq ? esc(eq.name) : '—'}</b></div>
    <div class="crow"><span>Yang</span><b>${stats.yang.toLocaleString('tr')}</b></div>`;
}

/* ---------------- mini harita ---------------- */
setInterval(() => {
  if (!world || !cfg) return;
  const c = $('minimap');
  const g = c.getContext('2d');
  const S = c.width, half = cfg.worldHalf + 10;
  const px = v => (v / half) * (S / 2) + S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#12200c';
  g.beginPath(); g.arc(S/2, S/2, S/2 - 2, 0, 7); g.fill();
  for (const [, m] of world.mobs) {
    const metin = (cfg.mobs.find(d => d.code === m.code) || {}).metin;
    g.fillStyle = metin ? '#c489ff' : '#e5484d';
    g.beginPath(); g.arc(px(m.x), px(m.z), metin ? 3 : 2, 0, 7); g.fill();
  }
  for (const [id, p] of world.players) {
    g.fillStyle = id === selfId ? '#ffd75c' : '#6fb4ff';
    g.beginPath(); g.arc(px(p.x), px(p.z), id === selfId ? 4 : 3, 0, 7); g.fill();
  }
}, 300);

/* ---------------- skill çubuğu + kullanım ---------------- */
const qsCd = {};   // code -> hazır olacağı zaman (ms)

function renderQuickbar() {
  const learned = cfg.skills.filter(sk => mySkills[sk.code]);
  for (let i = 1; i <= 4; i++) {
    const el = $(`qs-${i}`);
    const sk = learned[i - 1];
    el.innerHTML = `<span class="qk">${i}</span>` + (sk ? sk.icon : '');
    el.title = sk ? `${sk.name} (derece ${mySkills[sk.code]})` : 'Skill öğren (K)';
    el.classList.toggle('ready', !!sk);
    el.dataset.skill = sk ? sk.code : '';
    el.onclick = sk ? () => castSkill(sk.code) : () => toggleSkillWin();
  }
  $('qs-5').onclick = () => usePotion('hp');
  $('qs-6').onclick = () => usePotion('mp');
}

async function castSkill(code) {
  if (qsCd[code] && Date.now() < qsCd[code]) return;
  const r = await gameConn.invoke('CastSkill', code, targetMobId);
  if (r.error) { notice(r.error); return; }
  qsCd[code] = Date.now() + r.cooldown * 1000;
  // cooldown göstergesi
  const idx = cfg.skills.filter(sk => mySkills[sk.code]).findIndex(sk => sk.code === code);
  const el = $(`qs-${idx + 1}`);
  if (!el) return;
  const ov = document.createElement('div');
  ov.className = 'cdov';
  el.appendChild(ov);
  const tick = () => {
    const left = (qsCd[code] - Date.now()) / 1000;
    if (left <= 0) { ov.remove(); return; }
    ov.textContent = left.toFixed(0);
    requestAnimationFrame(tick);
  };
  tick();
}

/* ---------------- iksirler ---------------- */
function updatePotCounts() {
  const items = invData?.items || [];
  const cnt = kind => items
    .filter(i => i.type === 'iksir' && (kind === 'hp' ? i.healHp > 0 : i.healMp > 0))
    .reduce((a, i) => a + i.count, 0);
  $('qc-5').textContent = cnt('hp');
  $('qc-6').textContent = cnt('mp');
}

async function usePotion(kind) {
  const items = (invData?.items || [])
    .filter(i => i.type === 'iksir' && (kind === 'hp' ? i.healHp > 0 : i.healMp > 0))
    .sort((a, b) => (kind === 'hp' ? a.healHp - b.healHp : a.healMp - b.healMp));
  if (!items.length) { notice(kind === 'hp' ? 'Can iksirin yok!' : 'Mana iksirin yok!'); return; }
  const r = await gameConn.invoke('UseItem', items[0].id);
  if (r.error) { notice(r.error); await refreshInv(); return; }
  notice(`${items[0].name} içildi ${kind === 'hp' ? '❤️' : '💙'}`);
  await refreshInv();
}

/* ---------------- skill penceresi (K) ---------------- */
function toggleSkillWin() {
  const w = $('skill-win');
  if (!w.classList.contains('hidden')) { w.classList.add('hidden'); return; }
  renderSkillWin();
  w.classList.remove('hidden');
}
function renderSkillWin() {
  const body = $('skill-body');
  body.innerHTML = '';
  for (const sk of cfg.skills) {
    const lvl = mySkills[sk.code] || 0;
    const canLearn = !lvl && (stats?.level ?? 1) >= sk.reqLevel && (stats?.skillPoints ?? 0) > 0;
    const canUp = lvl > 0 && lvl < 10 && (stats?.skillPoints ?? 0) > 0;
    const btn = lvl === 0
      ? `<button data-learn="${sk.code}" ${canLearn ? '' : 'disabled'}>ÖĞREN</button>`
      : `<button data-up="${sk.code}" ${canUp ? '' : 'disabled'}>YÜKSELT</button>`;
    body.insertAdjacentHTML('beforeend', `
      <div class="sk-row">
        <span class="sk-ic">${sk.icon}</span>
        <span class="sk-mid">
          <div class="sk-name">${sk.name} ${lvl ? `<span class="sk-lvl">D${lvl}</span>` : ''}</div>
          <div class="sk-req">Seviye ${sk.reqLevel} · ${sk.mana} MP · ${sk.cooldown}sn bekleme</div>
          <div class="sk-desc">${sk.desc}</div>
        </span>${btn}</div>`);
  }
  body.querySelectorAll('[data-learn]').forEach(b => b.onclick = async () => {
    const r = await gameConn.invoke('LearnSkill', b.dataset.learn);
    if (r.error) notice(r.error);
    else { notice(`📕 ${r.name} öğrenildi!`); mySkills[b.dataset.learn] = 1; renderQuickbar(); }
    renderSkillWin();
  });
  body.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => {
    const r = await gameConn.invoke('UpgradeSkill', b.dataset.up);
    if (r.error) notice(r.error);
    else { mySkills[b.dataset.up] = r.level; notice(`Skill derecesi: ${r.level}`); renderQuickbar(); }
    renderSkillWin();
  });
}

/* ---------------- ışınlanma (portal / parşömen) ---------------- */
function openTeleport(viaScroll) {
  const body = $('tp-body');
  body.innerHTML = viaScroll
    ? '<div style="font-size:11px;color:#b9a988;margin-bottom:6px">📜 Parşömen kullanılıyor — nereye gidersen git bir parşömen harcanır.</div>' : '';
  for (const m of cfg.maps) {
    const here = m.id === currentMapId;
    const ok = !here && (stats?.level ?? 1) >= m.reqLevel;
    const cost = 300 + m.reqLevel * 200;   // sunucudaki TeleportCost ile aynı
    const costLine = viaScroll
      ? '<div class="tp-req">📜 1 parşömen</div>'
      : `<div class="tp-req">💰 ${cost} yang · Seviye ${m.reqLevel}+</div>`;
    body.insertAdjacentHTML('beforeend', `
      <div class="tp-row">
        <span class="tp-mid">
          <div class="tp-name">${m.name}${here ? ' (buradasın)' : ''}</div>
          <div class="tp-desc">${m.desc}</div>
          ${costLine}
        </span>
        <button data-tp="${m.id}" ${ok ? '' : 'disabled'}>IŞINLAN</button>
      </div>`);
  }
  body.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => doTeleport(b.dataset.tp, viaScroll));
  $('tp-win').classList.remove('hidden');
}

async function doTeleport(mapId, viaScroll) {
  const r = await gameConn.invoke('Teleport', mapId, viaScroll);
  if (r.error) { notice(r.error); return; }
  $('tp-win').classList.add('hidden');
  currentMapId = r.mapId;
  targetMobId = null;
  hideTarget();
  const mapDef = cfg.maps.find(m => m.id === r.mapId);
  world.clearEntities();
  world.setMap(mapDef);
  world.applySnapshot(r.world);
  $('minimap-zone').textContent = r.mapName;
  notice(`🌀 ${r.mapName}'ne ışınlandın`);
  await refreshInv().catch(() => {});
}

/* ---------------- Ahır (Seyis Bulut) ---------------- */
async function openStable() {
  $('stable-win').classList.remove('hidden');
  await refreshInv().catch(() => {});
  renderStable();
}
function invCount(code) {
  return (invData?.items || []).filter(i => i.code === code)
    .reduce((s, i) => s + i.count, 0);
}
function renderStable() {
  const med = invCount('at_madalyonu'), spark = invCount('kivilcim');
  const hasHorse = stats?.hasHorse, armored = stats?.horseArmored, mounted = stats?.mounted;
  const MED = 30, SPARK = 100;
  let html = '';
  if (!hasHorse) {
    const ok = med >= MED;
    html += `<div class="stable-row">
      <div class="stable-t">🐎 At Satın Al</div>
      <div class="stable-d">Bir at, dünyada çok daha hızlı gezmeni sağlar.</div>
      <div class="stable-cost ${ok ? '' : 'bad'}">🎗️ At Madalyonu: ${med} / ${MED}</div>
      <button id="btn-buy-horse" ${ok ? '' : 'disabled'}>SATIN AL (${MED} madalyon)</button>
    </div>`;
  } else {
    html += `<div class="stable-row">
      <div class="stable-t">🐎 Atın hazır${armored ? ' · 🛡️ zırhlı' : ''}</div>
      <div class="stable-d">Hız: ${armored ? '+%90' : '+%60'}. ${mounted ? 'Şu an binilisin.' : 'Yerde.'}</div>
      <button id="btn-mount">${mounted ? 'İN' : 'BİN'} (H)</button>
    </div>`;
    if (!armored) {
      const ok = spark >= SPARK;
      html += `<div class="stable-row">
        <div class="stable-t">🛡️ Atı Zırhla</div>
        <div class="stable-d">Zırhlı at daha hızlı ve görkemli.</div>
        <div class="stable-cost ${ok ? '' : 'bad'}">🔥 Kıvılcım: ${spark} / ${SPARK}</div>
        <button id="btn-armor-horse" ${ok ? '' : 'disabled'}>ZIRHLA (${SPARK} kıvılcım)</button>
      </div>`;
    }
  }
  $('stable-body').innerHTML = html;
  const bh = $('btn-buy-horse'); if (bh) bh.onclick = async () => {
    const r = await gameConn.invoke('BuyHorse');
    notice(r.error || '🐎 At satın alındı!'); await refreshInv().catch(() => {}); renderStable();
  };
  const ba = $('btn-armor-horse'); if (ba) ba.onclick = async () => {
    const r = await gameConn.invoke('ArmorHorse');
    notice(r.error || '🛡️ At zırhlandı!'); await refreshInv().catch(() => {}); renderStable();
  };
  const bm = $('btn-mount'); if (bm) bm.onclick = () => toggleMount();
}
async function toggleMount() {
  const r = await gameConn.invoke('ToggleMount');
  if (r.error) { notice(r.error); return; }
  notice(r.mounted ? '🐎 Ata bindin' : '🚶 Attan indin');
  if (!$('stable-win').classList.contains('hidden')) renderStable();
}

/* ---------------- görev takipçisi + günlük + hikaye ---------------- */
function setQuest(q) {
  quest = q;
  renderQuestTrack();
}
function renderQuestTrack() {
  if (!quest) return;
  $('quest-track').classList.remove('hidden');
  $('qt-title').textContent = `📜 ${quest.title}`;
  $('qt-bar').style.width = `${Math.min(100, (quest.progress / quest.target) * 100)}%`;
  $('qt-text').textContent = `${quest.progress} / ${quest.target}`;
}
function toggleQuestWin() {
  const w = $('quest-win');
  if (!w.classList.contains('hidden')) { w.classList.add('hidden'); return; }
  const body = $('quest-body');
  body.innerHTML = '';
  const curIdx = quest ? cfg.quests.findIndex(q => q.code === quest.code) : cfg.quests.length;
  cfg.quests.forEach((q, i) => {
    const cls = i < curIdx ? 'qw-done' : i === curIdx ? 'qw-cur' : 'qw-lock';
    const state = i < curIdx ? '✓' : i === curIdx ? `${quest?.progress ?? 0}/${q.targetCount}` : '🔒';
    body.insertAdjacentHTML('beforeend', `
      <div class="qw-row ${cls}">
        <div class="qw-t">${i + 1}. ${q.title} <span style="float:right">${state}</span></div>
        ${i <= curIdx ? `<div class="qw-s">${q.storyStart}</div>` : ''}
      </div>`);
  });
  w.classList.remove('hidden');
}

let storyQueue = null;
function showStory(title, text, reward, onNext) {
  $('story-title').textContent = title;
  $('story-text').textContent = text;
  $('story-reward').textContent = reward || '';
  storyQueue = onNext || null;
  $('story-win').classList.remove('hidden');
}
$('story-next').addEventListener('click', () => {
  $('story-win').classList.add('hidden');
  const cb = storyQueue;
  storyQueue = null;
  cb && cb();
});
$('btn-skill').addEventListener('click', () => toggleSkillWin());
$('btn-quest').addEventListener('click', () => toggleQuestWin());

/* ---------------- Dükkânlar (silahçı / zırhçı / iksirci / tüccar) ---------------- */
let shopTab = 'buy';
let shopRole = 'tuccar';
const SHOP_INFO = {
  silahci: { title: '⚔️ SILAHÇI DEMİR', buy: true },
  zirhci:  { title: '🛡️ ZIRHÇI TUNÇ', buy: true },
  iksirci: { title: '🧪 İKSİRCİ MEI', buy: true },
  tuccar:  { title: '💰 TÜCCAR HONG', buy: true },
};
function shopRoleFor(type) {
  if (type === 'silah') return 'silahci';
  if (['zirh', 'kalkan', 'kupe', 'kolye', 'bileklik'].includes(type)) return 'zirhci';
  if (['iksir', 'parsomen'].includes(type)) return 'iksirci';
  return 'tuccar';
}
function openShop(role = 'tuccar') {
  shopRole = SHOP_INFO[role] ? role : 'tuccar';
  shopTab = 'buy';
  $('shop-title').textContent = SHOP_INFO[shopRole].title;
  $('shop-win').classList.remove('hidden');
  renderShop();
}
$('tab-buy').addEventListener('click', () => { shopTab = 'buy'; renderShop(); });
$('tab-sell').addEventListener('click', () => { shopTab = 'sell'; renderShop(); });

async function renderShop() {
  $('tab-buy').classList.toggle('on', shopTab === 'buy');
  $('tab-sell').classList.toggle('on', shopTab === 'sell');
  const body = $('shop-body');
  body.innerHTML = '';
  if (shopTab === 'buy') {
    const forSale = cfg.items.filter(i => i.price > 0 && shopRoleFor(i.type) === shopRole);
    if (!forSale.length)
      body.innerHTML = '<div class="panel-empty">Bu tüccar yalnızca eşya alır (SAT sekmesi).</div>';
    for (const it of forSale) {
      body.insertAdjacentHTML('beforeend', `
        <div class="shop-row"><span class="ic">${it.icon}</span>
        <span class="nm">${esc(it.name)}<small>${esc(it.desc)}</small></span>
        <span class="pr">${it.price.toLocaleString('tr')}</span>
        <button data-buy="${it.code}" data-n="1">Al</button>
        <button data-buy="${it.code}" data-n="5">x5</button></div>`);
    }
    body.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      const r = await gameConn.invoke('BuyItem', b.dataset.buy, parseInt(b.dataset.n, 10));
      if (r.error) notice(r.error);
      else notice(`🛒 ${r.name} x${r.count} alındı (-${r.total} yang)`);
      await refreshInv();
      renderShop();
    });
  } else {
    await refreshInv();
    const sellable = invData.items.filter(i => !i.equipped && i.price > 0);
    if (!sellable.length)
      body.innerHTML = '<div class="panel-empty">Satılık bir şeyin yok.</div>';
    for (const it of sellable) {
      const unit = Math.max(1, Math.floor(it.price * 0.4));
      body.insertAdjacentHTML('beforeend', `
        <div class="shop-row"><span class="ic">${it.icon}</span>
        <span class="nm">${esc(it.name)}${it.plus ? ' +' + it.plus : ''} x${it.count}<small>birim: ${unit} yang</small></span>
        <button class="sellb" data-sell="${it.id}" data-n="1">Sat</button>
        <button class="sellb" data-sell="${it.id}" data-n="${it.count}">Hepsi</button></div>`);
    }
    body.querySelectorAll('[data-sell]').forEach(b => b.onclick = async () => {
      const r = await gameConn.invoke('SellItem', b.dataset.sell, parseInt(b.dataset.n, 10));
      if (r.error) notice(r.error);
      else notice(`💰 ${r.name} x${r.count} satıldı (+${r.gain} yang)`);
      await refreshInv();
      renderShop();
    });
  }
  $('shop-yang-val').textContent = (stats?.yang ?? 0).toLocaleString('tr');
}

/* ---------------- Demirci Kaya (+ basma) ---------------- */
function openSmith() {
  $('smith-win').classList.remove('hidden');
  renderSmith();
}
async function renderSmith() {
  await refreshInv();
  const body = $('smith-body');
  body.innerHTML = '';
  const gear = invData.items.filter(i => isEquip(i.type));
  if (!gear.length)
    body.innerHTML = '<div class="panel-empty">+ basılacak ekipmanın yok.</div>';
  const chances = cfg.upgradeChance;
  for (const it of gear) {
    const maxed = it.plus >= cfg.maxPlus;
    const yangCost = 200 * (it.plus + 1) * (it.plus + 1);
    const shardCost = 1 + Math.floor(it.plus / 3);
    const pct = maxed ? 0 : Math.round(chances[it.plus] * 100);
    const cls = it.plus >= 11 ? ' p11' : it.plus >= 10 ? ' p10' : it.plus >= 9 ? ' p9' : '';
    body.insertAdjacentHTML('beforeend', `
      <div class="smith-row">
        <span class="slotbox${cls}">${it.icon}${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}</span>
        <span class="mid"><b>${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</b>${it.equipped ? ' <small>(kuşanılı)</small>' : ''}
          <div class="cost">${maxed ? 'USTALIK (+11)' :
            `→ +${it.plus + 1}: ${yangCost.toLocaleString('tr')} yang + ${shardCost} 💎 · şans %${pct}`}</div>
        </span>
        <button data-up="${it.id}" ${maxed ? 'disabled' : ''}>+ BAS</button>
      </div>`);
  }
  body.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const r = await gameConn.invoke('UpgradeItem', b.dataset.up);
    if (r.error) { notice(r.error); b.disabled = false; return; }
    if (r.success) notice(`⚒️ BAŞARILI! ${r.name} +${r.plus}${r.plus >= 11 ? ' 🔴' : r.plus >= 9 ? ' ✨' : ''}`);
    else notice(`💥 Başarısız... malzemeler yandı (${r.name} +${r.plus} kaldı)`);
    renderSmith();
  });
}

/* ---------------- klavye ---------------- */
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (!gameConn) return;
  const k = e.key.toLocaleLowerCase('tr');
  if (k === 'i' || k === 'ı') { toggleInv(); return; }
  if (k === 'c' || k === 'ç') { toggleChar(); return; }
  if (k === 'k') { toggleSkillWin(); return; }
  if (k === 'j') { toggleQuestWin(); return; }
  if (k === 'm') { toggleMap(); return; }
  if (k === 'h') { if (stats?.hasHorse) toggleMount(); return; }
  if (e.key >= '1' && e.key <= '4') {
    const el = $(`qs-${e.key}`);
    if (el?.dataset.skill) castSkill(el.dataset.skill);
    return;
  }
  if (e.key === '5') { usePotion('hp'); return; }
  if (e.key === '6') { usePotion('mp'); return; }
  if (e.key === 'Escape' && pickedItem) {
    pickedItem = null; ghost.classList.add('hidden'); refreshInv(); return;
  }
  if (e.key === 'Escape' && !$('map-overlay').classList.contains('hidden')) {
    toggleMap(); return;
  }
  if (e.key === 'Escape') {
    targetMobId = null;
    world?.select(null);
    hideTarget();
    gameConn?.invoke('StopAttack');
  }
  if (e.key === 'Enter') $('chat-in').focus();
});

// tarayıcı sağ tık menüsünü kapat (sağ tık = kamera çevirme)
addEventListener('contextmenu', e => e.preventDefault());

// tarayıcı sağ tık menüsünü kapat (sağ tık = kamera çevirme)
addEventListener('contextmenu', e => e.preventDefault());

// test kancası
window.__mmo = () => ({ world, gameConn, chatConn, selfId, stats, cfg });
