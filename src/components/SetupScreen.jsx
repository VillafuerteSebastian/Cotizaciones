import React, { useState } from 'react';
import { saveManualConfig } from '../supabaseClient.js';

export default function SetupScreen({ onDone }) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [err, setErr] = useState('');

  const save = () => {
    setErr('');
    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(url.trim())) {
      setErr('La URL debe verse así: https://xxxxxxxx.supabase.co');
      return;
    }
    if (key.trim().length < 20) {
      setErr('Pega la clave anon/public completa (Settings → API en Supabase).');
      return;
    }
    saveManualConfig(url.trim().replace(/\/$/, ''), key.trim());
    onDone();
  };

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <h1>Conectar con Supabase</h1>
        <p className="sub">
          No se detectaron variables de entorno. Pega los datos de tu proyecto (Supabase → Settings → API);
          se guardan solo en este navegador. Para producción, mejor configura VITE_SUPABASE_URL y
          VITE_SUPABASE_ANON_KEY como variables de entorno en Vercel.
        </p>
        {err && <div className="err">{err}</div>}
        <div className="field">
          <label>Project URL</label>
          <input placeholder="https://xxxxxxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="field">
          <label>anon / public key</label>
          <textarea placeholder="eyJhbGciOi..." value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" onClick={save}>
          Continuar
        </button>
      </div>
    </div>
  );
}
