import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper, Badge } from './StatusStepper.jsx';

function NotasGenerales({ value, onSave }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(true);
  useEffect(() => setV(value), [value]);
  return (
    <div className="field">
      <textarea
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        placeholder="Contexto general del encargo…"
      />
      {!saved && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 6 }}
          onClick={async () => {
            await onSave(v);
            setSaved(true);
          }}
        >
          Guardar notas
        </button>
      )}
    </div>
  );
}

// Fila de producto en modo edición para Ocampo (solo producto y cantidad)
function ItemRowEditSolicitante({ it, onSave, onCancel }) {
  const [producto, setProducto] = useState(it.producto);
  const [cantidad, setCantidad] = useState(it.cantidad);
  return (
    <tr>
      <td colSpan={7}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Producto</label>
            <input value={producto} onChange={(e) => setProducto(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Cantidad</label>
            <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => onSave({ producto, cantidad: Number(cantidad) || 1 })}>
            Guardar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

// Fila de producto en modo edición para Cyber (todo excepto cantidad)
function ItemRowEditCotizador({ it, proveedores, trabajadoresCyber, activeWorker, reloadProveedores, onSave, onCancel }) {
  const [proveedorId, setProveedorId] = useState(it.proveedor_id || '');
  const [precio, setPrecio] = useState(it.precio_final ?? '');
  const [notas, setNotas] = useState(it.notas || '');
  const [cotizadoPor, setCotizadoPor] = useState(it.cotizado_por_trabajador_id || (activeWorker ? activeWorker.id : ''));
  const [nuevoProv, setNuevoProv] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');

  const save = async () => {
    let pid = proveedorId || null;
    if (nuevoProv && nuevoProvNombre.trim()) {
      const created = await api.post('proveedores', { nombre: nuevoProvNombre.trim() });
      pid = created[0].id;
      await reloadProveedores();
    }
    onSave({
      proveedor_id: pid,
      precio_final: precio === '' ? null : Number(precio),
      notas: notas.trim() || null,
      cotizado_por_trabajador_id: cotizadoPor || null,
    });
  };

  return (
    <tr>
      <td colSpan={7}>
        <div className="row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Proveedor</label>
            {!nuevoProv ? (
              <select
                value={proveedorId}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') {
                    setNuevoProv(true);
                    setProveedorId('');
                  } else setProveedorId(e.target.value);
                }}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                <option value="__nuevo__">+ Nuevo proveedor…</option>
              </select>
            ) : (
              <div className="row">
                <input autoFocus placeholder="Nombre proveedor" value={nuevoProvNombre} onChange={(e) => setNuevoProvNombre(e.target.value)} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNuevoProv(false)}>
                  x
                </button>
              </div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Precio final</label>
            <input type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="₡" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Cotizado por</label>
            <select value={cotizadoPor} onChange={(e) => setCotizadoPor(e.target.value)}>
              <option value="">— Selecciona —</option>
              {trabajadoresCyber.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Notas de proceso</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: lo cotiza el jefe, no hay proveedor a la mano" />
          </div>
          <button className="btn btn-primary btn-sm" onClick={save}>
            Guardar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function CotizacionDetail({
  id,
  profile,
  activeWorker,
  proveedores,
  trabajadoresCyber,
  onClose,
  onChanged,
  reloadProveedores,
  log,
}) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isCotizador = profile.role === 'cotizador';
  const isSolicitante = profile.role === 'solicitante';

  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState(1);

  const load = useCallback(async () => {
    const data = await api.get(
      `cotizaciones?id=eq.${id}&select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))`
    );
    setC(data[0]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addItem = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('cotizacion_items', {
        cotizacion_id: id,
        producto: producto.trim(),
        cantidad: Number(cantidad) || 1,
        agregado_por: profile.id,
      });
      setProducto('');
      setCantidad(1);
      await load();
      onChanged();
      await log('Agregó producto', `${producto.trim()} (cant. ${cantidad}) en #${c.folio}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const saveItem = async (itemId, patch, itemLabel) => {
    setErr('');
    try {
      await api.patch(`cotizacion_items?id=eq.${itemId}`, patch);
      setEditingId(null);
      await load();
      onChanged();
      await log('Editó producto', `${itemLabel} en #${c.folio}`);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const deleteItem = async (itemId, itemLabel) => {
    if (!window.confirm(`¿Eliminar "${itemLabel}" de esta cotización?`)) return;
    await api.del(`cotizacion_items?id=eq.${itemId}`);
    await load();
    onChanged();
    await log('Eliminó producto', `${itemLabel} en #${c.folio}`);
  };

  const changeEstado = async (estado) => {
    await api.patch(`cotizaciones?id=eq.${id}`, { estado });
    await load();
    onChanged();
    await log('Cambió estado', `#${c.folio} → ${estado}`);
  };

  const saveNotas = async (notas_generales) => {
    await api.patch(`cotizaciones?id=eq.${id}`, { notas_generales });
    onChanged();
  };

  if (!c) return null;
  const total = itemsTotal(c.cotizacion_items);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-top">
          <div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>#{c.folio}</div>
            <h2>{c.titulo}</h2>
          </div>
          <button className="x-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="row" style={{ alignItems: 'center', margin: '10px 0 4px' }}>
          <Badge estado={c.estado} />
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 2 }}>
            {c.escuela} · Solicita: {c.solicitante_nombre}
          </span>
        </div>
        <StatusStepper estado={c.estado} />

        {isCotizador && (
          <div className="row" style={{ marginTop: 12 }}>
            {ESTADOS.map((e) => (
              <button
                key={e.key}
                className={`btn btn-sm ${e.key === c.estado ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => changeEstado(e.key)}
              >
                {e.label}
              </button>
            ))}
          </div>
        )}

        <div className="divider" />
        <div className="section-label">Productos ({(c.cotizacion_items || []).length})</div>
        {err && <div className="err">{err}</div>}
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Prov.</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Notas</th>
              <th>Cotizó / agregado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(c.cotizacion_items || []).map((it) =>
              editingId === it.id ? (
                isSolicitante ? (
                  <ItemRowEditSolicitante
                    key={it.id}
                    it={it}
                    onSave={(patch) => saveItem(it.id, patch, it.producto)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <ItemRowEditCotizador
                    key={it.id}
                    it={it}
                    proveedores={proveedores}
                    trabajadoresCyber={trabajadoresCyber}
                    activeWorker={activeWorker}
                    reloadProveedores={reloadProveedores}
                    onSave={(patch) => saveItem(it.id, patch, it.producto)}
                    onCancel={() => setEditingId(null)}
                  />
                )
              ) : (
                <tr key={it.id}>
                  <td>{it.producto}</td>
                  <td>{it.proveedor ? it.proveedor.nombre : '—'}</td>
                  <td>{it.cantidad}</td>
                  <td>{it.precio_final !== null ? fmtMoney(it.precio_final) : 'Pendiente'}</td>
                  <td className="item-notas">{it.notas || ''}</td>
                  <td className="item-time">
                    {it.cotizado ? it.cotizado.nombre : '—'}
                    <br />
                    {fmtDateTime(it.created_at)}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="x-btn" onClick={() => setEditingId(it.id)} title="Editar">
                        ✎
                      </button>
                      <button className="x-btn" onClick={() => deleteItem(it.id, it.producto)} title="Eliminar">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
        <div className="total-line">
          <span>Total</span>
          <span>{fmtMoney(total)}</span>
        </div>

        {isSolicitante && (
          <React.Fragment>
            <div className="divider" />
            <div className="section-label">Agregar producto a cotizar</div>
            <form onSubmit={addItem}>
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Producto</label>
                  <input required value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Fajas de acero 2 pulg." />
                </div>
                <div className="field">
                  <label>Cantidad</label>
                  <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Agregando…' : 'Agregar producto'}
              </button>
            </form>
          </React.Fragment>
        )}

        <div className="divider" />
        <div className="section-label">Notas generales</div>
        <NotasGenerales value={c.notas_generales || ''} onSave={saveNotas} />
      </div>
    </div>
  );
}
