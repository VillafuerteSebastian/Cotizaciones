import React, { useState } from 'react';
import { api } from '../supabaseClient.js';

export default function NuevaCotizacionModal({ profile, solicitantes, onClose, onCreated }) {
  const [titulo, setTitulo] = useState('');
  const [solicitanteId, setSolicitanteId] = useState(profile.role === 'solicitante' ? profile.id : '');
  const [solicitanteNombre, setSolicitanteNombre] = useState(profile.role === 'solicitante' ? profile.nombre : '');
  const [notas, setNotas] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const nombre = solicitanteId
        ? (solicitantes.find((s) => s.id === solicitanteId) || {}).nombre || solicitanteNombre
        : solicitanteNombre;
      if (!nombre.trim()) throw new Error('Indica quién solicita la cotización.');
      const created = await api.post('cotizaciones', {
        titulo: titulo.trim(),
        solicitante_id: solicitanteId || null,
        solicitante_nombre: nombre.trim(),
        creado_por: profile.id,
        notas_generales: notas.trim() || null,
      });
      onCreated(created[0].id);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-top">
          <h2>Nueva cotización</h2>
          <button className="x-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Título / descripción del encargo</label>
            <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Repuestos bomba de agua planta 2" />
          </div>
          <div className="field">
            <label>Solicitante</label>
            <select value={solicitanteId} onChange={(e) => setSolicitanteId(e.target.value)}>
              <option value="">— Otro (escribir nombre) —</option>
              {solicitantes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            {!solicitanteId && (
              <input
                style={{ marginTop: 8 }}
                placeholder="Nombre de quien solicita"
                value={solicitanteNombre}
                onChange={(e) => setSolicitanteNombre(e.target.value)}
              />
            )}
          </div>
          <div className="field">
            <label>Notas generales (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creando…' : 'Crear cotización'}
          </button>
        </form>
      </div>
    </div>
  );
}
