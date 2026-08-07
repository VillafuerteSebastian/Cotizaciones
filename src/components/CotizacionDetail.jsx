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

export default function CotizacionDetail({ id, profile, proveedores, onClose, onChanged, reloadProveedores }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isCotizador = profile.role === 'cotizador';

  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [proveedorId, setProveedorId] = useState('');
  const [precio, setPrecio] = useState('');
  const [notasItem, setNotasItem] = useState('');
  const [nuevoProv, setNuevoProv] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');

  const load = useCallback(async () => {
    const data = await api.get(
      `cotizaciones?id=eq.${id}&select=*,cotizacion_items(*,proveedor:proveedores(nombre),agregado:profiles(nombre))`
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
      let pid = proveedorId || null;
      if (nuevoProv && nuevoProvNombre.trim()) {
        const created = await api.post('proveedores', { nombre: nuevoProvNombre.trim() });
        pid = created[0].id;
        await reloadProveedores();
      }
      await api.post('cotizacion_items', {
        cotizacion_id: id,
        proveedor_id: pid,
        producto: producto.trim(),
        cantidad: Number(cantidad) || 1,
        precio_final: precio === '' ? null : Number(precio),
        notas: notasItem.trim() || null,
        agregado_por: profile.id,
      });
      setProducto('');
      setCantidad(1);
      setProveedorId('');
      setPrecio('');
      setNotasItem('');
      setNuevoProv(false);
      setNuevoProvNombre('');
      await load();
      onChanged();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (itemId) => {
    await api.del(`cotizacion_items?id=eq.${itemId}`);
    await load();
    onChanged();
  };

  const changeEstado = async (estado) => {
    await api.patch(`cotizaciones?id=eq.${id}`, { estado });
    await load();
    onChanged();
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
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', flex: 2 }}>Solicita: {c.solicitante_nombre}</span>
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
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Prov.</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Notas</th>
              <th>Agregado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(c.cotizacion_items || []).map((it) => (
              <tr key={it.id}>
                <td>{it.producto}</td>
                <td>{it.proveedor ? it.proveedor.nombre : '—'}</td>
                <td>{it.cantidad}</td>
                <td>{fmtMoney(it.precio_final)}</td>
                <td className="item-notas">{it.notas || ''}</td>
                <td className="item-time">
                  {fmtDateTime(it.created_at)}
                  <br />
                  {it.agregado ? it.agregado.nombre : ''}
                </td>
                <td>
                  {isCotizador && (
                    <button className="x-btn" onClick={() => deleteItem(it.id)} title="Eliminar">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="total-line">
          <span>Total</span>
          <span>{fmtMoney(total)}</span>
        </div>

        <div className="divider" />
        <div className="section-label">Agregar producto</div>
        {err && <div className="err">{err}</div>}
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
          <div className="row">
            <div className="field">
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
                  <option value="">Sin proveedor asignado</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                  <option value="__nuevo__">+ Agregar proveedor nuevo…</option>
                </select>
              ) : (
                <div className="row">
                  <input
                    autoFocus
                    placeholder="Nombre del proveedor"
                    value={nuevoProvNombre}
                    onChange={(e) => setNuevoProvNombre(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNuevoProv(false);
                      setNuevoProvNombre('');
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <label>Precio final</label>
              <input type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="₡" />
            </div>
          </div>
          <div className="field">
            <label>Notas de proceso (opcional)</label>
            <input
              value={notasItem}
              onChange={(e) => setNotasItem(e.target.value)}
              placeholder="Ej: lo cotiza el jefe, no hay proveedor a la mano"
            />
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar producto'}
          </button>
        </form>

        <div className="divider" />
        <div className="section-label">Notas generales</div>
        <NotasGenerales value={c.notas_generales || ''} onSave={saveNotas} />
      </div>
    </div>
  );
}
