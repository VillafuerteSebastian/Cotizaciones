// Cliente Supabase minimalista: llama directo al REST API y al Auth API
// de Supabase por fetch, sin depender del SDK @supabase/supabase-js.

const ENV_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const S = {
  url: ENV_URL,
  anonKey: ENV_KEY,
  accessToken: '',
  refreshToken: '',
  usingEnv: Boolean(ENV_URL && ENV_KEY),
};

export function loadManualConfig() {
  if (S.usingEnv) return true;
  const raw = localStorage.getItem('sb_config');
  if (!raw) return false;
  const cfg = JSON.parse(raw);
  S.url = cfg.url;
  S.anonKey = cfg.anonKey;
  return true;
}

export function saveManualConfig(url, anonKey) {
  S.url = url;
  S.anonKey = anonKey;
  localStorage.setItem('sb_config', JSON.stringify({ url, anonKey }));
}

export function loadSession() {
  const raw = localStorage.getItem('sb_session');
  if (!raw) return false;
  const ses = JSON.parse(raw);
  S.accessToken = ses.accessToken;
  S.refreshToken = ses.refreshToken;
  return true;
}

export function saveSession() {
  localStorage.setItem(
    'sb_session',
    JSON.stringify({ accessToken: S.accessToken, refreshToken: S.refreshToken })
  );
}

export function clearSession() {
  S.accessToken = '';
  S.refreshToken = '';
  localStorage.removeItem('sb_session');
}

export async function login(email, password) {
  const res = await fetch(`${S.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: S.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'No se pudo iniciar sesión');
  S.accessToken = data.access_token;
  S.refreshToken = data.refresh_token;
  saveSession();
  return data.user;
}

export async function fetchCurrentUser() {
  const res = await fetch(`${S.url}/auth/v1/user`, {
    headers: { apikey: S.anonKey, Authorization: `Bearer ${S.accessToken}` },
  });
  if (!res.ok) throw new Error('sesión inválida');
  return res.json();
}

async function doRefresh() {
  const res = await fetch(`${S.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: S.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: S.refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('sesión expirada');
  S.accessToken = data.access_token;
  S.refreshToken = data.refresh_token;
  saveSession();
  return data;
}

async function rest(path, options = {}, retry = true) {
  const res = await fetch(`${S.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: S.anonKey,
      Authorization: `Bearer ${S.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && retry) {
    await doRefresh();
    return rest(path, options, false);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Error ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => rest(path),
  post: (path, body) =>
    rest(path, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }),
  patch: (path, body) =>
    rest(path, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }),
  del: (path) => rest(path, { method: 'DELETE' }),
};

export async function fetchProfile(userId) {
  const rows = await api.get(`profiles?id=eq.${userId}&select=*`);
  if (!rows[0]) {
    throw new Error('Tu usuario no tiene perfil. Pide al administrador que lo agregue en la tabla profiles.');
  }
  return rows[0];
}
