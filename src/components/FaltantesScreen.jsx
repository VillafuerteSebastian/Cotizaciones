import React, { useState, useMemo } from 'react';
import { api } from '../supabaseClient.js';
import { fmtDateTime } from '../utils.js';
import Pager, { usePager } from './Pager.jsx';

function TablaFaltantes({ titulo, items, onToggle, onDelete, vacio }) {
  const { pageItems, page, setPage, totalPages } = usePager(items, 10);
  return (
    <div className="cat-card" style={{ marginBottom: 0 }}>
      <div className="section-label">
        {titulo} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="empty-col">{vacio}</div>
      ) : (
        <div className="table-wrap table-excel">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Notas</th>
              <th>Veces</th>
              <th>Última vez</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((f) => (
              <tr key={f.id}>
                <td style={{ textDecoration: f.resuelto ? 'line-through' : 'none' }}>{f.producto}</td>
                <td className="item-notas">{f.notas || ''}</td>
                <td>{f.veces_reportado > 1 ? `×${f.veces_reportado}` : '—'}</td>
                <td className="item-time">{fmtDateTime(f.ultima_vez || f.created_at)}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onToggle(f)}>
                      {f.resuelto ? 'Reabrir' : 'Resuelto'}
                    </button>
                    <button className="x-btn" onClick={() => onDelete(f)} title="Eliminar">
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default function FaltantesScreen({ profile, activeWorker, faltantes, reload, log }) {
  const [producto, setProducto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

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

  const ordenados = [...faltantes].sort((a, b) => new Date(b.ultima_vez || b.created_at) - new Date(a.ultima_vez || a.created_at));
  const pendientes = ordenados.filter((f) => !f.resuelto);
  const resueltos = ordenados.filter((f) => f.resuelto);

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

      <div className="parallel-grid">
        <TablaFaltantes titulo="Pendientes" items={pendientes} onToggle={toggleResuelto} onDelete={del} vacio="Nada pendiente 🎉" />
        <TablaFaltantes titulo="Resueltos" items={resueltos} onToggle={toggleResuelto} onDelete={del} vacio="Aún no hay nada resuelto." />
      </div>
    </div>
  );
}
