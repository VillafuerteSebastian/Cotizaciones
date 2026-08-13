import React, { useState } from 'react';
import { login, S } from '../supabaseClient.js';

export default function LoginScreen({ onLogin, onReconfigure }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const user = await login(username, password);
      await onLogin(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <h1>Iniciar sesión</h1>
        <p className="sub">Cotizaciones y encargos del equipo.</p>
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Usuario</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {!S.usingEnv && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button className="link-btn" onClick={onReconfigure}>
              Cambiar proyecto de Supabase
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
