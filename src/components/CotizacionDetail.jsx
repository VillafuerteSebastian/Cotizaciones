import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../supabaseClient.js';
import { ESTADOS, CANCELADA, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper, Badge } from './StatusStepper.jsx';
import ImagenInput from './ImagenInput.jsx';
import { ImageThumb } from './ImageViewer.jsx';
import { useUI } from './UIProvider.jsx';

function NotasGenerales({ value, imagen, onSave, isSolicitante }) {
  const [v, setV] = useState(value);
  const [img, setImg] = useState(imagen);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    setV(value);
    setImg(imagen);
  }, [value, imagen]);
  return (
    <div className="field">
      <textarea
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          setSaved(false);
        }}
        style={{ minHeight: 90 }}
        placeholder={isSolicitante ? 'Lista de productos a cotizar, uno por línea…' : 'Sin productos anotados.'}
      />
      <div style={{ marginTop: 8 }}>
        <ImagenInput
          value={img}
          onChange={(dataUrl) => {
            setImg(dataUrl);
            setSaved(false);
          }}
          label="Foto de la lista (opcional, ej. captura de Excel)"
        />
      </div>
      {!saved && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 6 }}
          onClick={async () => {
            await onSave(v, img);
            setSaved(true);
          }}
        >
          Guardar
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
      <td colSpan={8}>
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

