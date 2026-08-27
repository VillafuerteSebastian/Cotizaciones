import React, { useState, useMemo } from 'react';
import { api } from '../supabaseClient.js';
import { fmtDateTime } from '../utils.js';
import Pager, { usePager } from './Pager.jsx';
import { useUI } from './UIProvider.jsx';
import FormModal from './FormModal.jsx';
import { AnimatePresence } from './Motion.jsx';

// 20 artículos por página. La tabla NO tiene scroll propio: la página entera
// crece y se hace scroll normal hacia abajo (clase `no-inner-scroll`).
const POR_PAGINA = 20;

function TablaFaltantes({ titulo, items, onToggle, onDelete, vacio }) {
  const { pageItems, page, setPage, totalPages } = usePager(items, POR_PAGINA);
  return (
    <div className="cat-card" style={{ marginBottom: 0 }}>
      <div className="section-label">
        {titulo} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="empty-col">{vacio}</div>
      ) : (
        <div className="table-wrap table-excel no-inner-scroll">
        <table className="table-mobile-cards">
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
                <td data-label="Producto" style={{ textDecoration: f.resuelto ? 'line-through' : 'none' }}>{f.producto}</td>
                <td data-label="Notas" className="item-notas">{f.notas || '—'}</td>
                <td data-label="Veces">{f.veces_reportado > 1 ? `×${f.veces_reportado}` : '—'}</td>
                <td data-label="Última vez" className="item-time">{fmtDateTime(f.ultima_vez || f.created_at)}</td>
                <td data-label="Acciones">
                  <div className="action-row" style={{ gap: 4 }}>
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

function ReabrirModal({ f, onCancel, onConfirm }) {
  const [notas, setNotas] = useState(f.notas || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(notas);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal title="Reabrir faltante" subtitle={f.producto} onClose={onCancel} maxWidth={440}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Notas (opcional)</label>
          <input autoFocus value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalle, marca, cuánto se necesita…" />
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Aprovecha para actualizar la nota si el texto cambió desde la última vez.
        </p>
        <div className="action-row">
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Guardando…' : 'Reabrir'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </form>
    </FormModal>
  );
}

export default function FaltantesScreen({ profile, activeWorker, faltantes, reload, log, showForm, onCloseForm }) {
  const { confirmar, toast } = useUI();
  const [producto, setProducto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [reabriendo, setReabriendo] = useState(null);

  const coincidencia = useMemo(() => {
    const p = producto.trim().toLowerCase();
    if (!p) return null;
    return faltantes.find((f) => f.producto.trim().toLowerCase() === p) || null;
  }, [producto, faltantes]);

  const limpiar = () => {
    setProducto('');
    setNotas('');
  };

  const add = async (e) => {
    e.preventDefault();
    if (!producto.trim() || coincidencia) return;
    setBusy(true);
    try {
      const guardado = producto.trim();
      await api.post('productos_faltantes', {
        producto: guardado,
        notas: notas.trim() || null,
        creado_por: profile.id,
      });
      await log('Agregó faltante', guardado);
      limpiar();
      await reload();
      onCloseForm();
      toast(`"${guardado}" se agregó a faltantes.`, 'success');
    } catch (ex) {
      toast('No se pudo agregar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const marcarFaltaOtraVez = async (f) => {
    setBusy(true);
    try {
      await api.patch(`productos_faltantes?id=eq.${f.id}`, {
        resuelto: false,
        veces_reportado: (f.veces_reportado || 1) + 1,
        ultima_vez: new Date().toISOString(),
        notas: notas.trim() ? notas.trim() : f.notas,
      });
      await log('Reportó faltante otra vez', f.producto);
      limpiar();
      await reload();
      onCloseForm();
      toast(`"${f.producto}" se reportó otra vez.`, 'success');
    } catch (ex) {
      toast('No se pudo actualizar: ' + ex.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleResuelto = async (f) => {
    if (!f.resuelto) {
      // Marcar como resuelto no necesita tocar la nota.
      await api.patch(`productos_faltantes?id=eq.${f.id}`, { resuelto: true, ultima_vez: new Date().toISOString() });
      await log('Resolvió faltante', f.producto);
      await reload();
      return;
    }
    // Reabrir: a veces el texto de la nota cambió, así que se da la
    // opción de actualizarla antes de confirmar.
    setReabriendo(f);
  };

  const confirmarReabrir = async (nota) => {
    const f = reabriendo;
    if (!f) return;
    try {
      await api.patch(`productos_faltantes?id=eq.${f.id}`, {
        resuelto: false,
        notas: nota.trim() || null,
        ultima_vez: new Date().toISOString(),
      });
      await log('Reabrió faltante', f.producto);
      setReabriendo(null);
      await reload();
    } catch (ex) {
      toast('No se pudo reabrir: ' + ex.message, 'error');
    }
  };

  const del = async (f) => {
    const ok = await confirmar(`¿Eliminar "${f.producto}" de la lista de faltantes?`, { confirmLabel: 'Eliminar' });
    if (!ok) return;
    await api.del(`productos_faltantes?id=eq.${f.id}`);
    await log('Eliminó faltante', f.producto);
    await reload();
  };

  const ordenados = [...faltantes].sort((a, b) => new Date(b.ultima_vez || b.created_at) - new Date(a.ultima_vez || a.created_at));
  const pendientes = ordenados.filter((f) => !f.resuelto);
  const resueltos = ordenados.filter((f) => f.resuelto);

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        {POR_PAGINA} artículos por página. La lista completa se recorre haciendo scroll normal de la página.
      </p>

      <div className="parallel-grid faltantes-grid">
        <TablaFaltantes titulo="Pendientes" items={pendientes} onToggle={toggleResuelto} onDelete={del} vacio="Nada pendiente 🎉" />
        <TablaFaltantes titulo="Resueltos" items={resueltos} onToggle={toggleResuelto} onDelete={del} vacio="Aún no hay nada resuelto." />
      </div>

      <AnimatePresence>
      {showForm && (
        <FormModal
          key="form-faltante"
          title="Nuevo faltante"
          subtitle={activeWorker ? `Reporta: ${activeWorker.nombre}` : null}
          onClose={() => {
            limpiar();
            onCloseForm();
          }}
          maxWidth={440}
        >
          <form onSubmit={add}>
            <div className="field">
              <label>Producto</label>
              <input required autoFocus value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Cinta métrica 5m" />
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
              <button className="btn btn-primary btn-block" disabled={busy || !producto.trim()}>
                {busy ? 'Guardando…' : 'Agregar a la lista'}
              </button>
            )}
          </form>
        </FormModal>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {reabriendo && (
        <ReabrirModal key="form-reabrir" f={reabriendo} onCancel={() => setReabriendo(null)} onConfirm={confirmarReabrir} />
      )}
      </AnimatePresence>
    </div>
  );
}
