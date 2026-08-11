import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../supabaseClient.js';
import { resizeImageToDataUrl } from '../imageUtils.js';
import { ESTADOS, fmtMoney, fmtDateTime, itemsTotal } from '../utils.js';
import { StatusStepper, Badge } from './StatusStepper.jsx';

function NotasGenerales({ value, onSave, isSolicitante }) {
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
        style={{ minHeight: 90 }}
        placeholder={isSolicitante ? 'Lista de productos a cotizar, uno por línea…' : 'Sin productos anotados.'}
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
          Guardar
        </button>
      )}
    </div>
  );
}

function ImagenInput({ value, onChange }) {
  const [busy, setBusy] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
    } catch (ex) {
      alert(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        handleFile(item.getAsFile());
        return;
      }
    }
  };

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>Foto (opcional)</label>
      {value && (
        <div style={{ marginBottom: 6 }}>
          <img src={value} alt="captura" style={{ maxWidth: 90, maxHeight: 90, borderRadius: 8, border: '1px solid var(--line)' }} />
          <button type="button" className="link-btn" style={{ display: 'block', marginTop: 4 }} onClick={() => onChange(null)}>
            Quitar
          </button>
        </div>
      )}
      <div
        tabIndex={0}
        onPaste={handlePaste}
        style={{
          border: '1px dashed var(--line)',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 12.5,
          color: 'var(--ink-soft)',
          marginBottom: 6,
          outline: 'none',
        }}
      >
        {busy ? 'Procesando…' : 'Haz clic aquí y pega una imagen copiada (Ctrl+V), o elige un archivo abajo'}
      </div>
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => handleFile(e.target.files[0])}
      />
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
  reloadProveedores,
  log,
}) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAddCotizador, setShowAddCotizador] = useState(false);
  const isCotizador = profile.role === 'cotizador';
  const isSolicitante = profile.role === 'solicitante';

  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [imagenSolicitante, setImagenSolicitante] = useState(null);

  const load = useCallback(async () => {
    const data = await api.get(
      `cotizaciones?id=eq.${id}&select=*,cotizacion_items(*,proveedor:proveedores(nombre),cotizado:trabajadores_cyber(nombre))`
    );
    setC(data[0]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addItemSolicitante = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await api.post('cotizacion_items', {
        cotizacion_id: id,
        producto: producto.trim(),
        cantidad: Number(cantidad) || 1,
        imagen: imagenSolicitante || null,
        agregado_por: profile.id,
      });
      setProducto('');
      setCantidad(1);
      setImagenSolicitante(null);
      await load();
      onChanged();
      await log('Agregó producto', `${producto.trim()} (cant. ${cantidad}) en #${c.folio}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

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
        <div className="section-label">{isSolicitante ? 'Productos a cotizar (tu lista)' : 'Productos que pidió Ocampo'}</div>
        <NotasGenerales value={c.notas_generales || ''} onSave={saveNotas} isSolicitante={isSolicitante} />

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
                      <img
                        src={it.imagen}
                        alt={it.producto}
                        style={{ maxWidth: 46, maxHeight: 46, borderRadius: 6, display: 'block', marginBottom: 4 }}
                      />
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

        {isSolicitante && (
          <React.Fragment>
            <div className="divider" />
            <div className="section-label">Agregar producto suelto (opcional)</div>
            <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
              Si prefieres, puedes también usar la lista de "Productos a cotizar" de arriba en vez de esto.
            </p>
            <form onSubmit={addItemSolicitante}>
              <div className="row">
                <div className="field" style={{ flex: 2 }}>
                  <label>Producto</label>
                  <input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej: Fajas de acero 2 pulg." />
                </div>
                <div className="field">
                  <label>Cantidad</label>
                  <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ marginBottom: 14 }}>
                <ImagenInput value={imagenSolicitante} onChange={setImagenSolicitante} />
              </div>
              <button className="btn btn-primary" disabled={busy || !producto.trim()}>
                {busy ? 'Agregando…' : 'Agregar producto'}
              </button>
            </form>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