// Formulario de Cyber: crear o editar un producto cotizado (todos los datos).
function ItemFormCotizador({ initial, proveedores, trabajadoresCyber, activeWorker, reloadProveedores, onSave, onCancel, submitLabel }) {
  const [producto, setProducto] = useState(initial?.producto || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [proveedorId, setProveedorId] = useState(initial?.proveedor_id || '');
  const [precio, setPrecio] = useState(initial?.precio_final ?? '');
  const [cantidad, setCantidad] = useState(initial?.cantidad ?? 1);
  const [notas, setNotas] = useState(initial?.notas || '');
  const [imagen, setImagen] = useState(initial?.imagen || null);
  const [cotizadoPor, setCotizadoPor] = useState(initial?.cotizado_por_trabajador_id || (activeWorker ? activeWorker.id : ''));
  const [nuevoProv, setNuevoProv] = useState(false);
  const [nuevoProvNombre, setNuevoProvNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!producto.trim()) {
      setErr('Escribe el nombre del producto.');
      return;
    }
    setBusy(true);
    try {
      let pid = proveedorId || null;
      if (nuevoProv && nuevoProvNombre.trim()) {
        const created = await api.post('proveedores', { nombre: nuevoProvNombre.trim() });
        pid = created[0].id;
        await reloadProveedores();
      }
      await onSave({
        producto: producto.trim(),
        descripcion: descripcion.trim() || null,
        proveedor_id: pid,
        precio_final: precio === '' ? null : Number(precio),
        cantidad: Number(cantidad) || 1,
        notas: notas.trim() || null,
        imagen: imagen || null,
        cotizado_por_trabajador_id: cotizadoPor || null,
      });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: '#F7F8FA', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      {err && <div className="err">{err}</div>}
      <div className="row">
        <div className="field" style={{ flex: 2 }}>
          <label>Producto</label>
          <input required value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Pizarra acrílica 60x90" />
        </div>
        <div className="field">
          <label>Cantidad disponible</label>
          <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Descripción breve (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Marca, medida, color, etc." />
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
        <div className="field">
          <label>Precio final</label>
          <input type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="₡" />
        </div>
      </div>
      <div className="row">
        <div className="field">
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
        <ImagenInput value={imagen} onChange={setImagen} />
      </div>
      <div className="field">
        <label>Notas de proceso (opcional)</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: precio válido por 8 días" />
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
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
  onTouch,
  reloadProveedores,
  log,
}) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showAddCotizador, setShowAddCotizador] = useState(false);
  const isCotizador = profile.role === 'cotizador';
  const isSolicitante = profile.role === 'solicitante';
  const { confirmar } = useUI();

  const load = useCallback(async () => {
    const data = await api.get(
      `cotizaciones?id=eq.${id}&select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))`
    );
    setC(data[0]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addItemCotizador = async (patch) => {
    await api.post('cotizacion_items', {
      cotizacion_id: id,
      agregado_por: profile.id,
      ...patch,
    });
    setShowAddCotizador(false);
    await load();
    onChanged();
    await log('Agregó producto cotizado', `${patch.producto} en #${c.folio}`);
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
    const ok = await confirmar(`¿Eliminar "${itemLabel}" de esta cotización?`, { confirmLabel: 'Eliminar' });
    if (!ok) return;
    await api.del(`cotizacion_items?id=eq.${itemId}`);
    await load();
    onChanged();
    await log('Eliminó producto', `${itemLabel} en #${c.folio}`);
  };

  const changeEstado = async (estado) => {
    if (onTouch) onTouch(id);
    await api.patch(`cotizaciones?id=eq.${id}`, { estado });
    await load();
    onChanged();
    await log('Cambió estado', `#${c.folio} → ${estado}`);
  };

  const saveNotas = async (notas_generales, imagen_notas) => {
    if (onTouch) onTouch(id);
    await api.patch(`cotizaciones?id=eq.${id}`, { notas_generales, imagen_notas: imagen_notas || null });
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

        {/* Ambos lados pueden mover el estado del encargo. */}
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
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

        {/* La cancelación es aparte del flujo normal: es para cuando el
            encargo no se llegó a pedir o se canceló, y así no se queda
            "abierto" indefinidamente en una de las columnas activas. */}
        <div className="row" style={{ marginTop: 8 }}>
          {c.estado === CANCELADA.key ? (
            <button className="btn btn-ghost btn-sm" onClick={() => changeEstado(ESTADOS[0].key)}>
              ↺ Reabrir cotización
            </button>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => changeEstado(CANCELADA.key)}>
              ✕ Cancelar cotización
            </button>
          )}
        </div>

        <div className="divider" />
        <div className="section-label">{isSolicitante ? 'Productos a cotizar (tu lista)' : 'Productos que pidió Ocampo'}</div>
        <NotasGenerales value={c.notas_generales || ''} imagen={c.imagen_notas || null} onSave={saveNotas} isSolicitante={isSolicitante} />

        <div className="divider" />
        <div className="section-label">Productos cotizados ({(c.cotizacion_items || []).length})</div>
        {err && <div className="err">{err}</div>}
        <div className="table-wrap">
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
                  <tr key={it.id}>
                    <td colSpan={7}>
                      <ItemFormCotizador
                        initial={it}
                        proveedores={proveedores}
                        trabajadoresCyber={trabajadoresCyber}
                        activeWorker={activeWorker}
                        reloadProveedores={reloadProveedores}
                        submitLabel="Guardar cambios"
                        onCancel={() => setEditingId(null)}
                        onSave={(patch) => saveItem(it.id, patch, it.producto)}
                      />
                    </td>
                  </tr>
                )
              ) : (
                <tr key={it.id}>
                  <td>
                    {it.imagen && (
                      <ImageThumb src={it.imagen} alt={it.producto} size={46} style={{ marginBottom: 4 }} />
                    )}
                    {it.producto}
                    {it.descripcion && <div className="item-notas">{it.descripcion}</div>}
                  </td>
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
        </div>
        <div className="total-line">
          <span>Total</span>
          <span>{fmtMoney(total)}</span>
        </div>

        {isCotizador && (
          <React.Fragment>
            <div className="divider" />
            <div className="section-label">Agregar producto cotizado</div>
            {!showAddCotizador ? (
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddCotizador(true)}>
                + Agregar producto
              </button>
            ) : (
              <ItemFormCotizador
                proveedores={proveedores}
                trabajadoresCyber={trabajadoresCyber}
                activeWorker={activeWorker}
                reloadProveedores={reloadProveedores}
                submitLabel="Agregar producto"
                onCancel={() => setShowAddCotizador(false)}
                onSave={addItemCotizador}
              />
            )}
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
