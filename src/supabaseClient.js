// Cliente Supabase minimalista: llama directo al REST API y al Auth API
// de Supabase por fetch, sin depender del SDK @supabase/supabase-js.

const ENV_URL = import.meta.env.VITE_SUPABASE_URL || '';
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Supabase Auth siempre necesita un "email" internamente. Como aquí el
// login es por usuario (no correo real), convertimos el usuario a una
// dirección falsa dentro de un dominio interno que nunca recibe correos.
const AUTH_DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'internal.local';

export function usernameToEmail(username) {
  const clean = username.trim().toLowerCase().replace(/\s+/g, '');
  return `${clean}@${AUTH_DOMAIN}`;
}

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

export async function login(username, password) {
  const email = usernameToEmail(username);
  const res = await fetch(`${S.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: S.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Usuario o contraseña incorrectos');
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

async function restRes(path, options = {}, retry = true) {
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
    return restRes(path, options, false);
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Error ${res.status}`);
  }
  return res;
}

async function rest(path, options = {}) {
  const res = await restRes(path, options);
  if (res.status === 204) return null;
  return res.json();
}

// Consulta "de firma": pide la MÍNIMA cantidad de datos posible para saber
// si algo cambió en una tabla, sin descargar las filas completas.
// Devuelve { total, ultimoCambio } usando el header Content-Range que
// PostgREST manda cuando se pide `Prefer: count=exact`.
// El cuerpo de la respuesta es una sola fila con una sola columna, así que
// esta llamada pesa unos ~100 bytes en vez de varios megabytes.
async function firma(tabla, columnaFecha = 'updated_at') {
  const res = await restRes(
    `${tabla}?select=${columnaFecha}&order=${columnaFecha}.desc&limit=1`,
    { headers: { Prefer: 'count=exact' } }
  );
  const rango = res.headers.get('content-range') || '';
  const total = rango.split('/')[1] || '?';
  const filas = await res.json();
  const ultimoCambio = filas && filas[0] ? filas[0][columnaFecha] : '';
  return `${total}|${ultimoCambio}`;
}

export const api = {
  get: (path) => rest(path),
  firma,
  post: (path, body) =>
    rest(path, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }),
  // Igual que post pero le pide a Supabase que NO devuelva la fila creada.
  // Para inserciones cuyo resultado no usamos (bitácora de actividad).
  postMudo: (path, body) =>
    rest(path, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }),
  patch: (path, body) =>
    rest(path, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) }),
  del: (path) => rest(path, { method: 'DELETE' }),
};

// "Quién eres" — la persona real detrás del login compartido.
// Se guarda en este navegador, separado por rol.
export function getActiveWorker(role) {
  const raw = localStorage.getItem(`active_worker_${role}`);
  return raw ? JSON.parse(raw) : null;
}
export function setActiveWorker(role, worker) {
  localStorage.setItem(`active_worker_${role}`, JSON.stringify(worker));
}
export function clearActiveWorker(role) {
  localStorage.removeItem(`active_worker_${role}`);
}

// Bitácora de actividad (control interno, solo la lee Cyber).
export async function logActividad(profile, activeWorker, accion, detalle) {
  try {
    await api.postMudo('actividad', {
      profile_id: profile.id,
      profile_role: profile.role,
      trabajador_nombre: activeWorker ? activeWorker.nombre : null,
      accion,
      detalle: detalle || null,
    });
  } catch (ex) {
    // La bitácora nunca debe romper el flujo principal de la app.
    console.warn('No se pudo registrar actividad:', ex.message);
  }
}

export async function fetchProfile(userId) {
  const rows = await api.get(`profiles?id=eq.${userId}&select=*`);
  if (!rows[0]) {
    throw new Error('Tu usuario no tiene perfil. Pide al administrador que lo agregue en la tabla profiles.');
  }
  return rows[0];
}
