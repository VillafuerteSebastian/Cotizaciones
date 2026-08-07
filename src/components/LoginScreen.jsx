import React, { useState } from 'react';
import { login, S } from '../supabaseClient.js';

export default function LoginScreen({ onLogin, onReconfigure }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
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
            <label>Correo</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
