import React, { useState } from 'react';
import { login, S } from '../supabaseClient.js';
import { motion, AnimatePresence } from './Motion.jsx';

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
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <h1>Iniciar sesión</h1>
        <p className="sub">Cotizaciones y encargos del equipo.</p>
        <AnimatePresence>
          {err && (
            <motion.div
              className="err"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.18 }}
            >
              {err}
            </motion.div>
          )}
        </AnimatePresence>
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
          <motion.button
            className="btn btn-primary btn-block"
            disabled={busy}
            whileHover={{ scale: busy ? 1 : 1.015 }}
            whileTap={{ scale: busy ? 1 : 0.985 }}
          >
            {busy ? 'Entrando…' : 'Entrar'}
          </motion.button>
        </form>
        {!S.usingEnv && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button className="link-btn" onClick={onReconfigure}>
              Cambiar proyecto de Supabase
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
