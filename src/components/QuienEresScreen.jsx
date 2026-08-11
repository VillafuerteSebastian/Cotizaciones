import React, { useEffect, useState, useCallback } from 'react';
import { api, setActiveWorker } from '../supabaseClient.js';

export default function QuienEresScreen({ profile, onSelect }) {
  const tabla = profile.role === 'cotizador' ? 'trabajadores_cyber' : 'trabajadores_ocampo';
  const [lista, setLista] = useState(null);
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const data = await api.get(`${tabla}?select=*&activo=eq.true&order=nombre.asc`);
    setLista(data);
  }, [tabla]);

  useEffect(() => {
    load();
  }, [load]);

  const choose = (worker, skipPinCheck) => {
    if (worker.pin && !skipPinCheck) {
      const entered = window.prompt(`"${worker.nombre}" está protegido con PIN. Ingresa el PIN para continuar:`);
      if (entered === null) return; // canceló
      if (entered.trim() !== worker.pin) {
        alert('PIN incorrecto.');
        return;
      }
    }
    setActiveWorker(profile.role, worker);
    onSelect(worker);
  };

  const addAndChoose = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setErr('');
    setBusy(true);
    try {
      const created = await api.post(tabla, { nombre: nombre.trim() });
      let worker = created[0];
      if (worker.es_administrador) {
        const pin = window.prompt(
          `Eres la primera persona de este equipo, así que quedas como administrador. Ponle un PIN (4 dígitos o más) para que solo tú puedas seleccionarte:`
        );
        if (pin && pin.trim()) {
          const updated = await api.patch(`${tabla}?id=eq.${worker.id}`, { pin: pin.trim() });
          worker = updated[0];
        }
      }
      choose(worker, true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="centered-screen">
      <div className="auth-card" style={{ maxWidth: 420 }}>
        <h1>¿Quién eres?</h1>
        <p className="sub">
          Esta cuenta ({profile.nombre}) la usan varias personas. Elige tu nombre para llevar control de qué
          hace cada quien. Puedes cambiarlo luego desde el menú.
        </p>
        {err && <div className="err">{err}</div>}
        {lista === null && <p className="hint">Cargando…</p>}
        {lista !== null && lista.length > 0 && (
          <div className="prov-list" style={{ marginBottom: 18 }}>
            {lista.map((w) => (
              <button
                key={w.id}
                className="btn btn-ghost btn-block"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => choose(w)}
              >
                {w.nombre}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={addAndChoose}>
          <div className="field">
            <label>{lista && lista.length > 0 ? 'O agrega a alguien nuevo' : 'Agrega tu nombre'}</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Guardando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
