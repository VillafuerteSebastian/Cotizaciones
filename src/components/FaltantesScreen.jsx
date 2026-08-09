import React, { useState } from 'react';
import { api } from '../supabaseClient.js';
import { fmtDateTime } from '../utils.js';

export default function FaltantesScreen({ profile, activeWorker, faltantes, reload, log }) {
  const [producto, setProducto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!producto.trim()) return;
    setBusy(true);
    await api.post('productos_faltantes', {
      producto: producto.trim(),
      notas: notas.trim() || null,
      creado_por: profile.id,
    });
    await log('Agregó faltante', producto.trim());
    setProducto('');
    setNotas('');
    await reload();
    setBusy(false);
  };

  const toggleResuelto = async (f) => {
    await api.patch(`productos_faltantes?id=eq.${f.id}`, { resuelto: !f.resuelto });
    await log(f.resuelto ? 'Reabrió faltante' : 'Resolvió faltante', f.producto);
    await reload();
  };

  const del = async (f) => {
    if (!window.confirm(`¿Eliminar "${f.producto}" de la lista de faltantes?`)) return;
    await api.del(`productos_faltantes?id=eq.${f.id}`);
    await log('Eliminó faltante', f.producto);
    await reload();
  };

  const visibles = faltantes.filter((f) => (verResueltos ? true : !f.resuelto));

  return (
    <div>
      <div className="auth-card" style={{ maxWidth: 480, marginBottom: 22, padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>
          Agregar producto faltante
        </div>
        <form onSubmit={add}>
          <div className="field">
            <label>Producto</label>
            <input required value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Cinta métrica 5m" />
          </div>
          <div className="field">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalle, marca, cuánto se necesita…" />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Agregar a la lista'}
          </button>
        </form>
      </div>

      <div className="row" style={{ alignItems: 'center', marginBottom: 10, maxWidth: 480 }}>
        <span className="section-label" style={{ marginBottom: 0 }}>
          Pendientes ({faltantes.filter((f) => !f.resuelto).length})
        </span>
        <button className="link-btn" style={{ flex: 'none' }} onClick={() => setVerResueltos((v) => !v)}>
          {verResueltos ? 'Ocultar resueltos' : 'Ver resueltos'}
        </button>
      </div>

      <div className="prov-list">
        {visibles.map((f) => (
          <div className="prov-row" key={f.id} style={{ opacity: f.resuelto ? 0.55 : 1 }}>
            <div>
              <div className="name" style={{ textDecoration: f.resuelto ? 'line-through' : 'none' }}>
                {f.producto}
              </div>
              <div className="sub">
                {f.notas ? f.notas + ' · ' : ''}
                {fmtDateTime(f.created_at)}
              </div>
            </div>
            <div className="row" style={{ flex: 'none', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleResuelto(f)}>
                {f.resuelto ? 'Reabrir' : 'Resuelto'}
              </button>
              <button className="x-btn" onClick={() => del(f)} title="Eliminar">
                ✕
              </button>
            </div>
          </div>
        ))}
        {visibles.length === 0 && <div className="empty-col">Nada pendiente 🎉</div>}
      </div>
    </div>
  );
}
