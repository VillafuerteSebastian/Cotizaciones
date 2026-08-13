import React, { useEffect, useState, useCallback } from 'react';
import { api, setActiveWorker } from '../supabaseClient.js';
import { hashPin } from '../pinUtils.js';
import PinModal from './PinModal.jsx';

export default function QuienEresScreen({ profile, onSelect }) {
  const tabla = profile.role === 'cotizador' ? 'trabajadores_cyber' : 'trabajadores_ocampo';
  const [lista, setLista] = useState(null);
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pinTarget, setPinTarget] = useState(null); // worker pendiente de verificar PIN
  const [setPinFor, setSetPinFor] = useState(null); // worker nuevo (admin bootstrap) al que hay que ponerle PIN

  const load = useCallback(async () => {
    const data = await api.get(`${tabla}?select=*&activo=eq.true&order=nombre.asc`);
    setLista(data);
  }, [tabla]);

  useEffect(() => {
    load();
  }, [load]);

  const proceed = (worker) => {
    setActiveWorker(profile.role, worker);
    onSelect(worker);
  };

  const choose = (worker) => {
    if (worker.pin) {
      setPinTarget(worker);
      return;
    }
    proceed(worker);
  };

  const verifyPin = async (pin) => {
    const hash = await hashPin(pin);
    if (hash !== pinTarget.pin) {
      throw new Error('PIN incorrecto.');
    }
    const w = pinTarget;
    setPinTarget(null);
    proceed(w);
  };

  // Solo para arrancar un equipo vacío (aún no hay nadie, por lo tanto
  // tampoco hay administrador). Una vez hay al menos una persona, agregar
  // gente nueva solo lo puede hacer un administrador desde "Equipo".
  const crearPrimeraPersona = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setErr('');
    setBusy(true);
    try {
      const created = await api.post(tabla, { nombre: nombre.trim() });
      const worker = created[0];
      if (worker.es_administrador) {
        setSetPinFor(worker);
      } else {
        proceed(worker);
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const setBootstrapPin = async (pin) => {
    const hash = await hashPin(pin);
    const updated = await api.patch(`${tabla}?id=eq.${setPinFor.id}`, { pin: hash });
    const w = setPinFor;
    setSetPinFor(null);
    proceed(updated[0] || w);
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
                {w.pin ? ' 🔒' : ''}
              </button>
            ))}
          </div>
        )}

        {lista !== null && lista.length === 0 && (
          <form onSubmit={crearPrimeraPersona}>
            <div className="field">
              <label>Todavía no hay nadie registrado. Agrega tu nombre para empezar</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Guardando…' : 'Continuar'}
            </button>
            <p className="hint" style={{ marginTop: 8 }}>
              Quedarás como administrador de este equipo (eres el primero). Después, solo un administrador
              podrá agregar a los demás desde "Equipo".
            </p>
          </form>
        )}

        {lista !== null && lista.length > 0 && (
          <p className="hint">¿No estás en la lista? Pídele a un administrador que te agregue desde "Equipo".</p>
        )}
      </div>

      {pinTarget && (
        <PinModal
          title={`PIN de ${pinTarget.nombre}`}
          subtitle="Esta persona está protegida con PIN."
          confirmLabel="Entrar"
          onCancel={() => setPinTarget(null)}
          onSubmit={verifyPin}
        />
      )}
      {setPinFor && (
        <PinModal
          title="Crea tu PIN de administrador"
          subtitle="Eres la primera persona de este equipo, así que quedas como administrador. Este PIN se pedirá cada vez que alguien intente seleccionarte."
          confirmLabel="Guardar PIN"
          onCancel={() => proceed(setPinFor)}
          onSubmit={setBootstrapPin}
        />
      )}
    </div>
  );
}
