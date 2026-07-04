// Ağ katmanı: REST (gateway üzerinden) + iki SignalR bağlantısı (game, chat).
let token = null;
export const session = { userId: null, username: null };

export function setToken(t, userId, username) {
  token = t;
  session.userId = userId;
  session.username = username;
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* gövde yok */ }
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export function connect(path) {
  return new signalR.HubConnectionBuilder()
    .withUrl(path, { accessTokenFactory: () => token })
    .withAutomaticReconnect()
    .build();
}
