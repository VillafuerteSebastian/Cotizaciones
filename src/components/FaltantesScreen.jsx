import React, { useState, useMemo } from 'react';
import { api } from '../supabaseClient.js';
import { fmtDateTime } from '../utils.js';

export default function FaltantesScreen({ profile, activeWorker, faltantes, reload, log }) {
  const [producto, setProducto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [verResueltos, setVerResueltos] = useState(false);

  const coincidencia = useMemo(() => {
    const p = producto.trim().toLowerCase();
    if (!p) return null;
    return faltantes.find((f) => f.producto.trim().toLowerCase() === p) || null;
  }, [producto, faltantes]);

  const add = async (e) => {
    e.preventDefault();
    if (!producto.trim() || coincidencia) return;
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

  const marcarFaltaOtraVez = async (f) => {
    setBusy(true);
    await api.patch(`productos_faltantes?id=eq.${f.id}`, {
      resuelto: false,
      veces_reportado: (f.veces_reportado || 1) + 1,
      ultima_vez: new Date().toISOString(),
      notas: notas.trim() ? notas.trim() : f.notas,
    });
    await log('Reportó faltante otra vez', f.producto);
    setProducto('');
    setNotas('');
    await reload();
    setBusy(false);
  };

  const toggleResuelto = async (f) => {
    await api.patch(`productos_faltantes?id=eq.${f.id}`, { resuelto: !f.resuelto, ultima_vez: new Date().toISOString() });
    await log(f.resuelto ? 'Reabrió faltante' : 'Resolvió faltante', f.producto);
    await reload();
  };

  const del = async (f) => {
    if (!window.confirm(`¿Eliminar "${f.producto}" de la lista de faltantes?`)) return;
    await api.del(`productos_faltantes?id=eq.${f.id}`);
    await log('Eliminó faltante', f.producto);
    await reload();
  };

  const visibles = [...faltantes]
    .filter((f) => (verResueltos ? true : !f.resuelto))
    .sort((a, b) => new Date(b.ultima_vez || b.created_at) - new Date(a.ultima_vez || a.created_at));

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

          {coincidencia ? (
            <div className="err" style={{ background: '#FFF6E5', color: '#8A5A00' }}>
              "{coincidencia.producto}" ya está en la lista
              {coincidencia.veces_reportado > 1 ? ` (reportado ${coincidencia.veces_reportado} veces)` : ''}
              {coincidencia.resuelto ? ', y estaba marcado como resuelto.' : ', todavía está pendiente.'}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ display: 'block', marginTop: 8 }}
                disabled={busy}
                onClick={() => marcarFaltaOtraVez(coincidencia)}
              >
                {busy ? 'Guardando…' : 'Falta otra vez'}
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" disabled={busy || !producto.trim()}>
              {busy ? 'Guardando…' : 'Agregar a la lista'}
            </button>
          )}
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
                {f.veces_reportado > 1 && (
                  <span className="badge" style={{ background: 'var(--c-pedido)', marginLeft: 8, fontSize: 10 }}>
                    ×{f.veces_reportado}
                  </span>
                )}
              </div>
              <div className="sub">
                {f.notas ? f.notas + ' · ' : ''}
                última vez {fmtDateTime(f.ultima_vez || f.created_at)}
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
