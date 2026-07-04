// Oyun akışı: giriş, hub bağlantıları, HUD, sohbet, arkadaşlar, envanter.
import { api, setToken, connect, session } from './net.js';
import { World } from './world.js';

const $ = id => document.getElementById(id);
let world = null, gameConn = null, chatConn = null, cfg = null;
let selfId = null, stats = null, targetMobId = null;

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
  });

  gameConn = connect('/hubs/game');
  wireGameEvents();
  chatConn = connect('/hubs/chat');
  wireChatEvents();
  await Promise.all([gameConn.start(), chatConn.start()]);

  const join = await gameConn.invoke('JoinWorld');
  if (join.error) { $('login-err').textContent = join.error; return; }
  selfId = join.self.id;
  world.selfId = selfId;
  world.applySnapshot(join.world);

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
    $('pf-level').textContent = `Sv ${s.level}`;
    $('pf-yang').textContent = `${s.yang.toLocaleString('tr')} Yang`;
  });
  gameConn.on('loot', l => {
    let msg = `+${l.yang} Yang`;
    for (const it of l.items) msg += ` · ${it.name} x${it.count}`;
    addChat({ ch: 'sys', from: 'Ganimet', text: msg });
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
  if (e) $('tf-hp').style.width = `${(e.lastHp / e.maxHp) * 100}%`;
}
function hideTarget() { $('target-frame').classList.add('hidden'); }

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
$('btn-inv').addEventListener('click', () => togglePanel('inv'));
$('btn-board').addEventListener('click', () => togglePanel('board'));
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
  } else if (mode === 'inv') {
    $('panel-title').textContent = 'Envanter';
    const items = await gameConn.invoke('GetInventory');
    body.innerHTML = items.length ? '' : '<div class="panel-empty">Çanta boş — canavar kes!</div>';
    for (const it of items)
      body.insertAdjacentHTML('beforeend', `
        <div class="inv-row"><span class="icon">${it.icon}</span>
        <span>${esc(it.name)}</span><span class="cnt">x${it.count}</span></div>`);
  } else if (mode === 'board') {
    $('panel-title').textContent = 'Sıralama';
    const rows = await api('/api/game/leaderboard');
    body.innerHTML = rows.length ? '' : '<div class="panel-empty">Henüz kimse yok.</div>';
    rows.forEach((r, i) => body.insertAdjacentHTML('beforeend', `
      <div class="lb-row"><span class="rank">${i + 1}.</span>
      <span>${esc(r.name)}</span><span class="lvl">Sv ${r.level}</span></div>`));
  }
}

/* ---------------- klavye ---------------- */
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Escape') {
    targetMobId = null;
    world?.select(null);
    hideTarget();
    gameConn?.invoke('StopAttack');
  }
  if (e.key === 'Enter') $('chat-in').focus();
});

// test kancası
window.__mmo = () => ({ world, gameConn, chatConn, selfId, stats, cfg });
